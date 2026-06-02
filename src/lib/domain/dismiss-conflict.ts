/**
 * Dismiss-conflict service.
 *
 * Surfaced action for: "I've reviewed this conflict flag and determined
 * it's not a real conflict — here's why."
 *
 * What happens:
 *
 *   - The flag row is deleted from `conflict_flags` (so the dashboard
 *     badge clears + the decision panel stops nagging).
 *   - An audit-log row records the dismissal with the attorney's
 *     reasoning. This is the durable record — six months later in a
 *     malpractice review, "Flag dismissed by attorney on 2026-06-02
 *     with reason: different defendant, no shared representation"
 *     reads much better than "Flag never appeared / was silently
 *     ignored."
 *
 * Why DELETE instead of marking resolved with a flag:
 *   - The audit log IS the historical record. The conflict_flags table
 *     is operational state ("what does the attorney still need to
 *     resolve"). Conflating the two would have meant a `resolved_at`
 *     column + a `resolved_note` column + a UI that hides resolved
 *     flags differently, and the audit log would still need to record
 *     the action for the malpractice trail. So we'd be storing the
 *     same information twice. DELETE keeps the operational view clean
 *     and the audit log authoritative.
 *
 * Constraint: the flag must belong to the matter the caller named in
 * the URL. Without this check, a guessed flag id would let someone
 * dismiss flags across matters. Belt-and-suspenders.
 */

import { and, eq } from "drizzle-orm";
import { auditLog, conflictFlags } from "@/lib/db/schema";
import { db } from "@/lib/db/client";

export type DismissOutcome =
  | { ok: true; matterId: string }
  | { ok: false; reason: "not_found"; message: string };

export async function dismissConflictFlag(args: {
  matterId: string;
  flagId: string;
  note?: string;
  actor?: string;
}): Promise<DismissOutcome> {
  const actor = args.actor ?? "attorney_demo";

  // Verify the flag belongs to this matter before deleting.
  const existing = await db()
    .select({
      id: conflictFlags.id,
      matchedParty: conflictFlags.matchedParty,
    })
    .from(conflictFlags)
    .where(
      and(
        eq(conflictFlags.id, args.flagId),
        eq(conflictFlags.matterId, args.matterId),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    return {
      ok: false,
      reason: "not_found",
      message: "Conflict flag not found on this matter (may have been dismissed already).",
    };
  }

  await db().delete(conflictFlags).where(eq(conflictFlags.id, args.flagId));

  await db()
    .insert(auditLog)
    .values({
      matterId: args.matterId,
      action: "conflict_flag_dismissed",
      actor,
      note:
        args.note?.trim()
          ? `Flag for "${existing[0].matchedParty}" dismissed. Reason: ${args.note.trim()}`
          : `Flag for "${existing[0].matchedParty}" dismissed without recorded reason.`,
    });

  return { ok: true, matterId: args.matterId };
}
