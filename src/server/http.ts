/**
 * Small HTTP helpers — uniform JSON responses + an error mapper so
 * route handlers stay one-line.
 *
 * Why not throw + a Next.js middleware error filter: middleware adds
 * indirection that obscures what each route does. The cost of repeating
 * `return jsonError(400, ...)` in two routes is lower than the cost of
 * a middleware that lies about the call shape.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

export function mapZodError(err: ZodError, code = "invalid_request"): NextResponse {
  return jsonError(
    400,
    code,
    "Request body failed validation.",
    err.issues.slice(0, 8).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  );
}

/**
 * Lift a generic thrown error into a 500. Logs to the server console
 * with a stable prefix so production logs are greppable.
 */
export function mapUnhandled(scope: string, err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${scope}] unhandled:`, err);
  return jsonError(500, "server_error", `Server error in ${scope}: ${message}`);
}
