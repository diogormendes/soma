/**
 * Banister impulse-response fit — TS port of the DB glue in
 * sync/src/training_engine/banister.py. The model itself (predict + the
 * differential-evolution fit that matches scipy) lives in the `banister` npm
 * package (drkostas/banister, verified against scipy in Phase-0); this module
 * is the soma-specific DB layer: anchor detection from Garmin runs, daily-load
 * loading (same cross-modal signal as the PMC), and fit_from_db which stores
 * banister_params. Stage: training engine (#187). DB-only.
 *
 * The DE fit is stochastic, so fitted params / current_vdot are close to but
 * not bit-identical to the Python (scipy) fit — this is a model fit, not a
 * deterministic transform.
 */
import { banisterPredict, fitBanister, DEFAULT_PARAMS, dailyLoadSeries, detectAnchorRuns, type BanisterParams, type DailyLoad, type Anchor, type RunInput, type AnchorRun } from "banister";
import type { QueryFn } from "./db";
import { dateInAthleteTz } from "./athlete-tz";

export type { BanisterParams };
export { banisterPredict, DEFAULT_PARAMS, detectAnchorRuns, type RunInput, type AnchorRun };

/** Today (YYYY-MM-DD) in the athlete's timezone (soma#872). */
function athleteToday(now: Date = new Date()): string {
  return dateInAthleteTz(now);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

// Anchor detection (a hard run of at least 2 km, with its VDOT) is banister's detectAnchorRuns.

/** Load running-activity anchors from garmin_activity_raw. Port of load_anchors_from_db. */
export async function loadAnchorsFromDb(sql: QueryFn, estimatedHrmax = 190): Promise<AnchorRun[]> {
  const rows = await sql`
    SELECT activity_id, raw_json FROM garmin_activity_raw
    WHERE endpoint_name = 'summary'
      AND raw_json->'activityType'->>'typeKey' = 'running'
    ORDER BY (raw_json->>'startTimeLocal')::date ASC`;
  const runs: RunInput[] = [];
  for (const row of rows) {
    const d = typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json;
    const avgHr = d.averageHR, distanceM = d.distance, durationS = d.duration, startLocal = d.startTimeLocal || "";
    if (!avgHr || !distanceM || !durationS || !startLocal) continue;
    runs.push({
      date: String(startLocal).slice(0, 10),
      avg_hr: Number(avgHr), distance_m: Number(distanceM), duration_s: Number(durationS),
      activity_id: row.activity_id,
    });
  }
  return detectAnchorRuns(runs, estimatedHrmax);
}

/**
 * Load daily training loads from training_load with the SAME cross-modal scaling
 * as the PMC, gap-filled with 0. Returns [dailyLoads, minDate]. Port of
 * _load_daily_loads_from_db.
 */
export async function loadDailyLoadsFromDb(sql: QueryFn): Promise<[DailyLoad[], string]> {
  const rows = await sql`
    SELECT activity_date::text AS activity_date, source, load_value
    FROM training_load ORDER BY activity_date`;
  if (!rows.length) return [[], ""];

  // Cross-modal scaling, per-day sums and rest days as 0 are banister's dailyLoadSeries, the same
  // series the PMC reads.
  const series = dailyLoadSeries(rows.map((r) => ({ date: r.activity_date, source: r.source, load: Number(r.load_value) })));
  const startDate = series[0][0];
  const dailyLoads: DailyLoad[] = series.map(([d, load]) => [daysBetween(startDate, d), load]);
  return [dailyLoads, startDate];
}

export interface BanisterFitResult extends BanisterParams { n_anchors: number; current_vdot: number; }

/**
 * End-to-end Banister fit from DB: load anchors + daily loads, filter anchors to
 * the last 2 years, convert to day indices, fit, predict today's VDOT, and store
 * a banister_params row. Port of fit_from_db. Returns the fitted params +
 * n_anchors + current_vdot. DB.
 */
export async function fitFromDb(sql: QueryFn, estimatedHrmax = 190): Promise<BanisterFitResult> {
  let anchors = await loadAnchorsFromDb(sql, estimatedHrmax);
  const [dailyLoads, minDate] = await loadDailyLoadsFromDb(sql);

  const cutoff = new Date(Date.parse(athleteToday() + "T00:00:00Z") - 730 * 86_400_000).toISOString().slice(0, 10);
  const recent = anchors.filter((a) => a.date.slice(0, 10) >= cutoff);
  if (recent.length >= 2) anchors = recent;

  let anchorInputs: Anchor[] = [];
  if (minDate && anchors.length) {
    anchorInputs = anchors.map((a) => ({ day_index: daysBetween(minDate, a.date.slice(0, 10)), vdot: a.vdot }));
  }

  const params = fitBanister(dailyLoads, anchorInputs);
  const todayIdx = minDate ? daysBetween(minDate, athleteToday()) : 0;
  const currentVdot = dailyLoads.length ? banisterPredict(params, dailyLoads, todayIdx) : params.p0;

  await sql`
    INSERT INTO banister_params (p0, k1, k2, tau1, tau2, n_anchors, current_vdot, fitted_at)
    VALUES (${params.p0}, ${params.k1}, ${params.k2}, ${params.tau1}, ${params.tau2},
            ${anchorInputs.length}, ${currentVdot}, NOW())`;

  return { ...params, n_anchors: anchorInputs.length, current_vdot: currentVdot };
}
