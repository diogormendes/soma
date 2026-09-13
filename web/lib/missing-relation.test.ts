import { describe, it, expect } from "vitest";
import { isMissingRelation } from "./missing-relation";

describe("isMissingRelation", () => {
  it("recognises SQLSTATE 42P01 from the Neon HTTP driver (code on the error)", () => {
    const err = Object.assign(new Error('relation "nutrition_day" does not exist'), { code: "42P01" });
    expect(isMissingRelation(err)).toBe(true);
  });

  it("recognises 42P01 wrapped by the Neon driver in sourceError", () => {
    const err = Object.assign(new Error("Error connecting to database"), {
      sourceError: { code: "42P01" },
    });
    expect(isMissingRelation(err)).toBe(true);
  });

  it("recognises the Postgres message when no code is attached", () => {
    expect(isMissingRelation(new Error('relation "meal_log" does not exist'))).toBe(true);
  });

  it("is false for other database errors, plain errors and non-errors", () => {
    expect(isMissingRelation(Object.assign(new Error("permission denied"), { code: "42501" }))).toBe(false);
    expect(isMissingRelation(new Error("getaddrinfo ENOTFOUND pg.gkos.dev"))).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingRelation("42P01")).toBe(false);
  });
});
