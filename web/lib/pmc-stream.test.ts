import { describe, it, expect } from "vitest";
import { backfillLoadFromHistory, computeAndStorePmc } from "./pmc-stream";
import type { QueryFn } from "./db";

/**
 * A fake sql that records the SELECT it was handed and can answer with rows.
 * backfillLoadFromHistory does its INSERT through the .query escape hatch, so
 * the fake carries one too and records the parameters it was given.
 */
function fakeSql(rows: Record<string, unknown>[]) {
  const selects: string[] = [];
  const inserts: { text: string; params: unknown[] }[] = [];
  const fn = (async (strings: TemplateStringsArray) => {
    selects.push(strings.join("?"));
    return rows;
  }) as unknown as QueryFn & { query(text: string, params: unknown[]): Promise<unknown[]> };
  (fn as unknown as { query: unknown }).query = async (text: string, params: unknown[]) => {
    inserts.push({ text, params });
    return [];
  };
  return { sql: fn, selects, inserts };
}

describe("backfillLoadFromHistory — the Garmin twin of a Hevy workout is not a second load", () => {
  it("excludes any activity a workout_enrichment row claims (soma#990)", async () => {
    const { sql, selects } = fakeSql([]);
    await backfillLoadFromHistory(sql);
    const q = selects[0].replace(/\s+/g, " ");
    // soma uploads its own gym sessions to Garmin. Without this predicate each one
    // comes back as a strength_training summary and gets a training_load row on top
    // of the 'hevy' row computeHevyLoads already wrote, so every gym day counts twice.
    expect(q).toContain("workout_enrichment");
    expect(q).toMatch(/NOT EXISTS[\s\S]*workout_enrichment[\s\S]*garmin_activity_id = g\.activity_id/);
  });

  it("only ever suppresses a strength activity (soma#996)", async () => {
    const { sql, selects } = fakeSql([]);
    await backfillLoadFromHistory(sql);
    const q = selects[0].replace(/\s+/g, " ");
    // The matcher does mis-claim: three activities are held by two Hevy workouts each.
    // A claim that landed on a run must not delete that run's load, so the exclusion
    // names the type soma uploads rather than trusting the claim alone.
    expect(q).toMatch(/workout_enrichment[\s\S]*'strength_training'/);
  });

  it("still loads an activity nothing claims", async () => {
    const { sql, inserts } = fakeSql([
      { activity_id: 4242, raw_json: { startTimeLocal: "2020-02-05 18:00:00", duration: 3600, averageHR: 120, maxHR: 150, activityType: { typeKey: "strength_training" } } },
    ]);
    const n = await backfillLoadFromHistory(sql);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toContain("2020-02-05");
    expect(inserts[0].params).toContain("garmin_strength_training");
    expect(n).toBe(0); // the fake's RETURNING is empty; the row was still offered
  });
});

describe("computeAndStorePmc", () => {
  it("scales each source before summing the day, so a gym day is not a run day", async () => {
    const { sql, inserts } = fakeSql([
      { activity_date: "2026-09-16", source: "hevy", load_value: 238 },
      { activity_date: "2026-09-16", source: "garmin_strength_training", load_value: 107 },
    ]);
    const pmc = await computeAndStorePmc(sql);
    expect(pmc).toHaveLength(1);
    // 238 x 1.0 + 107 x 0.3 = 270.1, which is exactly the double count #990 removes.
    expect(pmc[0].daily_load).toBeCloseTo(238 + 107 * 0.3, 5);
    expect(inserts).toHaveLength(1);
  });
});
