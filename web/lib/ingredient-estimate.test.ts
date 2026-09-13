import { describe, it, expect } from "vitest";
import { parseEstimateOutput, proposalFromEstimate, ESTIMATE_CONFIDENCE_CAP } from "./ingredient-estimate";

const good = { name: "Spanakopita", calories_per_100g: 265, protein_per_100g: 8, carbs_per_100g: 19, fat_per_100g: 18, fiber_per_100g: 2, category: "snack", is_raw: false, confidence: 0.6, rationale: "typical home recipe" };

describe("parseEstimateOutput", () => {
  it("accepts a complete answer, rounds to 2 decimals, clamps confidence", () => {
    const o = parseEstimateOutput({ ...good, protein_per_100g: "8.456", confidence: 1.7 })!;
    expect(o.protein_per_100g).toBe(8.46); expect(o.confidence).toBe(1); expect(o.category).toBe("snack"); expect(o.is_raw).toBe(false);
  });
  it("refuses a missing or negative macro: an unknown is not 0", () => {
    expect(parseEstimateOutput({ ...good, fiber_per_100g: undefined })).toBeNull();
    expect(parseEstimateOutput({ ...good, fat_per_100g: -1 })).toBeNull();
    expect(parseEstimateOutput("nope")).toBeNull();
  });
  it("an unknown category becomes snack; a missing confidence 0.5", () => {
    const o = parseEstimateOutput({ ...good, category: "pie", confidence: "x" })!;
    expect(o.category).toBe("snack"); expect(o.confidence).toBe(0.5);
  });
});

describe("proposalFromEstimate", () => {
  it("is marked as an estimate: source claude, capped confidence, flag, rationale names the model", () => {
    const p = proposalFromEstimate("spanakopita", { output: { ...good, confidence: 0.95 }, model: "sonnet", durationMs: 1200 });
    expect(p.source).toBe("claude"); expect(p.source_id).toBe("sonnet"); expect(p.confidence).toBe(ESTIMATE_CONFIDENCE_CAP);
    expect(p.flags).toEqual(["estimated"]); expect(p.rationale).toMatch(/^Estimated by Claude \(sonnet\)/); expect(p.name).toBe("Spanakopita");
  });
  it("falls back to the query as the name and flags kcal that disagree with the macros", () => {
    const p = proposalFromEstimate("mystery pie", { output: { ...good, name: "", calories_per_100g: 900 }, model: "sonnet", durationMs: 1 });
    expect(p.name).toBe("mystery pie"); expect(p.flags).toEqual(["kcal_macro_mismatch", "estimated"]);
  });
});
