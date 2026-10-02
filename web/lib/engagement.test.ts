import { describe, it, expect } from "vitest";
import {
  trainingEngagement,
  PLAN_COMPLETION_FLOOR,
  PLAN_LIVE_WINDOW_DAYS,
  type PlanDayInput,
} from "./engagement";

const TODAY = "2026-09-06";

describe("trainingEngagement", () => {
  const knox = { status: "active", planName: "Knoxville HM 2026", raceDate: "2026-04-12" };
  const pd = (day_date: string, o: Partial<PlanDayInput> = {}): PlanDayInput => ({ day_date, run_type: "easy", completed: false, ...o });

  it("floor is 25%, calibrated from Knoxville's best month at 32% (#698)", () => {
    expect(PLAN_COMPLETION_FLOOR).toBe(0.25);
    expect(PLAN_LIVE_WINDOW_DAYS).toBe(7);
  });

  it("no plan is absent", () => {
    const e = trainingEngagement(null, [], TODAY);
    expect(e.state).toBe("absent");
    expect(e.planLive).toBe(false);
  });

  it("an archived plan is absent even with recent days", () => {
    const e = trainingEngagement({ ...knox, status: "archived" }, [pd("2026-09-05", { completed: true })], TODAY);
    expect(e.state).toBe("absent");
    expect(e.planLive).toBe(false);
  });

  it("THE BUG: Knoxville, status active, race five months ago, no days near today → dormant", () => {
    const days = ["2026-03-01", "2026-03-15", "2026-04-01", "2026-04-10"].map((d) => pd(d, { completed: true }));
    const e = trainingEngagement(knox, days, TODAY);
    expect(e.state).toBe("dormant");
    expect(e.planLive).toBe(false);
    expect(e.basis).toContain("Knoxville");
    expect(e.basis).toContain("2026-04-12");
  });

  it("a day exactly at the window edge counts as nearby", () => {
    const e = trainingEngagement(knox, [pd("2026-09-13", { completed: false })], TODAY);
    expect(e.state).not.toBe("dormant");
  });

  it("a day one past the window edge does not", () => {
    const e = trainingEngagement(knox, [pd("2026-09-14")], TODAY);
    expect(e.state).toBe("dormant");
  });

  it("nearby days but none prescribed in the trailing window (brand-new plan) is live and unpenalised", () => {
    const e = trainingEngagement(knox, [pd("2026-09-08"), pd("2026-09-10")], TODAY);
    expect(e.state).toBe("complete");
    expect(e.planLive).toBe(true);
    expect(e.trailingCompletion).toBeNull();
  });

  it("rest days are excluded from the completion denominator", () => {
    const days = [pd("2026-09-01", { run_type: "rest", completed: false }), pd("2026-09-02", { completed: true }), pd("2026-09-08")];
    const e = trainingEngagement(knox, days, TODAY);
    expect(e.trailingCompletion).toBe(1);
    expect(e.state).toBe("complete");
  });

  // Days are generated backwards from today; only those inside the 14-day
  // trailing window count, so `total` is capped there and the expectation is
  // computed from what actually lands in the window.
  const followCases: [string, number, number, string, boolean][] = [
    ["a Knoxville-like rate above the floor (4 of 14 ≈ 29%) is live", 4, 14, "complete", true],
    ["exactly at the floor is live", 1, 4, "complete", true],
    ["just under the floor: plan exists, not followed → partial, not live", 1, 5, "partial", false],
    ["Knoxville April rate 0% → partial, not live", 0, 9, "partial", false],
    ["everything done is live", 7, 7, "complete", true],
    ["days beyond the trailing window are ignored in the rate", 6, 19, "complete", true],
  ];
  for (const [name, done, total, wantState, wantLive] of followCases) {
    it(name, () => {
      const days: PlanDayInput[] = [];
      for (let i = 0; i < total; i++) {
        const d = new Date(Date.UTC(2026, 8, 6 - i)).toISOString().slice(0, 10);
        days.push(pd(d, { completed: i < done }));
      }
      const inWindow = Math.min(total, 14);
      const doneInWindow = Math.min(done, inWindow);
      const e = trainingEngagement(knox, days, TODAY);
      expect(e.state).toBe(wantState);
      expect(e.planLive).toBe(wantLive);
      expect(e.trailingCompletion).toBeCloseTo(doneInWindow / inWindow, 6);
    });
  }
});
