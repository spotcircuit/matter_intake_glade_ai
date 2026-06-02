/**
 * Triage validation tests.
 *
 * Two boundaries are pinned here:
 *
 *   1. IntakeInputSchema — what the form is allowed to send. Empty
 *      descriptions, garbage emails, oversize payloads must all be
 *      rejected at the boundary, never reach the AI or the DB.
 *
 *   2. TriageAnalysisSchema — what the AI is allowed to return. A
 *      missing field, a bad enum value, or a non-snake-case fact key
 *      becomes a TriageFailure (reason: "schema") in the orchestration
 *      layer. The tests assert the schema catches each.
 *
 * No live Anthropic calls — we stub the SDK in `triage-network.test.ts`
 * separately when we want to exercise that.
 */

import { describe, expect, it } from "vitest";
import {
  IntakeInputSchema,
  TriageAnalysisSchema,
} from "@/lib/domain/types";

describe("IntakeInputSchema", () => {
  const valid = {
    clientName: "Sarah Chen",
    clientEmail: "sarah@example.com",
    description:
      "I was hit by a delivery van last week while crossing the street.",
  };

  it("accepts a minimal valid intake", () => {
    const parsed = IntakeInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty description", () => {
    const parsed = IntakeInputSchema.safeParse({ ...valid, description: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a too-short description (< 20 chars)", () => {
    const parsed = IntakeInputSchema.safeParse({
      ...valid,
      description: "Need a lawyer.",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const parsed = IntakeInputSchema.safeParse({
      ...valid,
      clientEmail: "not-an-email",
    });
    expect(parsed.success).toBe(false);
  });

  it("treats empty-string opposingParty as undefined", () => {
    const parsed = IntakeInputSchema.parse({
      ...valid,
      opposingParty: "",
    });
    expect(parsed.opposingParty).toBeUndefined();
  });

  it("preserves opposingParty when given", () => {
    const parsed = IntakeInputSchema.parse({
      ...valid,
      opposingParty: "United Logistics",
    });
    expect(parsed.opposingParty).toBe("United Logistics");
  });

  it("trims whitespace on name + email", () => {
    const parsed = IntakeInputSchema.parse({
      ...valid,
      clientName: "  Sarah Chen  ",
      clientEmail: "  sarah@example.com  ",
    });
    expect(parsed.clientName).toBe("Sarah Chen");
    expect(parsed.clientEmail).toBe("sarah@example.com");
  });
});

describe("TriageAnalysisSchema", () => {
  const valid = {
    matter_type: "Personal Injury" as const,
    matter_type_confidence: 0.92,
    summary: "Client was injured in a collision on March 12 …",
    jurisdiction: "California",
    urgency: "High" as const,
    urgency_reason: "Statute clock is running.",
    extracted_facts: [
      { key: "incident_date", value: "2026-03-12" },
      { key: "lost_wages_weeks", value: "2" },
    ],
  };

  it("accepts a well-formed analysis", () => {
    expect(TriageAnalysisSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts null jurisdiction", () => {
    const parsed = TriageAnalysisSchema.safeParse({
      ...valid,
      jurisdiction: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a matter_type outside the taxonomy", () => {
    const parsed = TriageAnalysisSchema.safeParse({
      ...valid,
      matter_type: "Tax Litigation",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an urgency outside Low/Medium/High", () => {
    const parsed = TriageAnalysisSchema.safeParse({
      ...valid,
      urgency: "Critical",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects confidence outside [0,1]", () => {
    expect(
      TriageAnalysisSchema.safeParse({ ...valid, matter_type_confidence: 1.5 })
        .success,
    ).toBe(false);
    expect(
      TriageAnalysisSchema.safeParse({ ...valid, matter_type_confidence: -0.1 })
        .success,
    ).toBe(false);
  });

  it("rejects fact keys that aren't snake_case", () => {
    const parsed = TriageAnalysisSchema.safeParse({
      ...valid,
      extracted_facts: [{ key: "Incident-Date", value: "2026-03-12" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("caps extracted_facts at 40", () => {
    const tooMany = Array.from({ length: 41 }, (_, i) => ({
      key: `fact_${i}`,
      value: "x",
    }));
    const parsed = TriageAnalysisSchema.safeParse({
      ...valid,
      extracted_facts: tooMany,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(
      TriageAnalysisSchema.safeParse({ ...valid, summary: "" }).success,
    ).toBe(false);
  });
});
