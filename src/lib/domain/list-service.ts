/**
 * List service — what the triage dashboard reads.
 *
 * Returns a denormalized view of each matter (client info + extracted
 * facts + conflict flags) sorted by urgency descending. Dashboard cards
 * render directly from this shape.
 *
 * "Sorted by urgency" means High → Medium → Low; within each bucket,
 * newest first. We keep this server-side so the UI doesn't have to
 * know the ordering rules.
 */

import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  clients,
  conflictFlags,
  extractedFacts,
  matters,
  type Client,
  type ConflictFlag,
  type ExtractedFact,
  type Matter,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import type { MatterStatus, Urgency } from "./types";

export type MatterSummary = Matter & {
  client: Pick<Client, "id" | "name" | "email">;
  facts: Pick<ExtractedFact, "key" | "value">[];
  conflicts: Pick<ConflictFlag, "matchedParty" | "note">[];
};

const URGENCY_RANK: Record<Urgency, number> = { High: 3, Medium: 2, Low: 1 };

export async function listMatters(opts?: {
  statuses?: MatterStatus[];
}): Promise<MatterSummary[]> {
  const statuses = opts?.statuses;

  const baseRows = statuses && statuses.length > 0
    ? await db()
        .select()
        .from(matters)
        .innerJoin(clients, eq(matters.clientId, clients.id))
        .where(inArray(matters.status, statuses))
        .orderBy(desc(matters.createdAt))
    : await db()
        .select()
        .from(matters)
        .innerJoin(clients, eq(matters.clientId, clients.id))
        .orderBy(desc(matters.createdAt));

  if (baseRows.length === 0) return [];

  const matterIds = baseRows.map((r) => r.matters.id);

  const [allFacts, allConflicts] = await Promise.all([
    db()
      .select({
        matterId: extractedFacts.matterId,
        key: extractedFacts.key,
        value: extractedFacts.value,
      })
      .from(extractedFacts)
      .where(inArray(extractedFacts.matterId, matterIds)),
    db()
      .select({
        matterId: conflictFlags.matterId,
        matchedParty: conflictFlags.matchedParty,
        note: conflictFlags.note,
      })
      .from(conflictFlags)
      .where(inArray(conflictFlags.matterId, matterIds)),
  ]);

  const factsByMatter = groupBy(allFacts, (f) => f.matterId);
  const conflictsByMatter = groupBy(allConflicts, (c) => c.matterId);

  const summaries: MatterSummary[] = baseRows.map((r) => ({
    ...r.matters,
    client: {
      id: r.clients.id,
      name: r.clients.name,
      email: r.clients.email,
    },
    facts: (factsByMatter.get(r.matters.id) ?? []).map((f) => ({
      key: f.key,
      value: f.value,
    })),
    conflicts: (conflictsByMatter.get(r.matters.id) ?? []).map((c) => ({
      matchedParty: c.matchedParty,
      note: c.note,
    })),
  }));

  // Sort: urgency High → Low, then newest first within bucket. The
  // ORDER BY in SQL handled createdAt — we re-bucket here by urgency.
  summaries.sort((a, b) => {
    const ua = URGENCY_RANK[a.urgency as Urgency] ?? 0;
    const ub = URGENCY_RANK[b.urgency as Urgency] ?? 0;
    if (ua !== ub) return ub - ua;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return summaries;
}

export async function getMatterById(
  id: string,
): Promise<MatterSummary | null> {
  const rows = await db()
    .select()
    .from(matters)
    .innerJoin(clients, eq(matters.clientId, clients.id))
    .where(eq(matters.id, id))
    .limit(1);
  if (!rows[0]) return null;

  const [facts, flags] = await Promise.all([
    db()
      .select({
        matterId: extractedFacts.matterId,
        key: extractedFacts.key,
        value: extractedFacts.value,
      })
      .from(extractedFacts)
      .where(eq(extractedFacts.matterId, id)),
    db()
      .select({
        matterId: conflictFlags.matterId,
        matchedParty: conflictFlags.matchedParty,
        note: conflictFlags.note,
      })
      .from(conflictFlags)
      .where(eq(conflictFlags.matterId, id)),
  ]);

  return {
    ...rows[0].matters,
    client: {
      id: rows[0].clients.id,
      name: rows[0].clients.name,
      email: rows[0].clients.email,
    },
    facts: facts.map((f) => ({ key: f.key, value: f.value })),
    conflicts: flags.map((c) => ({
      matchedParty: c.matchedParty,
      note: c.note,
    })),
  };
}

function groupBy<T, K>(items: T[], keyOf: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const existing = out.get(k);
    if (existing) existing.push(it);
    else out.set(k, [it]);
  }
  return out;
}

// Silence unused sql import (kept for future SQL-shaped sort).
void sql;
