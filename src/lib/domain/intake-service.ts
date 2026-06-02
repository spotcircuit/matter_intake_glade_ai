/**
 * Intake-service — orchestrates the full intake → triage → persist flow.
 *
 * Called by `POST /api/matters`. UI never reaches into this directly;
 * tests can call it with a fixture Anthropic client.
 *
 * Flow:
 *
 *   1. Validate the form input (Zod, at the route boundary).
 *   2. Check for a duplicate submission within the last 5 minutes
 *      from the same email + same description. If found, return the
 *      existing matter — no extra AI call, no extra DB row.
 *   3. Insert or reuse the prospective client (by email).
 *   4. Insert the matter row with `status="intake_review"` and the
 *      raw description, BEFORE running the AI. This guarantees the
 *      attorney can see and act on the matter even if the AI is
 *      unavailable.
 *   5. Call the AI. If it fails, flip status to `needs_manual_review`
 *      and stop — no extracted_facts inserted, no analysis fields
 *      populated. The audit log records the failure.
 *   6. If the AI succeeded, update the matter with analysis fields,
 *      insert extracted_facts rows.
 *   7. Run the conflict check (uses the new matter's parties + the rest
 *      of the DB). Insert any flags found.
 *   8. Append an audit-log entry. Return a summary of what happened.
 *
 * Why this order: the matter row is the unit of work. Everything else
 * is decoration. If the AI is down, we still have a row the attorney
 * can read.
 */

import { eq } from "drizzle-orm";
import {
  auditLog,
  clients,
  conflictFlags,
  extractedFacts,
  matters,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { analyzeIntake } from "./triage";
import { findRecentDuplicate, runConflictCheck } from "./conflict-check";
import type { IntakeInput, TriageResult } from "./types";

export type IntakeOutcome =
  | {
      ok: true;
      kind: "created";
      matterId: string;
      triage: TriageResult;
      conflictCount: number;
    }
  | {
      ok: true;
      kind: "duplicate";
      matterId: string;
    };

export async function submitIntake(input: IntakeInput): Promise<IntakeOutcome> {
  // 1. Duplicate short-circuit
  const dupId = await findRecentDuplicate({
    email: input.clientEmail,
    description: input.description,
  });
  if (dupId) {
    return { ok: true, kind: "duplicate", matterId: dupId };
  }

  // 2. Client (insert if new; reuse if email already present)
  const clientId = await upsertClient(input.clientName, input.clientEmail);

  // 3. Matter row first — so even an AI failure leaves something the
  //    attorney can see.
  const [matterRow] = await db()
    .insert(matters)
    .values({
      clientId,
      rawDescription: input.description,
      opposingParty: input.opposingParty ?? null,
      status: "intake_review",
      urgency: "Medium",
      urgencyReason: "Awaiting AI triage.",
    })
    .returning({ id: matters.id });

  await db().insert(auditLog).values({
    matterId: matterRow.id,
    action: "created",
    actor: "intake_form",
  });

  // 4. AI analysis
  const triage = await analyzeIntake(input);

  if (!triage.ok) {
    await db()
      .update(matters)
      .set({
        status: "needs_manual_review",
        updatedAt: new Date(),
      })
      .where(eq(matters.id, matterRow.id));
    await db()
      .insert(auditLog)
      .values({
        matterId: matterRow.id,
        action: "ai_failure_flagged_for_manual_review",
        actor: "system",
        note: `AI ${triage.reason}: ${triage.message}`,
      });
    // Still run the conflict check — it's pure DB and useful regardless
    // of the AI's status.
    const flags = await persistConflictFlags(matterRow.id, input);
    return {
      ok: true,
      kind: "created",
      matterId: matterRow.id,
      triage,
      conflictCount: flags,
    };
  }

  // 5. AI succeeded — apply structured fields
  const a = triage.analysis;
  await db()
    .update(matters)
    .set({
      matterType: a.matter_type,
      summary: a.summary,
      jurisdiction: a.jurisdiction ?? null,
      urgency: a.urgency,
      urgencyReason: a.urgency_reason,
      classificationConfidence: a.matter_type_confidence.toFixed(3),
      updatedAt: new Date(),
    })
    .where(eq(matters.id, matterRow.id));

  if (a.extracted_facts.length > 0) {
    await db()
      .insert(extractedFacts)
      .values(
        a.extracted_facts.map((f) => ({
          matterId: matterRow.id,
          key: f.key,
          value: f.value,
        })),
      );
  }

  await db()
    .insert(auditLog)
    .values({
      matterId: matterRow.id,
      action: "ai_triage_applied",
      actor: "system",
      note: `matter_type=${a.matter_type} (conf ${a.matter_type_confidence.toFixed(2)}); urgency=${a.urgency}`,
    });

  // 6. Conflict check
  const flags = await persistConflictFlags(matterRow.id, input);

  return {
    ok: true,
    kind: "created",
    matterId: matterRow.id,
    triage,
    conflictCount: flags,
  };
}

// ---------- Helpers ----------

async function upsertClient(name: string, email: string): Promise<string> {
  // Email is the natural uniqueness signal here; a future prod build
  // would add a unique constraint + onConflictDoUpdate. For the demo
  // we just look up first — keeps the code obvious.
  const existing = await db()
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.email, email))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db()
    .insert(clients)
    .values({ name, email })
    .returning({ id: clients.id });
  return created.id;
}

async function persistConflictFlags(
  matterId: string,
  input: IntakeInput,
): Promise<number> {
  const flags = await runConflictCheck({
    clientName: input.clientName,
    opposingParty: input.opposingParty ?? null,
  });
  if (flags.length === 0) return 0;

  await db()
    .insert(conflictFlags)
    .values(
      flags.map((f) => ({
        matterId,
        matchedParty: f.party,
        matchedClientId: f.matchedClientId,
        note: f.note,
      })),
    );
  await db()
    .insert(auditLog)
    .values({
      matterId,
      action: "conflict_flag_raised",
      actor: "system",
      note: `${flags.length} conflict flag(s) raised.`,
    });
  return flags.length;
}
