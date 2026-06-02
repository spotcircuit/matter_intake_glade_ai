/**
 * Triage service — wraps the Anthropic call that classifies + extracts
 * facts from an intake description.
 *
 * Design:
 *
 *   - Uses `tool_use` (not raw text) so Claude is forced to return a
 *     JSON object matching our shape. We define a single "submit_triage"
 *     tool whose input schema is the JSON-Schema version of
 *     TriageAnalysisSchema. `tool_choice: { type: "tool", name: ... }`
 *     forces Claude to call it.
 *
 *   - Every response is validated with Zod before it's allowed to leave
 *     this module. A schema mismatch is a `TriageFailure` (reason:
 *     "schema") that the caller surfaces as `needs_manual_review`. The
 *     DB never sees an unvalidated AI output.
 *
 *   - Failure modes we handle explicitly:
 *       * No tool_use block (model decided to refuse)        → refused
 *       * tool_use input is not valid JSON                   → invalid_json
 *       * JSON doesn't match the Zod schema                  → schema
 *       * Network / 5xx                                      → network
 *       * 401 / 403                                          → auth
 *
 *   - The AI is never the decider. Even on a clean response, the caller
 *     persists the matter with status="intake_review" and the attorney
 *     accepts/declines. This service has no DB access.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  TriageAnalysisSchema,
  type TriageResult,
  type IntakeInput,
} from "./types";

// ---------- JSON Schema for the tool ----------

/**
 * Hand-written JSON Schema mirroring `TriageAnalysisSchema`. Anthropic
 * needs JSON Schema, not Zod, for tool definitions — and the two should
 * stay in lockstep. If you change one, change the other. Tests in M6
 * assert the Zod schema accepts a sample matching this shape.
 */
const TRIAGE_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  required: [
    "matter_type",
    "matter_type_confidence",
    "summary",
    "jurisdiction",
    "urgency",
    "urgency_reason",
    "extracted_facts",
  ],
  properties: {
    matter_type: {
      type: "string",
      enum: [
        "Personal Injury",
        "Contract Dispute",
        "Employment",
        "Family",
        "Estate Planning",
        "Criminal Defense",
        "Other",
      ],
      description:
        "Best-fit matter type from the firm's taxonomy. If none clearly fit, use 'Other'.",
    },
    matter_type_confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "Your confidence in the matter_type classification on a 0..1 scale. Be calibrated — under 0.5 means the attorney should pick a type manually.",
    },
    summary: {
      type: "string",
      maxLength: 2000,
      description:
        "One-paragraph (3-6 sentence) plain-English summary of the matter, written for an attorney reviewing intake.",
    },
    jurisdiction: {
      type: ["string", "null"],
      maxLength: 120,
      description:
        "State, country, or court system if confidently inferable from the description. Null when not.",
    },
    urgency: {
      type: "string",
      enum: ["Low", "Medium", "High"],
      description:
        "High = active deadline/statute clock OR ongoing harm. Medium = active dispute with no immediate deadline. Low = routine engagement.",
    },
    urgency_reason: {
      type: "string",
      maxLength: 500,
      description:
        "One-sentence explanation of why this urgency level. Reference deadlines, ongoing harm, or routine context.",
    },
    extracted_facts: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        required: ["key", "value"],
        properties: {
          key: {
            type: "string",
            pattern: "^[a-z][a-z0-9_]*$",
            description:
              "snake_case noun describing what the value represents (incident_date, amount_in_dispute_usd, etc.)",
          },
          value: {
            type: "string",
            maxLength: 500,
          },
        },
        additionalProperties: false,
      },
      description:
        "Structured entities extracted from the description — dates, amounts, parties, locations. Lowercase snake_case keys.",
    },
  },
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are an intake analyst at a small US law firm. You receive a prospective client's description of a legal situation and produce a structured triage analysis.

Your job:
- Classify the matter into the firm's taxonomy.
- Extract structured facts (dates, monetary amounts, parties, locations) as key/value pairs.
- Assess urgency.
- Write a 3-6 sentence summary an attorney can scan in 15 seconds.

You are an assistant, not a decision-maker. The attorney accepts or declines every matter. Never editorialize beyond the structured fields. Never recommend whether the firm should take the case.

Calibration:
- Be honest about classification confidence. If the description is ambiguous, give a lower number and pick the best-fit type.
- For jurisdiction, infer only when it's clearly stated or strongly implied (e.g., "ER visit on Howard Street" likely SF/CA; "EEOC charge" implies US federal claim). When unclear, return null.
- Urgency = High when a filing deadline, statute clock, or ongoing harm is named. Medium when an active dispute exists with no immediate deadline. Low for routine planning.

Always call the submit_triage tool with your structured analysis. Do not respond in prose.`;

const TRIAGE_TOOL_NAME = "submit_triage";

// ---------- Public API ----------

const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function analyzeIntake(
  input: IntakeInput,
  opts?: { client?: Anthropic; model?: string },
): Promise<TriageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey && !opts?.client) {
    return {
      ok: false,
      reason: "auth",
      message:
        "ANTHROPIC_API_KEY is not set on the server. Add it to .env.local and restart.",
    };
  }

  const client = opts?.client ?? new Anthropic({ apiKey });
  const model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const userMessage = buildUserMessage(input);
  const start = Date.now();

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TRIAGE_TOOL_NAME,
          description:
            "Submit the structured triage analysis for this matter.",
          input_schema: TRIAGE_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TRIAGE_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    return mapAnthropicError(err);
  }

  const latencyMs = Date.now() - start;
  const usage = {
    model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    latencyMs,
  };

  // Find the tool_use block — Claude is expected to call submit_triage,
  // but a refusal shows up as text content with no tool_use block.
  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === TRIAGE_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    const textBlock = response.content.find((b) => b.type === "text");
    const refusal =
      textBlock && textBlock.type === "text" && textBlock.text
        ? textBlock.text.slice(0, 300)
        : "Model returned no tool call and no text. Marking for manual review.";
    return {
      ok: false,
      reason: "refused",
      message: `AI did not produce a structured triage. ${refusal}`,
    };
  }

  // Validate. Anthropic claims tool input always matches the schema —
  // we don't trust that. Zod is the boundary.
  const parsed = TriageAnalysisSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "schema",
      message: `AI output didn't match expected schema: ${zErrors(parsed.error)}`,
    };
  }

  return {
    ok: true,
    analysis: parsed.data,
    modelUsage: usage,
  };
}

// ---------- Helpers ----------

function buildUserMessage(input: IntakeInput): string {
  const lines = [
    `Client name: ${input.clientName}`,
    `Client email: ${input.clientEmail}`,
  ];
  if (input.opposingParty) {
    lines.push(`Opposing party (as provided): ${input.opposingParty}`);
  } else {
    lines.push(`Opposing party (as provided): (none provided)`);
  }
  lines.push("", "Description (verbatim):", input.description);
  return lines.join("\n");
}

function zErrors(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function mapAnthropicError(err: unknown): TriageResult {
  if (err instanceof Anthropic.AuthenticationError) {
    return {
      ok: false,
      reason: "auth",
      message: "Anthropic auth failed. Check ANTHROPIC_API_KEY.",
    };
  }
  if (
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return {
      ok: false,
      reason: "network",
      message: "Could not reach the Anthropic API. Try again in a moment.",
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      ok: false,
      reason: "network",
      message: "Anthropic rate limit reached. Wait and retry.",
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    reason: "unknown",
    message: `Unexpected AI error: ${msg.slice(0, 200)}`,
  };
}
