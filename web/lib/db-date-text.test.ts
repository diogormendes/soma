import { types as pgTypes } from "pg";
import { describe, expect, it } from "vitest";
import { DATE_OID, neonTypes } from "./db";

/**
 * ⛔ A DATE IS A CALENDAR DAY, AND THE DRIVERS TURNED IT INTO A MOMENT. node-postgres parses a DATE into a
 * JS Date at the server's midnight, and JSON sends that as UTC, so 28 Sep in Athens left the server as
 * "2026-09-27T21:00:00.000Z". Anything reading the first ten characters (the app's charts) was a day early,
 * and so was every `instanceof Date ? d.toISOString().split("T")[0]` guard written to cope with it.
 * Both drivers now hand DATE back as the text Postgres sent.
 */
describe("DATE columns come back as their calendar day", () => {
  it("node-postgres (the local pool) returns DATE text unchanged", () => {
    // The literal 1082, not DATE_OID: an undefined oid gets the do-nothing parser and passes vacuously,
    // which is exactly what this test did before the constant existed.
    expect(pgTypes.getTypeParser(1082, "text")("2026-09-28")).toBe("2026-09-28");
  });

  it("the Neon HTTP driver (the demo) does the same", () => {
    expect(neonTypes.getTypeParser(1082, "text")("2026-09-28")).toBe("2026-09-28");
  });

  it("leaves every other type to the default parsers", () => {
    const TIMESTAMPTZ = 1184;
    const parsed = neonTypes.getTypeParser(TIMESTAMPTZ, "text")("2026-09-28 06:00:00+00") as unknown;
    expect(parsed).toBeInstanceOf(Date);
  });

  it("names the DATE type by its real oid", () => {
    expect(DATE_OID).toBe(1082);
  });
});
