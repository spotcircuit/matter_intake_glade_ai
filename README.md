# Matter Intake & Triage

AI-assisted client intake for a small law firm. A prospective client (or an intake coordinator) describes a legal situation in plain language; the app classifies the matter, extracts structured facts, flags urgency, runs a conflict check against existing clients, and produces a triaged record an attorney can accept or decline.

**The AI is an assistant, not a decider.** Every matter is reviewed by a human before any next step.

## Why this exists, and what I'd defend in a product review

### Why intake triage, and why now

Small law firms drown in unqualified leads. A two-attorney firm doing personal injury and employment work might get 40–80 inbound intakes a week — emails from their website form, voicemails transcribed, paralegal-typed notes from phone calls. Maybe a quarter of those are actionable. The other three quarters are out-of-practice-area, jurisdictional non-fits, opposing-party fishing, repeat submissions, or descriptions so thin you can't tell yet. Today that triage happens in someone's head and inbox: an associate or a paralegal reads each one, makes a judgment call, types a referral letter or forwards to the right attorney, and tries to remember to run the conflict check before any of that happens.

Two failure modes drive real malpractice exposure: **missed conflicts** and **missed deadlines**. Conflict checks are manual because most firms' "system" is "we've been here long enough to remember our clients." That works until it doesn't — a junior associate doesn't know that Acme Industries was a client three years ago, accepts a case against them, and now the firm has a disclosure obligation and a likely disqualification. Deadline-missed is worse: a personal-injury intake comes in two months before the statute of limitations runs, lands in someone's inbox, doesn't get triaged for ten days, and now the firm is in a panicked sprint instead of a normal engagement.

This app doesn't solve either failure mode entirely. It moves them from "depends on whether someone happened to remember" to "there's a structured queue with a flag on it." That's a meaningful upgrade even if the AI gets the matter type wrong half the time.

### Why AI suggests, and a human confirms

Full automation here would be malpractice. Three reasons it can't be the AI's call:

1. **Conflict checks aren't a similarity-matching problem; they're a duty-of-loyalty problem.** A name match might be a 100% conflict, a coincidental homonym, or a former client whose representation ended in a way that doesn't preclude this matter. The model can flag the match. Only a person with the firm's history and ethics rules in mind decides what the flag means.

2. **The classification taxonomy is the firm's, not the model's.** Whether something is "Contract Dispute" vs "Employment" depends on what the firm intends to do with it — sometimes a wage claim is better triaged as a contract case if the firm's employment shop is full. The AI doesn't know that, and shouldn't pretend to. It classifies what it sees; the attorney redirects when it doesn't fit the firm's current capacity.

3. **The accept/decline decision has consequences the AI cannot account for**: client capacity, fee structure, conflicts the firm hasn't surfaced yet, referral relationships, the attorney's actual willingness to take this client based on a 30-second read of the description. The model has none of that context. Making the AI the decider would force every one of those judgments into a prompt — that's how systems start gaslighting their users.

So the architecture is split deliberately: the AI fills in the structured fields and the conflict flags. The attorney's accept/decline writes a state transition to the audit log. The two are separate columns in the schema and separate actions in the UI, never collapsed. Every matter-detail page labels the AI fields "advisory only" above the decision panel.

A consequence of this split: the system has to be useful **even when the AI fails**. So the matter row is created before the AI call, the AI's failure flips the matter to `needs_manual_review` instead of refusing to save, and the conflict check runs regardless of the AI's status. The attorney can always do their job; the AI is the accelerant, not the gate.

### What I cut, and why

The brief said the AI assistant is what's being graded, not a full case-management system. Things I deliberately cut, and what would justify reversing each cut:

- **Document upload + OCR.** A real intake includes a photo of a contract, a scan of an EEOC charge, a PDF of a complaint. Building that means storage (S3 + signed URLs), virus scanning (ClamAV or a vendor), OCR (Textract / Vision API), and a redaction pass before anything goes to the model. Each one is its own engineering problem. Including it half-built would have crowded out the triage logic that's actually being evaluated. Add it back when a customer has been live for a quarter and can tell us what document types matter most.
- **Multi-tenant orgs and real auth.** One firm, no login. A real deploy needs orgs → users → matters with row-level access, role-based UI (intake coordinator vs attorney vs admin), and SSO. The `actor` column on the audit log already exists; adding the rest is mechanical. Cut for the demo because it would have obscured the triage code with auth middleware noise that's the same as any other SaaS.
- **Billing / time tracking / engagement letter / e-signature.** Accepting a matter in a real firm produces an engagement letter, a billing setup, and possibly a trust account deposit. That's a different system that reads from this one. Including it would have meant either a fake billing UI (useless) or a real integration with a clio-style provider (out of scope).
- **Calendar / notifications.** A real intake creates an obligation to follow up. Email notifications + a calendar invite for the initial consult are obvious extensions. Skipped because the dashboard *is* the inbox in this design — the attorney's workflow is to open the dashboard and clear the queue, not get pinged.
- **LLM-as-judge on classification quality.** Would catch quality regressions as the model evolves. Worth adding once there's a labeled set of "the attorney agreed / disagreed with the AI's classification" data to grade against. Today there isn't, so the eval would just be the model grading itself.
- **Scheduled reminders ("this matter has been in triage for >24h").** Easy to add as a cron task that scans `matters.status = 'intake_review' AND created_at < now() - interval '24 hours'`. Skipped to keep the demo runtime to one process; would be the first thing I'd add post-MVP.

What I **didn't** cut and would defend even though it would have been faster to skip:

- The audit log. Every state transition writes a row. This is the table the firm's malpractice carrier will ask about in a deposition, and it's the table I'd want if I were the attorney trying to reconstruct what happened. Building it after the fact is the kind of work that always slips.
- The `needs_manual_review` status as a distinct state, not a subset of intake_review. The dashboard treats it differently, the audit log records the AI failure as a distinct action, and the UI tells the attorney explicitly that the AI couldn't structure the intake. That separation is what keeps "the AI suggests" honest — when it can't suggest, the system says so out loud.
- The duplicate-submission window. A 5-minute window catches refresh / double-click without dropping genuine re-submissions. It cost ~20 lines of code and prevents the most annoying class of demo bug.

## The problem (concise)

Small law firms field 40–80 inbound intakes a week. Most aren't actionable, conflict checks are manual and error-prone, and time-sensitive matters get lost in inboxes. This app gives the firm a structured queue with AI-suggested classification and automatic conflict flags — the attorney accepts or declines every matter with a single click and an audit-logged note. Three concrete wins:

1. **Free text → structured record** in one pass — matter type, jurisdiction, key dates, monetary amounts, urgency. The attorney scans structured fields in 10 seconds instead of 200 words of prose.
2. **Conflict check on every intake**, automatically — name-match against existing clients and against opposing parties from past matters. False positives are cheap (one click); false negatives are malpractice exposure.
3. **A queue, not an inbox** — sorted by urgency, attorney accepts or declines, every transition logged.

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
