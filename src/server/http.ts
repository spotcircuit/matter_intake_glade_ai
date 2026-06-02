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
 *
 * For Drizzle / DB errors specifically, the useful information lives
 * in `err.cause` (the underlying Postgres / Neon driver error). We
 * surface that in the response body too — the alternative is "Failed
 * query: ..." with the SQL but no error code, which is useless for
 * debugging.
 */
export function mapUnhandled(scope: string, err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? extractCause(err) : null;
  console.error(`[${scope}] unhandled:`, err);
  if (cause) console.error(`[${scope}] cause:`, cause);
  return jsonError(500, "server_error", `Server error in ${scope}: ${message}`, {
    cause,
  });
}

function extractCause(err: Error): string | null {
  const cause = (err as { cause?: unknown }).cause;
  if (!cause) return null;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${code}: ${cause.message}` : cause.message;
  }
  return String(cause);
}
