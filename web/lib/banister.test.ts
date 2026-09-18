import { describe, it, expect } from "vitest";
import { loadDailyLoadsFromDb } from "./banister";
import type { QueryFn } from "./db";
import { detectAnchorRuns, banisterPredict, DEFAULT_PARAMS } from "./banister";
import golden from "./banister.golden.json";

// The fixture's shape, stated once: the tests read exactly these fields.
const g = golden as {
  detect_anchors: { date: string; vdot: number }[];
  predict: { target: number; v: number }[];
};

describe("banister — Python parity (deterministic parts)", () => {
  it("detectAnchorRuns (HR + distance gate, VDOT, sorted by date)", () => {
    const runs = [
      { date: "2026-03-07", avg_hr: 178, distance_m: 5000, duration_s: 1276 },
      { date: "2026-02-01", avg_hr: 150, distance_m: 8000, duration_s: 2400 },
      { date: "2026-04-10", avg_hr: 175, distance_m: 1500, duration_s: 400 },
      { date: "2026-05-15", avg_hr: 180, distance_m: 10000, duration_s: 2700 },
      { date: "2026-01-20", avg_hr: 172, distance_m: 21097, duration_s: 6000 },
    ];
    const out = detectAnchorRuns(runs, 190, 0.9, 2000);
    expect(out.length).toBe(g.detect_anchors.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].date).toBe(g.detect_anchors[i].date);
      expect(out[i].vdot).toBeCloseTo(g.detect_anchors[i].vdot, 8);
    }
  });

  it("banisterPredict (npm package) matches Python's banister_predict", () => {
    const p = { p0: 45.0, k1: 0.05, k2: 0.08, tau1: 42, tau2: 7 };
    const loads: Array<[number, number]> = [
      [0, 50], [1, 0], [2, 80], [3, 60], [4, 0], [5, 90], [6, 0], [7, 100],
    ];
    for (const c of g.predict) expect(banisterPredict(p, loads, c.target)).toBeCloseTo(c.v, 8);
  });

  it("DEFAULT_PARAMS (npm) matches Python _DEFAULT_PARAMS", () => {
    expect(DEFAULT_PARAMS.p0).toBe(45.0);
    expect(DEFAULT_PARAMS.tau1).toBe(42);
    expect(DEFAULT_PARAMS.tau2).toBe(7);
  });
});

describe("loadDailyLoadsFromDb — the stream the fit reads (soma#993)", () => {
  const fake = (rows: Record<string, unknown>[]) =>
    (async () => rows) as unknown as QueryFn;

  it("scales each source the way the PMC does and gap-fills rest days with 0", async () => {
    const [loads, minDate] = await loadDailyLoadsFromDb(fake([
      { activity_date: "2026-09-14", source: "hevy", load_value: 200 },
      { activity_date: "2026-09-14", source: "garmin_running", load_value: 100 },
      // 09-15 has nothing, so it must appear as a zero rather than be skipped
      { activity_date: "2026-09-16", source: "garmin_walking", load_value: 50 },
    ]));
    expect(minDate).toBe("2026-09-14");
    expect(loads).toEqual([[0, 300], [1, 0], [2, 10]]); // hevy 1.0, running 1.0, walking 0.2
  });

  it("returns an empty stream rather than throwing when training_load is empty", async () => {
    expect(await loadDailyLoadsFromDb(fake([]))).toEqual([[], ""]);
  });
});
