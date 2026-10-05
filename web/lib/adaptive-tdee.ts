/**
 * Adaptive TDEE + deficit-duration — wires macro-engine-core's adaptive engine
 * into soma. Display-only: it surfaces how the body's effective TDEE has drifted
 * from the reported figure and whether a diet break is due. It never changes the
 * day's targets (the user decides).
 *
 * No schema change: DayPoints come from `nutrition_day` (intake, tdee) joined to
 * `weight_log` (weight), and the deficit-phase duration is counted from
 * consecutive recent deficit days that aren't diet breaks / refeeds.
 */
import { computeAdaptiveTdee, recommendDietBreak, type DietBreakLevel } from "macro-engine-core";
import { todayAthlete } from "./athlete-tz";
import { keepPlausible } from "./weigh-ins";
import type { QueryFn } from "@/lib/db";
import { buildDayPoints, countDeficitDuration, type AdaptiveDayRow as DayRow, type WeighIn } from "macro-engine-core";

// The pure inputs (which days count, the deficit phase length, the day points) live in
// macro-engine-core (adaptive-input).
export { buildDayPoints, countDeficitDuration, type WeighIn } from "macro-engine-core";

export interface AdaptiveContext {
  effectiveTdee: number;
  reportedTdee: number;
  discrepancyPct: number;
  driftFlag: boolean;
  deficitDurationDays: number;
  dietBreakLevel: DietBreakLevel;
}

// How far back to look. 130 days covers the diet-break ceiling (112) for the
// duration count; the adaptive-TDEE window itself is only the last 14.
const LOOKBACK_DAYS = 130;

export async function computeAdaptiveContext(sql: QueryFn, today: string = todayAthlete()): Promise<AdaptiveContext | null> {
  // Coverage = (distinct slots with logged kcal ∪ explicitly skipped slots) / 4.
  // Computed in SQL so every consumer of these rows sees the same number.
  // Only the four canonical slots count; a slot both logged and skipped
  // counts once (the UNION dedupes).
  const rows = (await sql`
    SELECT n.date::text AS date, n.actual_calories, n.tdee_used, n.target_calories,
           n.deficit_used, n.is_diet_break, n.is_refeed, n.status,
           (
             SELECT COUNT(DISTINCT s)::float / 4
             FROM (
               SELECT m.meal_slot AS s FROM meal_log m
                WHERE m.date = n.date AND m.calories > 0
               UNION
               SELECT unnest(COALESCE(n.skipped_slots, ARRAY[]::text[]))
             ) u
             WHERE u.s IN ('breakfast', 'lunch', 'dinner', 'pre_sleep')
           ) AS coverage
    FROM nutrition_day n
    WHERE n.date >= ${today}::date - ${`${LOOKBACK_DAYS} days`}::interval
    ORDER BY n.date
  `) as unknown as DayRow[];
  if (!rows.length) return null;

  const weightRows = (await sql`
    SELECT date::text AS date, weight_grams / 1000.0 AS weight_kg
    FROM weight_log
    WHERE coalesce(upper(source_type), '') <> 'USER_SETTING' AND weight_grams IS NOT NULL
      AND date >= ${today}::date - ${`${LOOKBACK_DAYS} days`}::interval
    ORDER BY date
  `) as unknown as { date: string; weight_kg: number }[];
  // A mistyped weigh-in moves the TDEE, because the TDEE is computed FROM the weight change, so a
  // typo reads as a real gain or loss and changes his calorie target. Judged against neighbours.
  const weights: WeighIn[] = keepPlausible(
    weightRows.map((w) => ({ date: w.date, weightKg: Number(w.weight_kg) })),
    "adaptive-tdee",
  );

  const days = buildDayPoints(rows, weights);
  const adaptive = computeAdaptiveTdee(days);
  if (!adaptive) return null;

  const deficitDurationDays = countDeficitDuration(rows);
  return {
    ...adaptive,
    deficitDurationDays,
    dietBreakLevel: recommendDietBreak(deficitDurationDays),
  };
}
