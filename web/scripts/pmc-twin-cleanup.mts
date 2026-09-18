/**
 * Delete the training_load rows that are the Garmin twin of a Hevy workout, then
 * recompute the PMC (soma#990).
 *
 *   cd web && set -a && . ./.env.local && set +a && \
 *   npx tsx scripts/pmc-twin-cleanup.mts            # dry run, prints what it would delete
 *   npx tsx scripts/pmc-twin-cleanup.mts --write    # delete and recompute pmc_daily
 *
 * soma uploads its own gym sessions to Garmin, so each one came back through
 * backfillLoadFromHistory and got a second training_load row on top of the 'hevy'
 * row computeHevyLoads had already written for the same session. pmc-stream now
 * refuses those rows, but CTL, ATL and TSB are cumulative exponential averages, so
 * the rows already stored keep their effect until they are removed and the whole
 * curve is rebuilt. This does that once.
 *
 * A strength activity that NO workout_enrichment row claims is a real standalone
 * session (soma's are all from 2020, before Hevy) and keeps its row.
 */
import { getDb } from "../lib/db";
import { computeAndStorePmc, backfillLoadFromHistory } from "../lib/pmc-stream";

const write = process.argv.includes("--write");
const sql = getDb();

const twins = await sql`
  SELECT tl.id, tl.activity_date::text AS activity_date, tl.activity_id, tl.load_value,
         (SELECT string_agg(we.hevy_id, ',') FROM workout_enrichment we WHERE we.garmin_activity_id = tl.activity_id) AS hevy_ids
  FROM training_load tl
  WHERE tl.source = 'garmin_strength_training'
    AND EXISTS (SELECT 1 FROM workout_enrichment we WHERE we.garmin_activity_id = tl.activity_id)
  ORDER BY tl.activity_date`;

console.log(`twin rows: ${twins.length}`);
if (twins.length) {
  console.log(`  first ${twins[0].activity_date}, last ${twins[twins.length - 1].activity_date}`);
  const scaled = twins.reduce((a, t) => a + Number(t.load_value) * 0.3, 0);
  console.log(`  scaled load they contribute: ${scaled.toFixed(1)} (cross-modal 0.3)`);
}

const before = await sql`SELECT date::text AS date, ctl, atl, tsb FROM pmc_daily ORDER BY date DESC LIMIT 1`;
if (before.length) console.log(`pmc tip before: ${before[0].date} ctl=${Number(before[0].ctl).toFixed(2)} atl=${Number(before[0].atl).toFixed(2)} tsb=${Number(before[0].tsb).toFixed(2)}`);

if (!write) {
  console.log("dry run — pass --write to delete and recompute");
  process.exit(0);
}

const deleted = await sql`
  DELETE FROM training_load tl
  WHERE tl.source = 'garmin_strength_training'
    AND EXISTS (SELECT 1 FROM workout_enrichment we WHERE we.garmin_activity_id = tl.activity_id)
  RETURNING tl.id`;
console.log(`deleted ${deleted.length} rows`);

// The same call the sync pipeline makes. With the new predicate it must NOT put
// the rows back; anything above zero here means the exclusion is not working.
const reinserted = await backfillLoadFromHistory(sql);
console.log(`backfillLoadFromHistory re-inserted: ${reinserted} (must be 0)`);

const pmc = await computeAndStorePmc(sql);
console.log(`pmc recomputed: ${pmc.length} days`);
const tip = pmc[pmc.length - 1];
console.log(`pmc tip after: ${tip.date} ctl=${tip.ctl.toFixed(2)} atl=${tip.atl.toFixed(2)} tsb=${tip.tsb.toFixed(2)}`);
process.exit(reinserted === 0 ? 0 : 1);
