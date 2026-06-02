/**
 * Drizzle + Neon serverless client.
 *
 * Lazy-initialized so the module can be imported at build time without
 * blowing up when DATABASE_URL is unset (Vercel's build environment
 * doesn't have runtime env vars unless they're configured for build
 * scope). At request time, `db()` throws a clear error if the URL is
 * missing — that surfaces to the route handler and to the user.
 *
 * The Neon serverless driver uses HTTP fan-out; no connection pool to
 * manage, no warm/cold split. Two function call boundaries (route ->
 * service -> driver) and we're talking to Postgres.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let cached: DB | null = null;

export function db(): DB {
  if (cached) return cached;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (Neon project connection string).",
    );
  }
  const sql = neon(url);
  cached = drizzle(sql, { schema });
  return cached;
}

export { schema };
