import { describe, it, expect } from "vitest";
import { jsonValue } from "../src/db";
import { loadSession } from "../src/strava-web";
import type { Db } from "../src/db";

/**
 * Over the HTTP gateway a JSONB column arrives as a STRING, because the gateway
 * hands back the JSON its API serialised rather than a value a driver parsed.
 * A local `pg` connection parses it, so this class of bug is invisible until it
 * runs in Actions (soma#978).
 *
 * `token-store.ts` and `refinalize.ts` already coped. `loadSession` did not, and
 * it threw `cookies.map is not a function` on the first run that reached it.
 */

const COOKIES = [
  { name: "_strava4_session", value: "abc", domain: ".strava.com", path: "/", expires: 99 },
];

function dbReturning(cookies: unknown): Db {
  return {
    query: async () => ({ rows: [{ cookies }], rowCount: 1 }),
    end: async () => {},
  };
}

describe("jsonValue", () => {
  it("parses the string shape the gateway returns", () => {
    expect(jsonValue(JSON.stringify(COOKIES), null)).toEqual(COOKIES);
  });

  it("passes through the parsed shape the pg driver returns", () => {
    expect(jsonValue(COOKIES, null)).toEqual(COOKIES);
  });

  it("falls back rather than throwing on null, undefined or junk", () => {
    expect(jsonValue(null, "fb")).toBe("fb");
    expect(jsonValue(undefined, "fb")).toBe("fb");
    expect(jsonValue("{not json", "fb")).toBe("fb");
  });

  it("does not turn a bare number or boolean into a surprise", () => {
    // JSON.parse("5") succeeds and yields 5, which is valid JSON but never a
    // row shape any caller wants. The caller's own guard handles that; what
    // matters here is that it does not throw.
    expect(() => jsonValue("5", null)).not.toThrow();
  });
});

describe("loadSession over the gateway", () => {
  it("reads cookies that arrive as a JSON string", async () => {
    const out = await loadSession(dbReturning(JSON.stringify(COOKIES)));
    expect(out).toEqual([
      { name: "_strava4_session", value: "abc", domain: ".strava.com", path: "/" },
    ]);
  });

  it("still reads cookies that arrive already parsed", async () => {
    const out = await loadSession(dbReturning(COOKIES));
    expect(out?.[0].name).toBe("_strava4_session");
  });

  it("returns null rather than throwing when the value is not a list", async () => {
    // Anything that is not an array of cookies means there is no usable session,
    // and a login is the right answer. Throwing here killed the whole run.
    expect(await loadSession(dbReturning("not json at all"))).toBeNull();
    expect(await loadSession(dbReturning({ nope: true }))).toBeNull();
    expect(await loadSession(dbReturning(null))).toBeNull();
  });
});
