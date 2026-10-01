import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * ⛔ THE DATABASE'S CLOCK IS NEW YORK'S, AND HIS IS NOT.
 *
 * soma's Postgres session runs on America/New_York while he is in Athens, so for the seven hours after
 * his midnight `CURRENT_DATE` is yesterday. 91 places used it until soma#1123. Run against a copy of
 * the database with only the session clock moved to Pacific/Kiritimati, 14 of 37 routes changed their
 * answer; after the sweep, none did.
 *
 * "Today" comes from `todayForRequest()` on a request (the device's zone) and `todayAthlete()` in a
 * job, passed into SQL as `${today}::date`. This reads the source so a new `CURRENT_DATE` fails here
 * instead of shipping, the same way the weight pipeline's wiring is guarded.
 */
const ROOTS = ["lib", "app"];
const SERVER_CLOCK = /\bCURRENT_DATE\b|\bnow\(\)::date\b|\bCURRENT_TIMESTAMP::date\b/i;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "migrations" || name === "node_modules") continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx|mts)$/.test(name) && !/\.test\.(ts|tsx|mts)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("today is never the database's clock", () => {
  const base = new URL("..", import.meta.url).pathname;
  const files = ROOTS.flatMap((r) => sources(join(base, r)));

  it("finds the source files it is meant to guard", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("⛔ no CURRENT_DATE or now()::date anywhere in lib/ or app/", () => {
    const hits = files.flatMap((f) =>
      readFileSync(f, "utf8").split("\n")
        .map((line, i) => ({ line, i }))
        // A comment explaining why NOT to use it (capture/recent has one) is not a use of it.
        .filter(({ line }) => SERVER_CLOCK.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
        .map(({ line, i }) => `${f.slice(base.length)}:${i + 1}  ${line.trim().slice(0, 100)}`),
    );
    expect(hits).toEqual([]);
  });
});
