import { describe, it, expect } from "vitest";
import {
  birthYearFrom,
  profileFromUserSettings,
  getAthleteProfile,
  FALLBACK_PROFILE,
} from "./athlete-profile";
import type { QueryFn } from "./db";

/** Garmin's real payload shape, trimmed to the fields this module reads. Weight is in GRAMS. */
const settings = (over: Record<string, unknown> = {}) => ({
  userData: { birthDate: "1994-04-30", weight: 73199, vo2MaxRunning: 52, gender: "MALE", ...over },
});

describe("birthYearFrom", () => {
  it("takes the year out of Garmin's ISO date", () => expect(birthYearFrom("1994-04-30")).toBe(1994));
  it("is null for nothing", () => expect(birthYearFrom(null)).toBeNull());
  it("is null for a malformed date, so an age of two thousand is impossible", () => {
    expect(birthYearFrom("not-a-date")).toBeNull();
    expect(birthYearFrom("0000-01-01")).toBeNull();
  });
});

describe("profileFromUserSettings", () => {
  it("reads all three and converts grams to kilograms", () => {
    expect(profileFromUserSettings(settings())).toEqual({
      weightKg: 73.199,
      birthYear: 1994,
      vo2max: 52,
      source: "garmin",
    });
  });

  it("reads a payload that is not nested under userData", () => {
    const flat = { birthDate: "1994-04-30", weight: 73199, vo2MaxRunning: 52 };
    expect(profileFromUserSettings(flat).source).toBe("garmin");
  });

  // The rule this module exists for. Each field alone pulls a different way, so a partial
  // profile is worse than none: weight on its own is -38 kcal/h and VO2max on its own is +40.
  it("falls back ENTIRELY when the weight is missing, never per field", () => {
    const p = profileFromUserSettings(settings({ weight: null }));
    expect(p).toEqual(FALLBACK_PROFILE);
    expect(p.birthYear).toBe(FALLBACK_PROFILE.birthYear);
    expect(p.vo2max).toBe(FALLBACK_PROFILE.vo2max);
  });

  it("falls back entirely when the birth date is missing", () => {
    expect(profileFromUserSettings(settings({ birthDate: null }))).toEqual(FALLBACK_PROFILE);
  });

  it("falls back entirely when the VO2max is missing or zero", () => {
    expect(profileFromUserSettings(settings({ vo2MaxRunning: null }))).toEqual(FALLBACK_PROFILE);
    expect(profileFromUserSettings(settings({ vo2MaxRunning: 0 }))).toEqual(FALLBACK_PROFILE);
  });

  it("falls back entirely on a zero weight, which is a cyclist with no scale rather than a person", () => {
    expect(profileFromUserSettings(settings({ weight: 0 }))).toEqual(FALLBACK_PROFILE);
  });

  it("falls back on junk", () => {
    for (const junk of [null, undefined, "", 42, []]) {
      expect(profileFromUserSettings(junk)).toEqual(FALLBACK_PROFILE);
    }
  });
});

const sqlReturning = (rows: unknown[]): QueryFn =>
  ((_s: TemplateStringsArray) => Promise.resolve(rows)) as unknown as QueryFn;

describe("getAthleteProfile", () => {
  it("reads the stored row", async () => {
    const p = await getAthleteProfile(sqlReturning([{ raw_json: settings() }]));
    expect(p).toEqual({ weightKg: 73.199, birthYear: 1994, vo2max: 52, source: "garmin" });
  });

  it("reads a row the gateway handed back as a JSON string", async () => {
    const p = await getAthleteProfile(sqlReturning([{ raw_json: JSON.stringify(settings()) }]));
    expect(p.source).toBe("garmin");
    expect(p.weightKg).toBe(73.199);
  });

  it("is the default profile when nothing is stored yet", async () => {
    expect(await getAthleteProfile(sqlReturning([]))).toEqual(FALLBACK_PROFILE);
  });

  it("is the default profile when the query throws, so a missing table cannot fail a sync", async () => {
    const throws = (() => Promise.reject(new Error("relation does not exist"))) as unknown as QueryFn;
    expect(await getAthleteProfile(throws)).toEqual(FALLBACK_PROFILE);
  });
});
