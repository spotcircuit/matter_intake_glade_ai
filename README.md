# Matter Intake & Triage

AI-assisted client intake for a small law firm. A prospective client (or an intake coordinator) describes a legal situation in plain language; the app classifies the matter, extracts structured facts, flags urgency, runs a conflict check against existing clients, and produces a triaged record an attorney can accept or decline.

**The AI is an assistant, not a decider.** Every matter is reviewed by a human before any next step.

## The problem

Small law firms field a steady trickle of intake emails / phone notes / web-form descriptions. Each one needs to be classified, checked for conflicts of interest, prioritized, and either picked up or referred out. Doing that by hand is slow, inconsistent, and the conflict-check step is the kind of thing humans miss when they're tired.

The app solves three concrete pain points:

1. **Free text → structured record**, in one pass — matter type, jurisdiction, key dates, monetary amounts, urgency. The attorney scans 10 seconds of structured fields instead of 200 words of prose.
2. **Conflict check on every intake**, automatically — name-match against existing clients and against opposing parties from past matters. False positives are fine; false negatives (silently missed conflicts) are not.
3. **A queue, not an inbox** — matters sorted by urgency, attorney accepts or declines with one click and an optional note, every transition logged to an audit trail.

The AI never auto-decides. Even on a perfectly classified high-confidence intake, the attorney still has to click Accept.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  UI (Next.js App Router, React, Tailwind v4)                 │
│  /intake          /dashboard          /matters/[id]          │
│  client form      server-rendered     server-rendered +      │
│                                       client decision panel  │
└──────────┬────────────┬────────────────────┬─────────────────┘
           │            │                    │
           ▼            ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│  Route handlers (src/app/api/matters)                        │
│  POST /api/matters                  GET /api/matters         │
│  PATCH /api/matters/[id]            GET /api/matters/[id]    │
│  Thin: validate w/ Zod → delegate → map outcome → JSON       │
└──────────┬─────────────────────────────────┬─────────────────┘
           │                                 │
           ▼                                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Domain services (src/lib/domain) — no HTTP, no React        │
│                                                              │
│  intake-service.ts   submitIntake() — duplicate check        │
│                      → upsert client → INSERT matter         │
│                      → analyzeIntake → conflict check        │
│                      → audit log                             │
│                                                              │
│  triage.ts           analyzeIntake() — Anthropic tool use,   │
│                      Zod validates every response. Failures  │
│                      become TriageFailure, never bad rows.   │
│                                                              │
│  conflict-check.ts   normalizeName + matchKind helpers       │
│                      runConflictCheck() against live DB      │
│                                                              │
│  decision-service.ts decideOnMatter() — accept/decline       │
│                      with allowed-transition guard           │
│                                                              │
│  list-service.ts     listMatters() + getMatterById()         │
└──────────┬───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Data layer (src/lib/db) — Drizzle ORM + @neondatabase       │
│  schema.ts: clients, matters, extracted_facts,               │
│              conflict_flags, audit_log                       │
│  client.ts: lazy-init `db()` reads DATABASE_URL at request   │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
       Neon (serverless Postgres)
```

The seam between the route handler and the domain service is the seam everything else hangs on. Route handlers are 20 lines apiece — parse a body, call a function, format a response. Tests and the migration runner reuse the same services with zero ceremony.

## Data model

Drizzle schema at [`src/lib/db/schema.ts`](src/lib/db/schema.ts). Five tables, three Postgres enums.

```
clients                       matters
  id (uuid, pk)                 id (uuid, pk)
  name                          client_id  →  clients.id  (cascade)
  email                         matter_type ENUM nullable
  created_at                    summary
                                jurisdiction
                                urgency ENUM (Low/Medium/High)
                                urgency_reason
                                status ENUM (intake_review/active/
                                             declined/needs_manual_review)
                                raw_description
                                opposing_party
                                classification_confidence NUMERIC(4,3)
                                created_at, updated_at

extracted_facts               conflict_flags
  id                            id
  matter_id  →  matters.id      matter_id  →  matters.id
  key                           matched_party
  value                         matched_client_id  →  clients.id (set null)
                                note

audit_log
  id
  matter_id  →  matters.id
  action          ('created', 'accepted', 'declined',
                   'conflict_flag_raised', 'ai_triage_applied',
                   'ai_failure_flagged_for_manual_review')
  actor           ('intake_form', 'system', 'attorney_demo')
  note
  created_at
```

**Choices worth flagging:**

- `matter_type` is nullable. A failed AI classification still gets a row — the attorney hand-classifies. Refusing to insert when the AI failed would be a worse outcome than a row with a null field.
- `extracted_facts` is a flat key/value table, not a JSON column. Reason: queryable, indexable on `key`. "Show me every matter with a `court_date`" is one `WHERE` clause, not a JSON-path expression that breaks when the shape drifts.
- `classification_confidence` is `NUMERIC(4,3)`, not a float. Drizzle returns it as a string; the app coerces to `Number` at display time. Avoids float-comparison surprises if we ever start filtering on it.
- `status` includes `needs_manual_review` as a real fourth state, not "intake_review with extra context." The dashboard treats it differently; the audit log records the AI failure as a distinct action.
- All FKs cascade on the `matters` children, so deleting a test row is one statement. `matched_client_id` is `SET NULL` instead of `CASCADE` — a deleted client shouldn't wipe historical conflict flags.

## Key tradeoffs

### 1. AI suggests; the attorney decides

Hard-wired into the architecture. The matter row is created **before** the AI call, with `status="intake_review"`. If the AI is unreachable or returns garbage, the matter still exists, and the dashboard surfaces it with a clear "needs manual review" badge. The AI's output is only ever attached to a matter that already exists; the AI cannot prevent intake from working.

The UI reinforces this: every AI-populated field on the matter-review page is labelled "AI suggestion — advisory only" and sits above the attorney decision panel. The attorney's accept/decline is the source-of-truth state transition.

### 2. Anthropic tool use, never raw text

`analyzeIntake()` calls Claude with a forced `tool_choice` pointing at a single tool whose input schema mirrors `TriageAnalysisSchema`. The response is parsed straight from `tool_use.input` and validated with Zod before it leaves the function. Schema mismatches → `TriageFailure` → `needs_manual_review`. There is no JSON-from-text-block parsing path.

### 3. Conflict check: false positives are cheap, false negatives are not

`normalizeName()` is intentionally permissive — strips entity suffixes (LLC, Inc, GmbH), drops common stopwords (the, of, and), strips punctuation. `matchKind()` returns `exact` for normalized equality and `fuzzy` for substring matches where at least one side is multi-token. We deliberately **don't** do edit-distance / Levenshtein — it generates noise on common surnames and the attorney's trust is the thing being protected.

A false positive costs one click. A false negative is a malpractice exposure. The bias is correct.

### 4. Failure modes are typed, not exceptional

`TriageResult` is a tagged union (`ok | failure-with-reason`). Reasons are an explicit enum: `refused`, `invalid_json`, `schema`, `network`, `auth`, `unknown`. Every error path is named and is a normal return value. Callers handle each branch instead of catching `Error` and hoping.

### 5. Duplicate-submission window

`findRecentDuplicate()` returns the existing matter id when the same email submits the byte-identical description within the last 5 minutes. Form double-submits and double-clicks turn into a friendly "we already have this one" instead of two adjacent rows. After the window, two genuinely-similar intakes are both kept — better to over-keep than to silently drop a real second submission.

## Run it locally

```bash
git clone https://github.com/spotcircuit/matter_intake_glade_ai.git
cd matter_intake_glade_ai

cp .env.example .env.local
# Fill in DATABASE_URL (Neon project pooled URL) and ANTHROPIC_API_KEY

npm install
npm run db:generate        # generate SQL migrations from the schema (already committed)
npm run db:migrate         # apply migrations to your Neon DB
npm run db:seed            # load 4 existing clients + 8 sample matters

npm run dev                # http://localhost:3000
```

**The seed includes a deliberate conflict-check hit** — matter `m2` (Patrick O'Hara) names "Acme Industries" as the opposing party, and "Acme Industries" is also seeded as an existing client of the firm. Open the dashboard after seeding and you'll see the rose conflict-flag badge on the O'Hara row immediately.

### Live URL

Deploy to Vercel by connecting the repo and setting `DATABASE_URL` + `ANTHROPIC_API_KEY` in the project's environment. The Node runtime is required for the Anthropic SDK + Neon driver (both route files declare `export const runtime = "nodejs"`).

## Tests

```bash
npm run test          # vitest run — 27 tests
npm run typecheck     # tsc --noEmit
npm run build         # next build
```

Two test files:

- [`tests/conflict-check.test.ts`](tests/conflict-check.test.ts) — pins the boundary logic of `normalizeName` (entity-suffix stripping, stopwords, punctuation) and `matchKind` (exact / fuzzy / null on single-token false positives). These are the functions the attorney's trust hangs on.
- [`tests/triage-validation.test.ts`](tests/triage-validation.test.ts) — `IntakeInputSchema` (empty / too-short descriptions, bad emails, empty-string opposing-party → undefined) and `TriageAnalysisSchema` (taxonomy enforcement on `matter_type` and `urgency`, confidence in [0,1], snake_case fact keys, the 40-fact cap).

Live-API integration with Anthropic is not in the test suite — those calls cost real money and depend on network. They're exercised by manual smoke once `ANTHROPIC_API_KEY` is set.

## Edge cases handled

- **Empty / garbage descriptions** — Zod rejects at the route boundary with field-level errors surfaced in the form. The AI never sees them.
- **No jurisdiction inferable** — system prompt instructs Claude to return `null` rather than guess. UI renders "—".
- **Low AI confidence** — surfaces a "Low confidence" amber badge on the dashboard card and a "verify" hint on the matter detail when `classification_confidence < 0.6`. Never used to gate anything.
- **AI refused / malformed JSON / schema mismatch** — typed `TriageFailure`; the orchestration layer flips the matter to `needs_manual_review`, records the failure in the audit log, and still runs the conflict check.
- **AI unreachable (network / 5xx / rate-limit)** — same `needs_manual_review` path; the user sees a clear "couldn't structure automatically" message on the intake confirmation.
- **Anthropic auth missing** — `analyzeIntake()` returns a typed `auth` failure with an actionable message; the matter is preserved.
- **Duplicate submission within 5 minutes** — returns the existing matter id with a "duplicate" outcome; the UI shows a friendly amber card with a "view existing" link.
- **Conflict-check false positives** — surfaced as flags with a "fuzzy match" note in the rendered text; the attorney can read the explanation and decide.
- **Decision on an already-resolved matter** — `decideOnMatter()` returns `not_allowed`; the API returns 409; the UI doesn't render the decision panel in the first place when status isn't `intake_review` or `needs_manual_review`.

## Auth

**The demo has no authentication.** Anyone with the URL can submit an intake and any attorney can accept/decline from the dashboard. This is deliberate for a take-home demo and is the obvious production next step.

A real deployment would need: multi-tenant firms (org → users → matters), role-based access (intake coordinator vs. attorney vs. admin), audit trails per actor (the `actor` column already exists), and SSO. Each is straightforward but each adds enough surface area to obscure the actual triage logic that's being evaluated.

## What I deliberately did not build

These are real product needs. Each is its own design problem. They were cut so the intake → triage → accept/decline loop could be the thing actually graded.

- **Billing / time tracking.** A real intake leads to an engagement letter and a billing setup; that's a different system.
- **Document upload / OCR.** Intake from PDFs, photos, scanned letters — a whole vertical of work (storage, virus scanning, OCR vendor selection, redaction). Adding it half-built would have been worse than not adding it.
- **Multi-tenant orgs.** One seeded firm. See "Auth" above.
- **Real e-signature on the engagement letter.** Vendor integration; not a triage problem.
- **Calendar / scheduling integration.** Accepting a matter doesn't book a meeting in this demo.
- **Email notifications.** Intakes don't trigger emails; the attorney's dashboard is the queue.
- **LLM-as-judge on the AI's classifications.** Would catch quality regressions over time. Worth adding once there's a labeled set of accepted/declined outcomes to grade against — chicken-and-egg with the demo.

## Stack

- **Next.js 16** App Router + TypeScript + React 19 + Tailwind v4
- **Neon** (serverless Postgres) via `@neondatabase/serverless`
- **Drizzle ORM** — schema, migrations, typed queries
- **Zod** — boundary validation everywhere (form input + AI output + body parsing)
- **Anthropic SDK** — `claude-sonnet-4-6` via tool use
- **Vitest** — unit tests on the pieces that matter
- **Vercel** — deploy target
