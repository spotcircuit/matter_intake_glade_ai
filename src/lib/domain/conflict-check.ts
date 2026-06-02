/**
 * Conflict-check service.
 *
 * Surfaces party-name matches between an incoming matter and the firm's
 * existing client/matter history. NEVER auto-declines — every match is
 * a flag the attorney reviews.
 *
 * Matching strategy:
 *
 *   - Normalize names (lowercase, strip punctuation + entity suffixes
 *     like "LLC" / "Inc.", collapse whitespace) before comparing.
 *   - Two passes:
 *       1) the prospective client's own name against existing
 *          `clients.name` and against opposing parties in past matters
 *          (representing the other side of a past case)
 *       2) the opposing-party name against `clients.name` (we'd be
 *          opposite a current client) and against opposing parties
 *          in past matters (consistent stance only as far as the
 *          attorney's review of past sides)
 *   - Exact normalized match is a flag. Substring match is a flag with
 *     a "fuzzy" note. We DO NOT do edit-distance — too many false
 *     positives on common surnames.
 *
 * False positives are expected — "John Smith" vs. "John Smith" is two
 * flags worth one attorney click. False negatives (no flag when one
 * was warranted) are the dangerous case; the normalization is designed
 * to be permissive.
 */

import { eq } from "drizzle-orm";
import type { ConflictMatch } from "./types";
import { clients, matters } from "@/lib/db/schema";
import { db } from "@/lib/db/client";

const ENTITY_SUFFIX_RE =
  /\b(llc|llp|inc|inc\.|incorporated|corp|corp\.|corporation|ltd|ltd\.|limited|co|co\.|company|gmbh|plc)\b/gi;

const PUNCT_RE = /[^a-z0-9\s]/g;

const STOPWORDS = new Set(["the", "of", "and", "a", "&"]);

/**
 * Normalize a party name for comparison.
 *
 * Exported because tests pin the behavior here — a single normalization
 * function is the seam this service hangs on.
 */
export function normalizeName(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  const stripped = lower.replace(ENTITY_SUFFIX_RE, " ");
  const noPunct = stripped.replace(PUNCT_RE, " ");
  const tokens = noPunct
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return tokens.join(" ");
}

type Party = { value: string; role: "client" | "opposing" };

function partiesFromIntake(p: {
  clientName: string;
  opposingParty?: string | null;
}): Party[] {
  const out: Party[] = [{ value: p.clientName, role: "client" }];
  if (p.opposingParty && p.opposingParty.trim()) {
    out.push({ value: p.opposingParty.trim(), role: "opposing" });
  }
  return out;
}

/**
 * Run a conflict check against the live DB.
 *
 * Returns an array of `ConflictMatch` records — one per surfaced flag.
 * Empty array means no conflicts found. Caller writes each to
 * `conflict_flags`.
 */
export async function runConflictCheck(intake: {
  clientName: string;
  opposingParty?: string | null;
}): Promise<ConflictMatch[]> {
  const parties = partiesFromIntake(intake);
  const normalizedTargets = parties.map((p) => ({
    ...p,
    norm: normalizeName(p.value),
  }));

  // Single DB read of all clients + all opposing-party strings on
  // existing matters. With a small firm (hundreds of matters) this is
  // fine; if we ever needed to scale, this becomes a paginated cursor
  // or a Postgres full-text search.
  const [existingClients, existingMatters] = await Promise.all([
    db().select({ id: clients.id, name: clients.name }).from(clients),
    db()
      .select({
        opposingParty: matters.opposingParty,
        clientId: matters.clientId,
      })
      .from(matters),
  ]);

  const flags: ConflictMatch[] = [];

  for (const target of normalizedTargets) {
    if (!target.norm) continue;

    for (const c of existingClients) {
      const candidate = normalizeName(c.name);
      if (!candidate) continue;
      const hit = matchKind(target.norm, candidate);
      if (!hit) continue;
      flags.push({
        party: target.value,
        matchedClientId: c.id,
        matchedAgainst: "existing_client",
        note: noteFor({
          target: target.value,
          targetRole: target.role,
          match: c.name,
          matchKind: hit,
          source: "existing client of the firm",
        }),
      });
    }

    for (const m of existingMatters) {
      if (!m.opposingParty) continue;
      const candidate = normalizeName(m.opposingParty);
      if (!candidate) continue;
      const hit = matchKind(target.norm, candidate);
      if (!hit) continue;
      flags.push({
        party: target.value,
        matchedClientId: null,
        matchedAgainst: "existing_opposing_party",
        note: noteFor({
          target: target.value,
          targetRole: target.role,
          match: m.opposingParty,
          matchKind: hit,
          source: "opposing party in a prior matter",
        }),
      });
    }
  }

  return dedupeFlags(flags);
}

// ---------- Pure helpers (testable in isolation) ----------

export type MatchKind = "exact" | "fuzzy";

export function matchKind(a: string, b: string): MatchKind | null {
  if (!a || !b) return null;
  if (a === b) return "exact";
  // Single-token names risk too many false positives — require multi-token
  // overlap or substring of a multi-word phrase.
  const aTokens = a.split(" ").filter((t) => t.length > 0);
  const bTokens = b.split(" ").filter((t) => t.length > 0);
  if (aTokens.length < 2 && bTokens.length < 2) return null;
  if (a.includes(b) || b.includes(a)) return "fuzzy";
  return null;
}

function noteFor(args: {
  target: string;
  targetRole: "client" | "opposing";
  match: string;
  matchKind: MatchKind;
  source: string;
}): string {
  const role =
    args.targetRole === "client"
      ? "Prospective client"
      : "Opposing party on this intake";
  const fuzzy = args.matchKind === "fuzzy" ? " (fuzzy match)" : "";
  return `${role} "${args.target}" matches ${args.source} "${args.match}"${fuzzy}. Verify whether prior representation creates a conflict before accepting.`;
}

function dedupeFlags(flags: ConflictMatch[]): ConflictMatch[] {
  const seen = new Set<string>();
  const out: ConflictMatch[] = [];
  for (const f of flags) {
    const key = `${f.party}::${f.matchedAgainst}::${f.matchedClientId ?? ""}::${f.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// ---------- Drizzle helper for the "is this exact same intake?" check ----------

/**
 * Return the matter id of any intake_review row whose client has the
 * same email AND whose raw_description is byte-identical to `desc`,
 * created within the last 5 minutes. Used to short-circuit duplicate
 * form submissions.
 *
 * Time-boxed because true duplicate submissions almost always happen
 * back-to-back (refresh, double-click). Two valid intakes 6 hours
 * apart from the same client should both be saved.
 */
export async function findRecentDuplicate(opts: {
  email: string;
  description: string;
  windowMs?: number;
}): Promise<string | null> {
  const windowMs = opts.windowMs ?? 5 * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs);

  const rows = await db()
    .select({
      matterId: matters.id,
      desc: matters.rawDescription,
      createdAt: matters.createdAt,
    })
    .from(matters)
    .innerJoin(clients, eq(matters.clientId, clients.id))
    .where(eq(clients.email, opts.email));

  for (const row of rows) {
    if (
      row.desc.trim() === opts.description.trim() &&
      row.createdAt >= cutoff
    ) {
      return row.matterId;
    }
  }
  return null;
}
