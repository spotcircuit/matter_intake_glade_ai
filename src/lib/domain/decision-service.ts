/**
 * Attorney decision service — wraps the accept / decline transitions.
 *
 * Every transition writes an audit-log row. The AI's classification is
 * never overwritten; the attorney's decision is a separate state change.
 *
 * Allowed transitions:
 *   intake_review        → active     (accept)
 *   intake_review        → declined   (decline)
 *   needs_manual_review  → active     (accept after manual classification)
 *   needs_manual_review  → declined   (decline)
 *
 * Anything else returns `not_allowed` — we don't reopen declined
 * matters or move active → declined here (those are different states
 * with different audit semantics and aren't in the demo scope).
 */

import { eq } from "drizzle-orm";
import { auditLog, matters } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import type { MatterStatus } from "./types";

export type Decision = "accept" | "decline";

export type DecisionOutcome =
  | { ok: true; matterId: string; newStatus: MatterStatus }
  | { ok: false; reason: "not_found" | "not_allowed"; message: string };

const ACCEPT_FROM: ReadonlyArray<MatterStatus> = [
  "intake_review",
  "needs_manual_review",
];

export async function decideOnMatter(args: {
  matterId: string;
  decision: Decision;
  note?: string;
  actor?: string;
}): Promise<DecisionOutcome> {
  const actor = args.actor ?? "attorney_demo";

  const existing = await db()
    .select({ id: matters.id, status: matters.status })
    .from(matters)
    .where(eq(matters.id, args.matterId))
    .limit(1);

  if (!existing[0]) {
    return { ok: false, reason: "not_found", message: "Matter not found." };
  }

  const current = existing[0].status;
  if (!ACCEPT_FROM.includes(current)) {
    return {
      ok: false,
      reason: "not_allowed",
      message: `Matter is in status '${current}' — only intake_review or needs_manual_review can be decided here.`,
    };
  }

  const newStatus: MatterStatus =
    args.decision === "accept" ? "active" : "declined";

  await db()
    .update(matters)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(matters.id, args.matterId));

  await db()
    .insert(auditLog)
    .values({
      matterId: args.matterId,
      action: args.decision === "accept" ? "accepted" : "declined",
      actor,
      note: args.note?.trim() || null,
    });

  return { ok: true, matterId: args.matterId, newStatus };
}
