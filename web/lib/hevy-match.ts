/**
 * Mark Hevy workouts that already exist on Garmin as uploaded, so they are not
 * re-uploaded: reads both lists from the DB, matches them with the package's
 * timestamp matcher, and records the pairs on workout_enrichment. No Garmin
 * writes. A dedup layer for Stage 2 (#184).
 */
import type { QueryFn } from "./db";
import { matchHevyToGarmin, toUtcDate, type HevyDt, type GarminAct } from "hevy2garmin";

export { matchHevyToGarmin, toUtcDate };
export type { HevyDt, GarminAct };

/** A match with the gap between the two starts, which is what decides a contested activity. */
export interface TimedMatch { hevyId: string; aid: number; deltaMs: number; }

/**
 * One Garmin activity belongs to at most one Hevy workout (soma#994).
 *
 * matchHevyToGarmin runs two passes. The first pairs a workout with an activity that starts
 * within a minute of it. The second hands any workout still unmatched the closest activity
 * within SIX HOURS, because Hevy can report a local time as though it were UTC. Nothing removes
 * an activity from the pool between the two, so a workout with no activity of its own takes one
 * that the first pass already paired exactly.
 *
 * That is not hypothetical. Three activities were each claimed by two workouts, and every one of
 * them has the same shape: one workout starting at the same second as the activity, and a second
 * starting 44 to 50 minutes later with nothing of its own. The gym description is written to the
 * activity a claim names, so the later workout's description overwrote the real one's.
 *
 * The winner is the smaller gap, and an exact tie goes to the lower hevy_id so that a re-run
 * reaches the same answer. A match whose workout or activity cannot be timed is dropped rather
 * than guessed at.
 */
export function resolveExclusiveMatches(
  matches: Array<{ hevyId: string; aid: number }>,
  hevyDts: HevyDt[],
  garminActs: GarminAct[],
): { kept: TimedMatch[]; dropped: TimedMatch[] } {
  const startOf = new Map(hevyDts.map((h) => [h.hevyId, h.date.getTime()]));
  const actAt = new Map(garminActs.map((g) => [g.aid, Date.parse(g.gmt + "Z")]));

  const timed: TimedMatch[] = [];
  const dropped: TimedMatch[] = [];
  for (const m of matches) {
    const h = startOf.get(m.hevyId), a = actAt.get(m.aid);
    if (h === undefined || a === undefined || isNaN(a)) { dropped.push({ ...m, deltaMs: NaN }); continue; }
    timed.push({ ...m, deltaMs: Math.abs(a - h) });
  }

  const best = new Map<number, TimedMatch>();
  for (const m of timed) {
    const cur = best.get(m.aid);
    if (!cur || m.deltaMs < cur.deltaMs || (m.deltaMs === cur.deltaMs && m.hevyId < cur.hevyId)) best.set(m.aid, m);
  }
  const kept = [...best.values()];
  const keptIds = new Set(kept.map((m) => m.hevyId + "\u0000" + m.aid));
  for (const m of timed) if (!keptIds.has(m.hevyId + "\u0000" + m.aid)) dropped.push(m);
  return { kept, dropped };
}

/**
 * Load Hevy workout times + Garmin strength activities from the DB, match, and
 * mark matched workouts as uploaded (garmin_activity_id set). Returns the number of
 * matches recorded and the number of false claims cleared.
 */
export async function populateGarminIds(sql: QueryFn): Promise<{ matched: number; cleared: number }> {
  const hevyRows = await sql`
    SELECT raw_json->>'id' AS hevy_id, raw_json->>'start_time' AS start_time
    FROM hevy_raw_data WHERE endpoint_name = 'workout'`;
  const hevyDts: HevyDt[] = [];
  for (const r of hevyRows) {
    const d = toUtcDate(r.start_time);
    if (d) hevyDts.push({ hevyId: r.hevy_id, date: d });
  }

  const gRows = await sql`
    SELECT activity_id, raw_json->>'startTimeGMT' AS start_gmt
    FROM garmin_activity_raw
    WHERE endpoint_name = 'summary'
      AND raw_json->'activityType'->>'typeKey' = 'strength_training'`;
  const garminActs: GarminAct[] = gRows
    .filter((r) => r.start_gmt)
    .map((r) => ({ gmt: r.start_gmt, aid: Number(r.activity_id) }));

  const { kept, dropped } = resolveExclusiveMatches(matchHevyToGarmin(hevyDts, garminActs), hevyDts, garminActs);
  for (const m of kept) {
    await sql`
      UPDATE workout_enrichment
      SET garmin_activity_id = ${m.aid}, status = 'uploaded', updated_at = NOW()
      WHERE hevy_id = ${m.hevyId}`;
  }

  // A claim this pass rejected has to go, or the three rows that already carry one keep it for
  // ever. The ledger is the veto: if it says this workout really was sent as this activity, then
  // it and the timestamps disagree and the answer is to report it, not to pick a side. The status
  // is deliberately left alone, because setting it back to 'enriched' would make a session from
  // last March an upload candidate and create a Garmin activity for it six months late.
  let cleared = 0;
  for (const m of dropped) {
    if (!Number.isFinite(m.deltaMs)) continue;
    const rows = await sql`
      UPDATE workout_enrichment we
      SET garmin_activity_id = NULL, updated_at = NOW()
      WHERE we.hevy_id = ${m.hevyId}
        AND we.garmin_activity_id = ${m.aid}
        AND NOT EXISTS (
          SELECT 1 FROM activity_sync_log l
          WHERE l.source_platform = 'hevy' AND l.source_id = we.hevy_id
            AND l.destination = 'garmin' AND l.destination_id = ${String(m.aid)}
        )
      RETURNING we.hevy_id`;
    cleared += rows.length;
  }

  // A claim also needs a workout behind it. One enrichment row is left over from a workout
  // deleted in Hevy on 23 February, so it never reaches matchHevyToGarmin at all and the loop
  // above can never rule on it, yet it still holds a claim on an activity that the workout 44
  // minutes earlier matches exactly. Every consumer joins hevy_raw_data, so the row is inert in
  // every other respect, and this is the one place it can still be wrong. Cleared only where
  // another row that does have its workout claims the same activity, and never against the ledger.
  const orphans = await sql`
    UPDATE workout_enrichment we
    SET garmin_activity_id = NULL, updated_at = NOW()
    WHERE we.garmin_activity_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM hevy_raw_data h
        WHERE h.hevy_id = we.hevy_id AND h.endpoint_name = 'workout')
      AND EXISTS (
        SELECT 1 FROM workout_enrichment other
        WHERE other.garmin_activity_id = we.garmin_activity_id
          AND other.hevy_id <> we.hevy_id
          AND EXISTS (
            SELECT 1 FROM hevy_raw_data h2
            WHERE h2.hevy_id = other.hevy_id AND h2.endpoint_name = 'workout'))
      AND NOT EXISTS (
        SELECT 1 FROM activity_sync_log l
        WHERE l.source_platform = 'hevy' AND l.source_id = we.hevy_id
          AND l.destination = 'garmin' AND l.destination_id = we.garmin_activity_id::text)
    RETURNING we.hevy_id`;
  return { matched: kept.length, cleared: cleared + orphans.length };
}
