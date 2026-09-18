/**
 * Re-describe the Garmin activities whose description was written by a workout that does not
 * own them (soma#994).
 *
 *   cd web && set -a && . ./.env.local && set +a && \
 *   npx tsx scripts/gym-description-reclaim.mts            # dry run, prints what it would rewrite
 *   npx tsx scripts/gym-description-reclaim.mts --write    # rewrite the description on Garmin
 *
 * Until #994 the matcher could hand one Garmin activity to two Hevy workouts, and the gym
 * enrichment writes its description to the activity a claim names. So the later workout's
 * description landed on the earlier one's activity. Two of them are still wrong on Garmin: the
 * Upper session of 15 March reads "Lower", and the Legs session of 29 March reads "Lower" too.
 *
 * #994 stops it happening again and clears the false claims, but a claim is not a description.
 * This rewrites the text from the workout that does own the activity.
 *
 * ⚠️ It cannot undo the image. The share card is POSTed, so the wrong workout's card was ADDED
 * to the activity rather than replacing anything, and removing one needs a delete this has never
 * used. The description is what reaches Strava and what is readable, so that is what is fixed.
 *
 * ⚠️ Strava keeps the description it was given at forward time, months ago. This fixes Garmin.
 */
import { GarminAuth, DBTokenStore } from "garmin-auth";
import { healGarminTokenRow } from "../lib/garmin-token-heal";
import { getDb } from "../lib/db";
import { describeGymWorkout } from "../lib/garmin-gym-enrich";

const write = process.argv.includes("--write");
const sql = getDb();

// An activity whose newest enrichment came from a workout that does not claim it, and which some
// other workout does claim. The owner is the row the claim names, which #994 has just settled.
const stale = await sql`
  WITH newest AS (
    SELECT DISTINCT ON (l.destination_id) l.destination_id, l.source_id, l.processed_at
    FROM activity_sync_log l
    WHERE l.destination = 'garmin_enrichment' AND l.status = 'sent'
    ORDER BY l.destination_id, l.processed_at DESC
  )
  SELECT n.destination_id AS activity_id, n.source_id AS described_by, owner.hevy_id AS owner_id,
         owner.hevy_title, owner.hr_samples, owner.hr_source, owner.avg_hr, owner.max_hr,
         owner.calories, owner.duration_s, h.raw_json AS workout
  FROM newest n
  JOIN workout_enrichment owner ON owner.garmin_activity_id::text = n.destination_id
  JOIN hevy_raw_data h ON h.hevy_id = owner.hevy_id AND h.endpoint_name = 'workout'
  WHERE owner.hevy_id <> n.source_id
  ORDER BY n.destination_id`;

console.log(`activities described by the wrong workout: ${stale.length}`);
for (const r of stale) {
  console.log(`  ${r.activity_id}: described by ${String(r.described_by).slice(0, 8)}, owned by ${r.hevy_title} (${String(r.owner_id).slice(0, 8)})`);
}
if (!stale.length) process.exit(0);
if (!write) {
  console.log("dry run — pass --write to rewrite the description on Garmin");
  process.exit(0);
}

await healGarminTokenRow(sql);
const client = await new GarminAuth({ store: new DBTokenStore(process.env.DATABASE_URL!) }).client();

let rewritten = 0;
for (const r of stale) {
  const activityId = Number(r.activity_id);
  const desc = await describeGymWorkout(sql, {
    hevy_id: r.owner_id,
    workout: typeof r.workout === "string" ? JSON.parse(r.workout) : r.workout,
    hrSamples: typeof r.hr_samples === "string" ? JSON.parse(r.hr_samples) : (r.hr_samples ?? []),
    hrSource: r.hr_source ?? "unknown",
    avgHr: r.avg_hr, maxHr: r.max_hr, calories: r.calories, durationS: r.duration_s,
  });
  if (!desc) { console.warn(`  ${activityId}: no description produced, skipped`); continue; }
  await client.put(`/activity-service/activity/${activityId}`, { activityId, description: desc });
  // Appended, never a delete: the wrong enrichment did happen and the ledger says so.
  await sql`
    INSERT INTO activity_sync_log (source_platform, source_id, destination, destination_id, rule_id, status)
    VALUES ('hevy', ${r.owner_id}, 'garmin_enrichment', ${String(activityId)}, ${null}, 'sent')`;
  rewritten += 1;
  console.log(`  ${activityId}: rewritten as ${desc.split("\n")[0]}`);
}
console.log(`rewritten: ${rewritten}`);
process.exit(0);
