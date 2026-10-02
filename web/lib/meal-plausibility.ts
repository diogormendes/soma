// The pure part lives in macro-engine-core (meal-plausibility). This file keeps only soma's database read.
import type { QueryFn } from "./db";
import { todayAthlete } from "./athlete-tz";
import type { SlotStats, HistoryStats } from "macro-engine-core";

export {
  type SlotStats,
  type HistoryStats,
  type PlausibilityInput,
  type PlausibilityResult,
  MIN_MEALS,
  FALLBACK_SLOT_KCAL,
  FALLBACK_DAY_KCAL,
  MIN_SHARE_OF_SLOT,
  MIN_OVERSHOOT_KCAL,
  SLOT_SIGMA,
  DAY_SIGMA,
  amountsWereStated,
  slotCeiling,
  dayCeiling,
  enforcePlausibility,
} from "macro-engine-core";

/** His own distribution, from his own log. 180 days, which is long enough to be stable. */
export async function getHistoryStats(sql: QueryFn, today: string = todayAthlete()): Promise<HistoryStats> {
  const rows = (await sql`
    WITH m AS (
      SELECT meal_slot, calories FROM meal_log
      WHERE date >= ${today}::date - INTERVAL '180 days' AND calories > 0
    )
    SELECT meal_slot, count(*)::int AS n, avg(calories) AS mean,
           coalesce(stddev_samp(calories), 0) AS sd, max(calories) AS max
    FROM m GROUP BY meal_slot`) as Array<{ meal_slot: string; n: number; mean: number; sd: number; max: number }>;

  const dayRows = (await sql`
    WITH d AS (
      SELECT date, sum(calories) AS kcal FROM meal_log
      WHERE date >= ${today}::date - INTERVAL '180 days' GROUP BY date HAVING sum(calories) > 0
    )
    SELECT count(*)::int AS n, avg(kcal) AS mean, coalesce(stddev_samp(kcal), 0) AS sd, max(kcal) AS max
    FROM d`) as Array<{ n: number; mean: number; sd: number; max: number }>;

  const slots = new Map<string, SlotStats>();
  for (const r of rows) {
    slots.set(String(r.meal_slot), {
      n: Number(r.n), mean: Number(r.mean), sd: Number(r.sd), max: Number(r.max),
    });
  }
  const d = dayRows[0];
  return {
    slots,
    day: d ? { n: Number(d.n), mean: Number(d.mean), sd: Number(d.sd), max: Number(d.max) }
           : { n: 0, mean: 0, sd: 0, max: 0 },
  };
}
