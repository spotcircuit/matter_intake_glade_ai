/**
 * Shared domain types + Zod schemas.
 *
 * All AI responses are validated against the schemas here BEFORE the
 * values are allowed near the DB. Anything that doesn't parse cleanly
 * is treated as a failed classification / extraction and the matter is
 * marked `needs_manual_review` — never silently saved.
 */

import { z } from "zod";

// ---------- The matter-type taxonomy (single source of truth) ----------

export const MATTER_TYPES = [
  "Personal Injury",
  "Contract Dispute",
  "Employment",
  "Family",
  "Estate Planning",
  "Criminal Defense",
  "Other",
] as const;

export const URGENCY_LEVELS = ["Low", "Medium", "High"] as const;

export const MATTER_STATUSES = [
  "intake_review",
  "active",
  "declined",
  "needs_manual_review",
] as const;

export type MatterType = (typeof MATTER_TYPES)[number];
export type Urgency = (typeof URGENCY_LEVELS)[number];
export type MatterStatus = (typeof MATTER_STATUSES)[number];

// ---------- Intake (what the form posts) ----------

export const IntakeInputSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(200),
  clientEmail: z
    .string()
    .trim()
    .email("Valid email is required")
    .max(200),
  opposingParty: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: z
    .string()
    .trim()
    .min(20, "Please describe the situation in at least 20 characters")
    .max(10_000),
});
export type IntakeInput = z.infer<typeof IntakeInputSchema>;

// ---------- The AI's structured output ----------

/**
 * The shape we ask Claude to return via tool use. Keep it minimal — the
 * fewer fields, the fewer ways the LLM can go off-script. Anything
 * richer (full parties list, monetary breakdown, multi-jurisdiction)
 * becomes individual extracted_facts rows instead of new top-level
 * fields.
 */
export const TriageAnalysisSchema = z.object({
  matter_type: z.enum(MATTER_TYPES),
  matter_type_confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("0..1; <0.5 means UI should surface 'please verify'"),
  summary: z.string().min(1).max(2_000),
  jurisdiction: z
    .string()
    .max(120)
    .nullable()
    .describe("null when no jurisdiction can be confidently inferred"),
  urgency: z.enum(URGENCY_LEVELS),
  urgency_reason: z.string().min(1).max(500),
  /**
   * Free-form key/value facts. The LLM picks the keys — but they should
   * be snake_case nouns describing what the value represents (e.g.
   * `incident_date`, `amount_in_dispute_usd`, `arraignment_date`).
   * Anything not parseable here is dropped at validation, not at
   * insertion.
   */
  extracted_facts: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(80)
          .regex(
            /^[a-z][a-z0-9_]*$/,
            "Use snake_case keys (lowercase letters, digits, underscores)",
          ),
        value: z.string().min(1).max(500),
      }),
    )
    .max(40),
});
export type TriageAnalysis = z.infer<typeof TriageAnalysisSchema>;

// ---------- Outcomes from the triage service ----------

export type TriageOk = {
  ok: true;
  analysis: TriageAnalysis;
  /** Useful for the audit-log row + observability. */
  modelUsage: {
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
  };
};

export type TriageFailure = {
  ok: false;
  /** Short machine-friendly code: `refused`, `invalid_json`, `schema`,
   *  `network`, `auth`. Used by the API layer + UI to decide what to
   *  tell the attorney. */
  reason:
    | "refused"
    | "invalid_json"
    | "schema"
    | "network"
    | "auth"
    | "unknown";
  /** Human-readable message — safe to render to the attorney. */
  message: string;
};

export type TriageResult = TriageOk | TriageFailure;

// ---------- Conflict-check result ----------

export type ConflictMatch = {
  party: string;
  matchedClientId: string | null;
  /** Where the match came from — for the surfaced note. */
  matchedAgainst: "existing_client" | "existing_opposing_party";
  /** Short note rendered in the dashboard flag. */
  note: string;
};
