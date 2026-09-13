import { describe, it, expect } from "vitest";
import {
  vdotFromRace, timeFromVdot, velocityAtVo2max, paceForZone, allPaces, hmGoalPaces, adjustVdotForWeight,
} from "./vdot";
import golden from "./vdot.golden.json";

// The fixture's shape, stated once: each case is an input and the Python result.
const g = golden as {
  vdot_from_race: { d: number; t: number; v: number }[];
  time_from_vdot: { vdot: number; d: number; v: number }[];
  velocity_at_vo2max: { vdot: number; v: number }[];
  pace_for_zone: { vdot: number; z: string; v: number | [number, number] }[];
  all_paces: { vdot: number; v: Record<string, number[]> }[];
  hm_goal_paces: { vdot: number; v: Record<string, number> }[];
  adjust: { vdot: number; o: number; n: number; v: number }[];
};

describe("VDOT engine — Python parity", () => {
  it("vdotFromRace", () => {
    for (const c of g.vdot_from_race) expect(vdotFromRace(c.d, c.t)).toBeCloseTo(c.v, 8);
  });
  it("timeFromVdot (binary search, 100 iters)", () => {
    for (const c of g.time_from_vdot) expect(timeFromVdot(c.vdot, c.d)).toBeCloseTo(c.v, 4);
  });
  it("velocityAtVo2max", () => {
    for (const c of g.velocity_at_vo2max) expect(velocityAtVo2max(c.vdot)).toBeCloseTo(c.v, 8);
  });
  it("paceForZone (int or [fast, slow])", () => {
    for (const c of g.pace_for_zone) {
      const out = paceForZone(c.vdot, c.z);
      if (Array.isArray(c.v)) { expect(Array.isArray(out)).toBe(true); expect(out).toEqual(c.v); }
      else expect(out).toBe(c.v);
    }
  });
  it("allPaces", () => {
    for (const c of g.all_paces) {
      const out = allPaces(c.vdot) as unknown as Record<string, unknown>;
      for (const k of ["E", "M", "T", "I", "R"]) expect(out[k]).toEqual(c.v[k]);
    }
  });
  it("hmGoalPaces", () => {
    for (const c of g.hm_goal_paces) expect(hmGoalPaces(c.vdot)).toEqual(c.v);
  });
  it("adjustVdotForWeight", () => {
    for (const c of g.adjust) expect(adjustVdotForWeight(c.vdot, c.o, c.n)).toBeCloseTo(c.v, 8);
  });
});
