import { describe, it, expect, vi } from "vitest";
import { loadSession, saveSession } from "../src/strava-web";
import type { Db } from "../src/db";

/**
 * The bridge runs under a role that may create nothing.
 *
 * `soma_app` holds USAGE on schema public and no CREATE, which is the whole
 * point of a least-privilege application role. Postgres checks that CREATE
 * privilege BEFORE it looks to see whether the table is already there, so a
 * `CREATE TABLE IF NOT EXISTS` bootstrap raises 42501 even when the table
 * exists and the role can read and write it perfectly well.
 *
 * `main.ts` learned this once and guards its ledger bootstrap. The session
 * bootstrap never did, so every live run died at `loadSession` the moment the
 * earlier Worker failure stopped hiding it (soma#969 → soma#972).
 */

/** A Db whose statements are answered by `answer`, recording what it was asked. */
function fakeDb(answer: (sql: string) => Promise<{ rows: any[]; rowCount: number }>): Db & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    query: async (text: string) => {
      sql.push(text.replace(/\s+/g, " ").trim());
      return answer(text);
    },
    end: async () => {},
  };
}

/** The error the gateway and pg both raise for a refused CREATE. */
function denied(): Error {
  return Object.assign(new Error("permission denied for schema public"), { code: "42501" });
}

const COOKIES = [{ name: "_strava4_session", value: "abc", domain: ".strava.com", path: "/", expires: 123 }];

describe("loadSession under a role that cannot create tables", () => {
  it("still returns the stored cookies when the bootstrap is refused", async () => {
    const db = fakeDb(async (sql) => {
      if (sql.startsWith("CREATE TABLE")) throw denied();
      return { rows: [{ cookies: COOKIES }], rowCount: 1 };
    });
    const out = await loadSession(db);
    expect(out).toEqual([
      { name: "_strava4_session", value: "abc", domain: ".strava.com", path: "/" },
    ]);
    expect(db.sql.some((s) => s.startsWith("SELECT cookies"))).toBe(true);
  });

  it("returns null when the table is genuinely empty, not an error", async () => {
    const db = fakeDb(async (sql) => {
      if (sql.startsWith("CREATE TABLE")) throw denied();
      return { rows: [], rowCount: 0 };
    });
    expect(await loadSession(db)).toBeNull();
  });

  it("rethrows anything that is not a refused CREATE", async () => {
    // A real outage must not be swallowed as a privilege quirk.
    const db = fakeDb(async (sql) => {
      if (sql.startsWith("CREATE TABLE")) throw Object.assign(new Error("connection terminated"), { code: "57P01" });
      return { rows: [], rowCount: 0 };
    });
    await expect(loadSession(db)).rejects.toThrow("connection terminated");
  });

  it("warns once so the refusal is visible in the run log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeDb(async (sql) => {
      if (sql.startsWith("CREATE TABLE")) throw denied();
      return { rows: [{ cookies: COOKIES }], rowCount: 1 };
    });
    await loadSession(db);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/create/i);
    warn.mockRestore();
  });
});

describe("saveSession under the same role", () => {
  it("writes the cookies even though the bootstrap is refused", async () => {
    const db = fakeDb(async (sql) => {
      if (sql.startsWith("CREATE TABLE")) throw denied();
      return { rows: [], rowCount: 1 };
    });
    await saveSession(db, COOKIES);
    expect(db.sql.some((s) => s.startsWith("INSERT INTO strava_web_session"))).toBe(true);
  });

  it("does not touch the database at all when there is nothing worth keeping", async () => {
    const db = fakeDb(async () => ({ rows: [], rowCount: 0 }));
    await saveSession(db, [{ name: "unrelated", domain: "example.com" }]);
    expect(db.sql).toEqual([]);
  });
});
