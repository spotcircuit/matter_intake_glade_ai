# Matter Intake & Triage

AI-assisted client intake for a small law firm. A prospective client (or intake coordinator) describes a legal situation in plain language; the app classifies the matter, extracts structured facts, flags urgency, runs a conflict check against existing clients, and produces a triaged record for an attorney to accept or decline.

**The AI is an assistant, not a decider.** Every matter gets reviewed by a human.

> 🚧 Work in progress — currently at **M1 (scaffold)**. M2–M6 land in subsequent commits.

## Run it locally

```bash
cp .env.example .env.local
# Fill in DATABASE_URL (Neon) and ANTHROPIC_API_KEY
npm install
npm run db:generate    # generate SQL migrations from drizzle schema (after M2)
npm run db:migrate     # apply migrations to Neon
npm run db:seed        # load ~8 sample matters (after M2)
npm run dev            # http://localhost:3000
```

## Stack

- **Next.js 16** (App Router) + TypeScript + React 19
- **Tailwind CSS v4**
- **Neon** (serverless Postgres) via `@neondatabase/serverless`
- **Drizzle ORM** — schema, migrations, typed queries
- **Zod** — request validation + AI structured-output validation
- **Anthropic SDK** — `claude-sonnet-4-6` via tool use for classification + extraction
- **Vitest** — unit tests on triage + conflict-check logic
- **Vercel** — deploy target

## Out of scope (deliberate)

- Billing / time tracking
- Document upload / OCR
- Multi-tenant orgs (single seeded firm only)
- Real e-signature
- Calendar integration
- Production auth (no auth at all in this demo; see "Auth" below)

These are real-product needs but each is its own design problem. Focus here is the intake → triage → accept/decline loop done well.

## Auth

**The demo has no authentication.** Anyone with the URL can submit an intake and any attorney can accept/decline from the dashboard. This is deliberate for a take-home demo and is the obvious production next step.

A real deployment would need: multi-tenant firms (org → users → matters), role-based access (intake coordinator vs. attorney vs. admin), audit trails per actor, and SSO. Each of those is straightforward but each adds enough surface area to obscure the actual triage logic that's being evaluated.

## More to come

- M2: Drizzle schema + Neon connection + seed data
- M3: Domain services (AI classify+extract, conflict check, triage)
- M4: Route handlers (`POST /api/matters`, list, `PATCH` for accept/decline)
- M5: UI (intake form, triage dashboard, matter review)
- M6: Tests, README expansion, polish
