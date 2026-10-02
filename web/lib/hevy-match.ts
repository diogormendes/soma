/**
 * Mark Hevy workouts that already exist on Garmin as uploaded, so they are not
 * re-uploaded: reads both lists from the DB, matches them with the package's
 * timestamp matcher, and records the pairs on workout_enrichment. No Garmin
 * writes. A dedup layer for Stage 2 (#184).
 */
import type { QueryFn } from "./db";
import { matchHevyToGarmin, resolveExclusiveMatches, toUtcDate, type HevyDt, type GarminAct, type TimedMatch } from "hevy2garmin";

export { matchHevyToGarmin, resolveExclusiveMatches, toUtcDate };
export type { HevyDt, GarminAct, TimedMatch };

// One Garmin activity per Hevy workout (soma#994) is hevy2garmin's resolveExclusiveMatches.

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
