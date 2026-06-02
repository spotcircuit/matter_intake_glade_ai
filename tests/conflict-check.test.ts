/**
 * Unit tests for the pure pieces of the conflict-check service.
 *
 * The DB-touching code (`runConflictCheck`, `findRecentDuplicate`) is
 * exercised by the seed + manual smoke test. Here we pin the boundary
 * logic that decides what counts as a match — that's the part the
 * attorney's trust depends on, and the part most likely to drift.
 */

import { describe, expect, it } from "vitest";
import {
  matchKind,
  normalizeName,
} from "@/lib/domain/conflict-check";

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  ACME Industries  ")).toBe("acme industries");
  });

  it("strips entity suffixes (LLC, Inc, Corp, …)", () => {
    expect(normalizeName("Acme Industries LLC")).toBe("acme industries");
    expect(normalizeName("Acme, Inc.")).toBe("acme");
    expect(normalizeName("Acme Corp.")).toBe("acme");
    expect(normalizeName("Foo GmbH")).toBe("foo");
    expect(normalizeName("Bar PLC")).toBe("bar");
  });

  it("strips punctuation but preserves token boundaries", () => {
    expect(normalizeName("O'Hara & Sons")).toBe("o hara sons");
  });

  it("drops common stopwords (the, of, and)", () => {
    expect(normalizeName("The Bank of America")).toBe("bank america");
  });

  it("returns empty string for empty / whitespace input", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
  });

  it("idempotent on already-normalized input", () => {
    const n = normalizeName("Acme Industries LLC");
    expect(normalizeName(n)).toBe(n);
  });
});

describe("matchKind", () => {
  it("returns 'exact' when normalized strings are identical", () => {
    expect(matchKind("acme industries", "acme industries")).toBe("exact");
  });

  it("returns 'fuzzy' when one multi-token name is a substring of the other", () => {
    expect(matchKind("acme industries", "acme industries west")).toBe("fuzzy");
    expect(matchKind("acme industries west", "acme industries")).toBe("fuzzy");
  });

  it("returns null when both strings are single-token and not identical", () => {
    // 'Smith' vs 'Smith Holdings' would be too noisy without a 2nd token signal.
    expect(matchKind("smith", "jones")).toBeNull();
  });

  it("returns null when there is no overlap", () => {
    expect(matchKind("acme industries", "northpath tech")).toBeNull();
  });

  it("returns null on empty inputs", () => {
    expect(matchKind("", "acme")).toBeNull();
    expect(matchKind("acme", "")).toBeNull();
  });

  it("works on the seeded conflict case (Acme Industries LLC → Acme Industries)", () => {
    const a = normalizeName("Acme Industries LLC");
    const b = normalizeName("Acme Industries");
    expect(matchKind(a, b)).toBe("exact");
  });

  // The fix for the self-match bug — pinned here so the regression
  // can't slip back in via a refactor. The DB-touching half of
  // runConflictCheck is exercised by manual smoke; the pure rule
  // (these inputs match, those inputs don't) lives here.
  it("identical name strings normalize and match — caller must exclude self by id", () => {
    expect(matchKind(normalizeName("Jordan Park"), normalizeName("Jordan Park"))).toBe(
      "exact",
    );
  });
});
