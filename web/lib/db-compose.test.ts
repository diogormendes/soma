import { describe, it, expect, vi } from "vitest";
import { LocalQuery } from "./db";

/** A fake pool: records what reached it and answers with one row. */
function fakeRun() {
  const calls: { text: string; params: unknown[] }[] = [];
  const run = vi.fn(async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    return [{ ok: 1 }];
  });
  return { run, calls };
}

/** Build a tagged template the way `localDb` does, over the fake pool. */
function makeSql(run: (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => new LocalQuery(strings, values, run);
}

describe("the local driver composes nested fragments the way Neon does", () => {
  it("⛔ inlines a nested fragment instead of sending it as a parameter", async () => {
    const { run, calls } = fakeRun();
    const sql = makeSql(run);
    const genres = ["rock"];
    await sql`SELECT * FROM t WHERE tempo > ${100} ${sql`AND genres && ${genres}`} ORDER BY tempo`;
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe("SELECT * FROM t WHERE tempo > $1 AND genres && $2 ORDER BY tempo");
    expect(calls[0].params).toEqual([100, genres]);
  });

  it("an empty fragment adds nothing and runs nothing on its own", async () => {
    const { run, calls } = fakeRun();
    const sql = makeSql(run);
    await sql`SELECT 1 WHERE a = ${1} ${sql``} AND b = ${2}`;
    expect(calls).toEqual([{ text: "SELECT 1 WHERE a = $1  AND b = $2", params: [1, 2] }]);
  });

  it("numbers parameters across several and deeper fragments in order", async () => {
    const { run, calls } = fakeRun();
    const sql = makeSql(run);
    await sql`A ${1} ${sql`B ${2} ${sql`C ${3}`}`} D ${4}`;
    expect(calls[0]).toEqual({ text: "A $1 B $2 C $3 D $4", params: [1, 2, 3, 4] });
  });

  it("does not run until it is awaited, like Neon", async () => {
    const { run } = fakeRun();
    const sql = makeSql(run);
    const q = sql`SELECT 1`;
    expect(run).not.toHaveBeenCalled();
    expect(await q).toEqual([{ ok: 1 }]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("works with Promise.all, .catch and .finally, which is how the routes use it", async () => {
    const { run } = fakeRun();
    const sql = makeSql(run);
    const [a, b] = await Promise.all([sql`SELECT 1`, sql`SELECT 2`]);
    expect([a, b]).toEqual([[{ ok: 1 }], [{ ok: 1 }]]);

    const failing = makeSql(async () => {
      throw new Error("relation does not exist");
    });
    expect(await failing`SELECT 1`.catch(() => [])).toEqual([]);
    const done = vi.fn();
    await sql`SELECT 1`.finally(done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
