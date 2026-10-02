/**
 * Does the ingest find and collect a weigh-in that reached Garmin after its day was complete?
 *
 *   cd web && set -a && . ~/.config/soma/sync.env && set +a && npx tsx scripts/late-weigh-in-check.mts
 *
 * Reads Garmin with the LIVE client (tokens from the live database, refreshed nowhere else) and writes
 * only to verify_soma. Running the whole ingest against a copy would refresh Garmin tokens from the
 * copy's stale row and could invalidate the live login.
 */
import { GarminAuth, DBTokenStore } from "garmin-auth";
import { makeDb } from "../lib/db";
import { lateWeighInDates, syncDay, athleteToday } from "../lib/garmin-ingest";
import { processDay } from "../lib/garmin-parse-day";

const client = await new GarminAuth({ store: new DBTokenStore(process.env.DATABASE_URL!) }).client();
const copy = makeDb("postgresql://gkos@127.0.0.1:5432/verify_soma");
const [{ db }] = (await copy`SELECT current_database() AS db`) as unknown as { db: string }[];
if (db !== "verify_soma") throw new Error(`refusing: copy connection is ${db}`);

const to = athleteToday();
const from = new Date(Date.parse(`${to}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
const range = await client.connectapi(`/weight-service/weight/range/${from}/${to}?includeAll=true`);
const stored = ((await copy`SELECT DISTINCT date::text AS date FROM weight_log WHERE date >= ${from}::date AND date <= ${to}::date`) as unknown as { date: string }[]).map((r) => r.date);
const late = lateWeighInDates(range, stored);
console.log(`window ${from}..${to}: copy holds ${stored.length} days, Garmin has weigh-ins it lacks on: ${late.join(", ") || "(none)"}`);
if (!late.length) process.exit(1);

const day = late.includes("2026-09-28") ? "2026-09-28" : late[0];
const profile = (await client.connectapi("/userprofile-service/socialProfile")) as { displayName: string };
await syncDay(client, copy, profile.displayName, day);
const parsed = await processDay(copy, day);
const after = (await copy`SELECT date::text AS date, weight_grams, source_type FROM weight_log WHERE date = ${day}::date`) as unknown as { date: string; weight_grams: number; source_type: string }[];
console.log(`collected ${day} into the copy: processDay weights=${parsed.weights}; row now: ${after.map((r) => `${r.weight_grams / 1000} kg ${r.source_type}`).join(", ") || "(still none)"}`);
const again = lateWeighInDates(range, [...stored, ...after.map((r) => r.date)]);
console.log(after.length && !again.includes(day) ? `PASS ${day} found, collected, and no longer late` : `FAIL ${day}`);
process.exit(after.length ? 0 : 1);
