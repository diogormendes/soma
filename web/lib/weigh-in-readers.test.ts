import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ⛔ A GARMIN PROFILE WEIGHT IS NOT A WEIGH-IN (soma#1108, decided 2026-10-01: keep it stored, never
 * count it). `source_type = 'USER_SETTING'` is the weight in his Garmin profile, and the one row of it
 * (2026-08-26, 73.2 kg) only repeated his 12 May reading. Counted, it made "the latest weigh-in" 106 days
 * newer than any real one and read three months of drift as flat.
 *
 * Every query that reads weigh-ins must exclude it. This reads each reader's source, so a new query that
 * forgets cannot ship silently. Writers, the Garmin push (Health Connect rows only) and the plain row
 * count on the connections page are not weigh-in readers and are not listed.
 */
const READERS = [
  "lib/weight-trend.ts",
  "lib/body-comp-stream.ts",
  "lib/adaptive-tdee.ts",
  "lib/weigh-ins.ts",
  "app/api/nutrition/body-comp/route.ts",
  "app/api/nutrition/plan/route.ts",
  "app/api/nutrition/close-day/route.ts",
  "app/api/health/weight/route.ts",
];

/** Each `FROM weight_log` read: the SQL from the opening backtick to the closing one. */
function weightReads(src: string): string[] {
  const out: string[] = [];
  const re = /`[^`]*\bFROM weight_log\b[^`]*`/g;
  for (const m of src.matchAll(re)) {
    if (/^\s*`\s*(INSERT|UPDATE|DELETE)/i.test(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

describe("every weigh-in reader leaves the Garmin profile weight out", () => {
  for (const f of READERS) {
    it(f, () => {
      const reads = weightReads(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
      expect(reads.length).toBeGreaterThan(0);
      for (const q of reads) expect(q).toMatch(/USER_SETTING/);
    });
  }
});

/**
 * ⛔ THE APP'S WEIGHT CHART WAS DRAWING EVERY WEIGH-IN A DAY EARLY. This route returned the bare DATE,
 * which node-postgres makes a JS Date at the server's midnight and JSON sends as UTC, so 28 Sep in Athens
 * arrived as "2026-09-27T21:00:00.000Z". The app labels a point by the first ten characters.
 */
describe("the weight history sends calendar dates, not timestamps", () => {
  it("selects date::text", () => {
    const src = readFileSync(new URL("../app/api/health/weight/route.ts", import.meta.url), "utf8");
    expect(src).toMatch(/SELECT date::text AS date/);
  });
});
