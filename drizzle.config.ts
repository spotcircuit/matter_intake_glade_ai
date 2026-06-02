import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — used by `drizzle-kit generate` to emit SQL
 * migrations from the schema, and by `drizzle-kit studio` to inspect
 * the live DB.
 *
 * Migrations are applied with the custom `scripts/migrate.ts` runner
 * (driven by @neondatabase/serverless) instead of `drizzle-kit push`,
 * so the migration history is durable and inspectable.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
