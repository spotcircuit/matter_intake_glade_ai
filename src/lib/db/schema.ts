/**
 * Drizzle schema — Matter Intake & Triage.
 *
 * Five tables per the spec:
 *   - clients         (firm's existing + prospective clients)
 *   - matters         (one row per intake submission)
 *   - extracted_facts (flexible key/value entities pulled by the AI)
 *   - conflict_flags  (party-name matches surfaced for attorney review)
 *   - audit_log       (every status change, who, why)
 *
 * Design notes:
 *   - Postgres enums for `matter_type`, `urgency`, `matter_status`. Drizzle
 *     emits proper `CREATE TYPE` migrations and the TypeScript types are
 *     narrowed automatically.
 *   - `matters.matter_type` is nullable because a failed-classification
 *     matter still gets persisted with status="intake_review" so the
 *     attorney can hand-classify. The AI is not allowed to gate insertion.
 *   - `extracted_facts` is intentionally a flat key/value table rather
 *     than a JSON column. Reason: it's queryable, indexable on `key`, and
 *     makes "show me every matter with a court_date" trivial. JSON would
 *     have been less work today and more work in six months.
 *   - All FKs use ON DELETE CASCADE so removing a matter wipes its
 *     children. We never delete clients in the app surface, but cascade
 *     keeps test fixtures + manual cleanups simple.
 *   - `created_at` defaults to `now()` in the DB, not the app, so any
 *     ingestion path (script, route, future webhook) gets a consistent
 *     timestamp.
 */

import {
  pgEnum,
  pgTable,
  text,
  uuid,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const matterTypeEnum = pgEnum("matter_type", [
  "Personal Injury",
  "Contract Dispute",
  "Employment",
  "Family",
  "Estate Planning",
  "Criminal Defense",
  "Other",
]);

export const urgencyEnum = pgEnum("urgency", ["Low", "Medium", "High"]);

export const matterStatusEnum = pgEnum("matter_status", [
  "intake_review",
  "active",
  "declined",
  "needs_manual_review",
]);

// ---------- Tables ----------

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Email lookups happen on every intake (for duplicate detection)
    index("clients_email_idx").on(t.email),
    // Name lookups happen on every conflict check
    index("clients_name_idx").on(t.name),
  ],
);

export const matters = pgTable(
  "matters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    // AI-suggested classification. Null when classification failed —
    // attorney sets it manually in that case.
    matterType: matterTypeEnum("matter_type"),

    // AI-generated one-paragraph summary, or null when extraction failed.
    summary: text("summary"),

    jurisdiction: text("jurisdiction"),

    urgency: urgencyEnum("urgency").notNull().default("Medium"),
    urgencyReason: text("urgency_reason"),

    status: matterStatusEnum("status").notNull().default("intake_review"),

    // Always stored verbatim — never overwritten by the AI passes. This
    // is what the attorney falls back to if AI output is suspect, and
    // it's the audit-trail source of truth for what the client said.
    rawDescription: text("raw_description").notNull(),

    // The other side(s). Stored as a single string for the demo; a real
    // build would split into a parties table.
    opposingParty: text("opposing_party"),

    // Confidence (0..1) the AI reported on its classification. Used to
    // decide whether to flag "low confidence — please verify" in the UI.
    classificationConfidence: numeric("classification_confidence", {
      precision: 4,
      scale: 3,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Dashboard query: status + urgency
    index("matters_status_urgency_idx").on(t.status, t.urgency),
    // Conflict-check query and joins
    index("matters_client_id_idx").on(t.clientId),
  ],
);

export const extractedFacts = pgTable(
  "extracted_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    index("extracted_facts_matter_id_idx").on(t.matterId),
    index("extracted_facts_key_idx").on(t.key),
  ],
);

export const conflictFlags = pgTable(
  "conflict_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    /** The party-name string that triggered the flag (client or opposing party). */
    matchedParty: text("matched_party").notNull(),
    /** When the match was against an existing client, this is set. */
    matchedClientId: uuid("matched_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    /** Short human-readable explanation of why this matched. */
    note: text("note").notNull(),
  },
  (t) => [index("conflict_flags_matter_id_idx").on(t.matterId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    /** e.g. "created", "accepted", "declined", "manual_review_flagged" */
    action: text("action").notNull(),
    /** Who performed the action. In the demo this is a fixed string;
     *  in production it'd be a user id. */
    actor: text("actor").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_matter_id_idx").on(t.matterId)],
);

// ---------- Inferred row types ----------

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export type Matter = typeof matters.$inferSelect;
export type NewMatter = typeof matters.$inferInsert;

export type ExtractedFact = typeof extractedFacts.$inferSelect;
export type NewExtractedFact = typeof extractedFacts.$inferInsert;

export type ConflictFlag = typeof conflictFlags.$inferSelect;
export type NewConflictFlag = typeof conflictFlags.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
