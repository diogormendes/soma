import { describe, it, expect } from "vitest";
import { resolveLivePlan, summariseTrailingLoad, planState, summarisePlan, type PlanRow, type PlanDayRow } from "./live-plan";

const TODAY = "2026-09-06";

const knox: PlanRow = { id: 1, plan_name: "Knoxville HM 2026", race_date: "2026-04-12", goal_time_seconds: 5400, status: "active" };

function pd(day_date: string, o: Partial<PlanDayRow> = {}): PlanDayRow {
  return {
    id: 1, day_date, week_number: 1, run_type: "easy", run_title: "Easy", target_distance_km: 8,
    target_duration_min: null, workout_steps: null, load_level: "low", gym_workout: null, gym_notes: null,
    completed: false, garmin_workout_id: null, garmin_push_status: null, actual_distance_km: null, ...o,
  };
}

describe("resolveLivePlan — the guard every training route goes through (#701)", () => {
  it("no plan → absent, nothing to anchor to", () => {
    const r = resolveLivePlan(null, [], TODAY);
    expect(r.engagement.state).toBe("absent");
    expect(r.plan).toBeNull();
    expect(r.days).toEqual([]);
  });

  it("THE BUG: Knoxville, status active, race five months ago → dormant, and the routes get NO plan and NO days", () => {
    const days = ["2026-03-10", "2026-03-20", "2026-04-05", "2026-04-11"].map((d) => pd(d, { completed: true }));
    const r = resolveLivePlan(knox, days, TODAY);
    expect(r.engagement.state).toBe("dormant");
    expect(r.engagement.planLive).toBe(false);
    expect(r.plan).toBeNull();
    expect(r.days).toEqual([]);
    expect(r.engagement.basis).toContain("Knoxville");
  });

  it("a live plan passes its plan and ALL its days through, past and future", () => {
    const days = [
      pd("2026-08-30", { completed: true }), pd("2026-09-02", { completed: true }),
      pd("2026-09-04", { completed: false }), pd("2026-09-08"), pd("2026-09-12"),
    ];
    const r = resolveLivePlan(knox, days, TODAY);
    expect(r.engagement.planLive).toBe(true);
    expect(r.plan?.id).toBe(1);
    expect(r.days).toHaveLength(5);
  });

  it("plan exists but is not being followed → partial, and routes still get NO plan", () => {
    const days = [pd("2026-08-28"), pd("2026-08-31"), pd("2026-09-03"), pd("2026-09-05"), pd("2026-09-09")];
    const r = resolveLivePlan(knox, days, TODAY);
    expect(r.engagement.state).toBe("partial");
    expect(r.engagement.planLive).toBe(false);
    expect(r.plan).toBeNull();
    expect(r.days).toEqual([]);
  });

  it("an archived plan is absent regardless of its days", () => {
    const r = resolveLivePlan({ ...knox, status: "archived" }, [pd("2026-09-05", { completed: true })], TODAY);
    expect(r.engagement.state).toBe("absent");
    expect(r.plan).toBeNull();
  });
});

describe("summariseTrailingLoad — the 'if you keep doing what you're doing' baseline", () => {
  const row = (date: string, daily_load: number | null) => ({ date, daily_load });

  it("empty is zero, not NaN", () => {
    const t = summariseTrailingLoad([], TODAY);
    expect(t).toEqual({ windowDays: 28, meanDailyLoad: 0, activeDays: 0 });
  });

  it("averages over the whole window, including rest days, so a 3-session week reads honestly", () => {
    const rows = [row("2026-09-01", 280), row("2026-09-03", 140), row("2026-09-05", 280)];
    const t = summariseTrailingLoad(rows, TODAY, 7);
    expect(t.meanDailyLoad).toBe(100); // 700 / 7 days
    expect(t.activeDays).toBe(3);
  });

  it("ignores rows outside the window, including future-dated ones", () => {
    const rows = [row("2026-08-01", 999), row("2026-09-07", 999), row("2026-09-06", 70)];
    const t = summariseTrailingLoad(rows, TODAY, 7);
    expect(t.meanDailyLoad).toBe(10);
    expect(t.activeDays).toBe(1);
  });

  it("null loads count as zero and not as active days", () => {
    const rows = [row("2026-09-05", null), row("2026-09-06", 140)];
    const t = summariseTrailingLoad(rows, TODAY, 7);
    expect(t.meanDailyLoad).toBe(20);
    expect(t.activeDays).toBe(1);
  });

  it("the window edge is inclusive on both ends", () => {
    const rows = [row("2026-08-10", 28), row("2026-08-09", 999)];
    const t = summariseTrailingLoad(rows, TODAY, 28); // window = Aug 10 .. Sep 6
    expect(t.meanDailyLoad).toBe(1);
    expect(t.activeDays).toBe(1);
  });
});

describe("planState / summarisePlan — the lifecycle from facts (#926)", () => {
  const today = "2026-09-12";
  const plan = (o: Partial<{ status: string | null; race_date: string | null; dropped_at: string | null }> = {}) => ({
    id: 1, plan_name: "Knoxville HM 2026", race_date: "2026-04-12", goal_time_seconds: 5700, status: "active", dropped_at: null, created_at: "2026-03-08", ...o,
  });
  const day = (day_date: string, o: Partial<{ run_type: string | null; completed: boolean | null; garmin_push_status: string | null; garmin_workout_id: string | null }> = {}) => ({
    id: 1, day_date, week_number: 1, run_type: "easy", run_title: "Easy", target_distance_km: 5, target_duration_min: null, workout_steps: null,
    load_level: null, gym_workout: null, gym_notes: null, completed: false, garmin_workout_id: null, garmin_push_status: null, actual_distance_km: null, ...o,
  });
  const eng = (planLive: boolean) => ({ state: planLive ? "complete" : "dormant", coverage: 0, basis: "", planLive, planName: null, trailingCompletion: null } as const);

  it("no plan is none; a race in the past is finished whatever the flag says", () => {
    expect(planState(null, eng(false), today)).toBe("none");
    expect(planState(plan(), eng(false), today)).toBe("finished");
    expect(planState(plan(), eng(true), today)).toBe("finished");
  });
  it("a race ahead is live when followed and paused when not", () => {
    expect(planState(plan({ race_date: "2026-10-18" }), eng(true), today)).toBe("live");
    expect(planState(plan({ race_date: "2026-10-18" }), eng(false), today)).toBe("paused");
  });
  it("dropped_at wins, and a superseded plan reads finished or dropped by its race date", () => {
    expect(planState(plan({ race_date: "2026-10-18", dropped_at: "2026-09-12T10:00:00Z" }), eng(true), today)).toBe("dropped");
    expect(planState(plan({ status: "inactive" }), eng(false), today)).toBe("finished");
    expect(planState(plan({ status: "inactive", race_date: "2026-10-18" }), eng(false), today)).toBe("dropped");
  });
  it("summarises sessions done out of prescribed non-rest days and the pushed workouts still ahead", () => {
    const s = summarisePlan(plan({ race_date: "2026-10-18" }), [
      day("2026-09-08", { completed: true, garmin_push_status: "pushed", garmin_workout_id: "1" }),
      day("2026-09-10", { run_type: "rest" }),
      day("2026-09-11", { completed: false }),
      day("2026-09-14", { garmin_push_status: "pushed", garmin_workout_id: "2" }),
      day("2026-09-16", { garmin_push_status: "pending" }),
    ], today);
    expect(s.sessionsPlanned).toBe(4);
    expect(s.sessionsDone).toBe(1);
    expect(s.pushedAhead).toBe(1);
    expect(s.state).toBe("live");
  });
});
