/**
 * /api/matters/:id
 *
 * GET    — fetch one matter (denormalized: client + facts + flags)
 * PATCH  — attorney decision: accept / decline with optional note
 *
 * PATCH body shape:
 *   { decision: "accept" | "decline", note?: string }
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, mapUnhandled, mapZodError } from "@/server/http";
import { getMatterById } from "@/lib/domain/list-service";
import { decideOnMatter } from "@/lib/domain/decision-service";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const DecisionBodySchema = z.object({
  decision: z.enum(["accept", "decline"]),
  note: z.string().trim().max(2_000).optional(),
});

// ---------- GET /api/matters/:id ----------

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) {
      return jsonError(400, "invalid_id", "Matter id must be a UUID.");
    }
    const matter = await getMatterById(id);
    if (!matter) {
      return jsonError(404, "not_found", "Matter not found.");
    }
    return jsonOk({ matter });
  } catch (err) {
    return mapUnhandled("GET /api/matters/:id", err);
  }
}

// ---------- PATCH /api/matters/:id ----------

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return jsonError(400, "invalid_id", "Matter id must be a UUID.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON.");
  }

  const parsed = DecisionBodySchema.safeParse(body);
  if (!parsed.success) {
    return mapZodError(parsed.error);
  }

  try {
    const outcome = await decideOnMatter({
      matterId: id,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    if (!outcome.ok) {
      const status = outcome.reason === "not_found" ? 404 : 409;
      return jsonError(status, outcome.reason, outcome.message);
    }
    return jsonOk({
      matterId: outcome.matterId,
      newStatus: outcome.newStatus,
    });
  } catch (err) {
    return mapUnhandled("PATCH /api/matters/:id", err);
  }
}
