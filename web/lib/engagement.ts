/**
 * Engagement: does a module actually have the user's data, or is it assuming?
 *
 * The shared states and the nutrition rules live in macro-engine-core (engagement), with the
 * reasoning. The training rule stays here because it reads soma's plan rows.
 */
import { daysBetween } from "@/lib/coverage";
import type { Engagement } from "macro-engine-core";

export {
  type EngagementState,
  type Engagement,
  type NutritionDayInput,
  WEEK_ENGAGEMENT_FLOOR_DAYS,
  WEEK_WINDOW_DAYS,
  nutritionDayState,
  nutritionEngagement,
} from "macro-engine-core";

// ── Training ─────────────────────────────────────────────────────────────────

/**
 * A plan is LIVE only when the user is living by it, not merely when a status
 * flag says 'active'. Calibrated: the Knoxville HM plan was followed at 32% in
 * its best month, so 25% is the floor for "following". ±7 days is the window
 * in which a plan has to have prescribed something to count as current.
 */
export const PLAN_LIVE_WINDOW_DAYS = 7;
export const PLAN_TRAILING_DAYS = 14;
export const PLAN_COMPLETION_FLOOR = 0.25;

export interface PlanInput {
  status: string | null;
  planName: string | null;
  raceDate: string | null;
}

export interface PlanDayInput {
  day_date: string;
  run_type: string | null;
  completed: boolean | null;
}

export interface TrainingEngagement extends Engagement {
  planLive: boolean;
  planName: string | null;
  /** Prescribed non-rest days in the trailing window that were completed, 0..1, or null when none prescribed. */
  trailingCompletion: number | null;
}

export function trainingEngagement(
  plan: PlanInput | null,
  days: PlanDayInput[],
  today: string,
): TrainingEngagement {
  if (!plan || plan.status !== "active") {
    return {
      state: "absent",
      coverage: 0,
      basis: "no active training plan",
      planLive: false,
      planName: plan?.planName ?? null,
      trailingCompletion: null,
    };
  }

  const nearby = days.some((d) => Math.abs(daysBetween(d.day_date, today)) <= PLAN_LIVE_WINDOW_DAYS);
  const trailing = days.filter((d) => {
    const back = daysBetween(d.day_date, today);
    return back >= 0 && back < PLAN_TRAILING_DAYS && d.run_type !== "rest";
  });
  const trailingCompletion = trailing.length
    ? trailing.filter((d) => d.completed === true).length / trailing.length
    : null;

  if (!nearby) {
    const ended = plan.raceDate ? ` (race ${plan.raceDate})` : "";
    return {
      state: "dormant",
      coverage: 0,
      basis: `${plan.planName ?? "plan"} has no sessions within ${PLAN_LIVE_WINDOW_DAYS} days${ended}`,
      planLive: false,
      planName: plan.planName,
      trailingCompletion,
    };
  }

  // Nearby days but nothing prescribed yet in the trailing window (brand-new
  // plan): live, and not penalised for having no history.
  if (trailingCompletion === null) {
    return {
      state: "complete",
      coverage: 1,
      basis: `${plan.planName ?? "plan"} is current; no sessions due yet`,
      planLive: true,
      planName: plan.planName,
      trailingCompletion,
    };
  }

  const pct = Math.round(trailingCompletion * 100);
  if (trailingCompletion >= PLAN_COMPLETION_FLOOR) {
    return {
      state: "complete",
      coverage: trailingCompletion,
      basis: `${pct}% of planned sessions done in the last ${PLAN_TRAILING_DAYS} days`,
      planLive: true,
      planName: plan.planName,
      trailingCompletion,
    };
  }
  return {
    state: "partial",
    coverage: trailingCompletion,
    basis: `plan exists but ${pct}% of planned sessions done in the last ${PLAN_TRAILING_DAYS} days`,
    planLive: false,
    planName: plan.planName,
    trailingCompletion,
  };
}
