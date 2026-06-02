/**
 * /api/matters
 *
 * GET   — list matters, optional ?status= filter (comma-separated)
 * POST  — submit a new intake; runs Zod → intake-service → returns
 *         the new matter id + triage outcome
 *
 * Route handlers stay thin: validate → delegate to the domain service
 * → map the outcome to a JSON response. All logic worth testing lives
 * in src/lib/domain/*.
 */

import type { NextRequest } from "next/server";
import { jsonError, jsonOk, mapUnhandled, mapZodError } from "@/server/http";
import { submitIntake } from "@/lib/domain/intake-service";
import { listMatters } from "@/lib/domain/list-service";
import {
  IntakeInputSchema,
  MATTER_STATUSES,
  type MatterStatus,
} from "@/lib/domain/types";

export const runtime = "nodejs";

// ---------- GET /api/matters ----------

export async function GET(req: NextRequest) {
  try {
    const statusParam = req.nextUrl.searchParams.get("status");
    const statuses = parseStatusFilter(statusParam);
    if (statuses === "invalid") {
      return jsonError(
        400,
        "invalid_status",
        `Unknown status. Allowed: ${MATTER_STATUSES.join(", ")}.`,
      );
    }
    const matters = await listMatters(statuses ? { statuses } : undefined);
    return jsonOk({ matters, count: matters.length });
  } catch (err) {
    return mapUnhandled("GET /api/matters", err);
  }
}

// ---------- POST /api/matters ----------

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON.");
  }

  const parsed = IntakeInputSchema.safeParse(body);
  if (!parsed.success) {
    return mapZodError(parsed.error);
  }

  try {
    const outcome = await submitIntake(parsed.data);

    if (outcome.kind === "duplicate") {
      return jsonOk(
        {
          matterId: outcome.matterId,
          kind: "duplicate" as const,
          message:
            "An identical intake from this email was submitted in the last 5 minutes; returning the existing matter.",
        },
        200,
      );
    }

    return jsonOk(
      {
        matterId: outcome.matterId,
        kind: "created" as const,
        triage: {
          ok: outcome.triage.ok,
          reason: outcome.triage.ok ? null : outcome.triage.reason,
          message: outcome.triage.ok ? null : outcome.triage.message,
        },
        conflictCount: outcome.conflictCount,
      },
      201,
    );
  } catch (err) {
    return mapUnhandled("POST /api/matters", err);
  }
}

// ---------- helpers ----------

function parseStatusFilter(
  raw: string | null,
): MatterStatus[] | null | "invalid" {
  if (!raw) return null;
  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as MatterStatus[];
  for (const s of requested) {
    if (!(MATTER_STATUSES as readonly string[]).includes(s)) return "invalid";
  }
  return requested.length > 0 ? requested : null;
}
