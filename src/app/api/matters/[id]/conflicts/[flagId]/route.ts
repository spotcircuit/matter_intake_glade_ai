/**
 * DELETE /api/matters/:id/conflicts/:flagId
 *
 * Dismiss a conflict flag with an optional reasoning note. Deletes
 * the flag row and writes an audit_log entry.
 *
 * Body (all optional):
 *   { note: string }
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, mapUnhandled, mapZodError } from "@/server/http";
import { dismissConflictFlag } from "@/lib/domain/dismiss-conflict";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const DismissBodySchema = z
  .object({
    note: z.string().trim().max(2_000).optional(),
  })
  .optional();

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; flagId: string }> },
) {
  const { id, flagId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(flagId)) {
    return jsonError(400, "invalid_id", "Matter id and flag id must be UUIDs.");
  }

  // Body is optional — accept empty + JSON-parse failures the same way.
  let body: unknown = undefined;
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON.");
  }

  const parsed = DismissBodySchema.safeParse(body);
  if (!parsed.success) return mapZodError(parsed.error);

  try {
    const outcome = await dismissConflictFlag({
      matterId: id,
      flagId,
      note: parsed.data?.note,
    });
    if (!outcome.ok) {
      return jsonError(404, outcome.reason, outcome.message);
    }
    return jsonOk({ matterId: outcome.matterId });
  } catch (err) {
    return mapUnhandled("DELETE /api/matters/:id/conflicts/:flagId", err);
  }
}
