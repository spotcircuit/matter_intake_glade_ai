/**
 * /api/health
 *
 * Diagnostic — confirms that the deployed runtime is actually reading
 * the env vars you expect, without ever returning the secret value.
 *
 * For each secret we report:
 *   - `set`     : whether the var is present and non-empty
 *   - `length`  : the length of the value (so you can compare against
 *                 the length of the key you pasted; "is it 108 chars
 *                 like an Anthropic key, or 30 because something got
 *                 truncated?")
 *   - `suffix`  : the last 4 characters (so you can match against your
 *                 keychain without revealing the whole secret)
 *
 * Hitting GET /api/health on the deployed URL gives you a definitive
 * "yes the runtime is reading the key" answer. The dashboard tells you
 * the var is registered; this tells you the deployed function can see
 * it on this request.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: "nodejs",
    nodeEnv: process.env.NODE_ENV ?? null,
    vercel: {
      env: process.env.VERCEL_ENV ?? null, // 'production' | 'preview' | 'development' | null
      region: process.env.VERCEL_REGION ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    secrets: {
      DATABASE_URL: fingerprint(process.env.DATABASE_URL, { showHost: true }),
      ANTHROPIC_API_KEY: fingerprint(process.env.ANTHROPIC_API_KEY),
      ANTHROPIC_MODEL: {
        set: !!process.env.ANTHROPIC_MODEL,
        value: process.env.ANTHROPIC_MODEL ?? "(default: claude-sonnet-4-6)",
      },
    },
    note: "This route never returns secret values. Length + last-4 + (host for DB URL) is the most we expose.",
  });
}

function fingerprint(
  value: string | undefined,
  opts: { showHost?: boolean } = {},
): {
  set: boolean;
  length: number;
  suffix: string | null;
  host?: string | null;
} {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return {
      set: false,
      length: 0,
      suffix: null,
      ...(opts.showHost ? { host: null } : {}),
    };
  }
  const out: {
    set: boolean;
    length: number;
    suffix: string | null;
    host?: string | null;
  } = {
    set: true,
    length: trimmed.length,
    suffix: trimmed.slice(-4),
  };
  if (opts.showHost) {
    try {
      const u = new URL(trimmed);
      out.host = u.host;
    } catch {
      out.host = "(unparseable)";
    }
  }
  return out;
}
