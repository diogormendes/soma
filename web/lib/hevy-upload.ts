/**
 * Hevy→Garmin FIT upload — TS port of activity_replacer.process_workout +
 * pipeline._upload_enriched_to_garmin. Stage 2 phase 2 (#184).
 *
 * WARNING: uploadFit CREATES a real Garmin activity (non-idempotent) that
 * facterino forwards to Strava. Duplicate uploads = duplicate Strava activities.
 * Three dedup layers guard against that, ALL must hold before an upload:
 *   1. populateGarminIds() sets matched workouts to status='uploaded' first, so
 *      anything already on Garmin is excluded by the status='enriched' filter.
 *   2. activity_sync_log is an append-only ledger of what was sent to Garmin;
 *      workouts already logged as sent/external are excluded.
 *   3. Garmin itself returns 409 on a duplicate FIT; that is caught and matched
 *      via populateGarminIds instead of creating a duplicate.
 *
 * Wired into the sync pipeline (web/scripts/sync-pipeline.mts) so newly-enriched
 * workouts upload automatically; the three dedup layers above make that safe. It is
 * also exposed as a manual, dry-run-default route (api/cron/hevy-upload) for inspection.
 */
import { generateFit, uploadFit, renameActivity } from "hevy2garmin";
import type { GarminClient } from "garmin-auth";
import type { QueryFn } from "./db";
import { populateGarminIds } from "./hevy-match";
import { getAthleteProfile, type AthleteProfile } from "./athlete-profile";
import type { HevyWorkout } from "./hevy-types";

export interface UploadCandidate {
  hevyId: string;
  hevyTitle: string | null;
  /** The raw Hevy workout this candidate was built from. */
  workout: HevyWorkout;
  hrSamples: number[];
  hrSource: string;
  workoutDate: string | null;
  /** training_load.details.raw_load for this workout, when computed (hevy2garmin#523). */
  strengthLoad?: { load_value: number } | null;
}

/**
 * Pure dedup predicate: a workout may be uploaded only if its enrichment status
 * is exactly 'enriched' (not yet matched/uploaded) AND it is not already in the
 * sent ledger. Mirrors the SQL filter in _upload_enriched_to_garmin.
 */
export function isUploadCandidate(status: string, hevyId: string, alreadySent: Set<string>): boolean {
  return status === "enriched" && !alreadySent.has(hevyId);
}

/** Filter a list of enrichment rows to the upload candidates (pure). */
export function filterUploadCandidates(
  rows: Array<{ hevy_id: string; status: string }>,
  alreadySent: Set<string>,
): string[] {
  return rows.filter((r) => isUploadCandidate(r.status, r.hevy_id, alreadySent)).map((r) => r.hevy_id);
}

/** Load the set of hevy_ids already logged as sent/external to Garmin. */
export async function loadSentToGarmin(sql: QueryFn): Promise<Set<string>> {
  const rows = await sql`
    SELECT DISTINCT source_id FROM activity_sync_log
    WHERE source_platform = 'hevy' AND destination = 'garmin' AND status IN ('sent', 'external')`;
  return new Set(rows.map((r) => r.source_id));
}

/** Append a row to the activity_sync_log ledger. Mirrors log_activity_sync. */
export async function logActivitySync(
  sql: QueryFn,
  o: { sourceId: string; destination: string; destinationId?: string | null; ruleId?: number | null; status?: string; error?: string | null },
): Promise<void> {
  await sql`
    INSERT INTO activity_sync_log (source_platform, source_id, destination, destination_id, rule_id, status, error_message)
    VALUES ('hevy', ${o.sourceId}, ${o.destination}, ${o.destinationId ?? null}, ${o.ruleId ?? null}, ${o.status ?? "sent"}, ${o.error ?? null})`;
}

/**
 * Select the workouts eligible for upload: enriched, joined to their raw Hevy
 * workout, and NOT already sent to Garmin. Uses status='enriched' (layer 1: the
 * matcher demotes already-on-Garmin rows to 'uploaded') AND the ledger (layer 2).
 */
export async function getWorkoutsToUpload(sql: QueryFn): Promise<UploadCandidate[]> {
  const rows = await sql`
    SELECT we.hevy_id, we.hevy_title, h.raw_json, we.hr_samples, we.hr_source, we.workout_date,
           (SELECT (tl.details->>'raw_load')::float FROM training_load tl
             WHERE tl.hevy_id = we.hevy_id AND tl.source = 'hevy' ORDER BY tl.computed_at DESC LIMIT 1) AS raw_load
    FROM workout_enrichment we
    JOIN hevy_raw_data h ON h.hevy_id = we.hevy_id AND h.endpoint_name = 'workout'
    WHERE we.status = 'enriched'
      AND we.hevy_id NOT IN (
        SELECT source_id FROM activity_sync_log
        WHERE source_platform = 'hevy' AND destination = 'garmin' AND status IN ('sent', 'external')
      )
    ORDER BY we.workout_date DESC`;
  return rows.map((r) => ({
    hevyId: r.hevy_id,
    hevyTitle: r.hevy_title,
    workout: typeof r.raw_json === "string" ? JSON.parse(r.raw_json) : r.raw_json,
    hrSamples: typeof r.hr_samples === "string" ? JSON.parse(r.hr_samples) : (r.hr_samples ?? []),
    hrSource: r.hr_source ?? "unknown",
    workoutDate: r.workout_date ? String(r.workout_date) : null,
    strengthLoad: r.raw_load != null ? { load_value: Number(r.raw_load) } : null,
  }));
}

/**
 * The factor that puts soma's gym load on Garmin's scale (soma#991).
 *
 * The two numbers are both called training load and are not the same quantity.
 * banister's computeStrengthLoad produces sRPE, session RPE times minutes, on an
 * arbitrary scale: for these sessions it runs 382 / 477 / 665 at the quartiles
 * with a maximum of 1954 (n=340). Garmin's activityTrainingLoad is an oxygen-debt
 * number: for the runs it computes one for it runs 59 / 99 / 153 with a maximum
 * of 416 (n=108). Writing the sRPE number unchanged would put an ordinary gym
 * session above every run ever recorded, and Garmin's acute load and training
 * status are fed by it.
 *
 * No conversion can be fitted, because Garmin computes no load at all for strength
 * work: of the 86 strength summaries on the account, every one has an empty
 * activityTrainingLoad, so there is no pair of values to regress. What is left is
 * to align the distributions, and 0.21 is the ratio of the two medians (99.1 /
 * 476.9). It maps the gym quartiles to 80 / 100 / 140 and the hardest session to
 * 410, which sits beside the hardest run at 416.
 *
 * It is one constant on purpose. HEVY2GARMIN_TRAINING_LOAD_SCALE overrides it, and
 * 0 turns the write off entirely.
 */
export const GARMIN_LOAD_SCALE = 0.21;

/** The scale in force, falling back to the default rather than writing nonsense. */
export function trainingLoadScale(env: Record<string, string | undefined> = process.env): number {
  const raw = env.HEVY2GARMIN_TRAINING_LOAD_SCALE;
  if (raw === undefined || raw.trim() === "") return GARMIN_LOAD_SCALE;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : GARMIN_LOAD_SCALE;
}

/**
 * The load written into the FIT session as training_load_peak (hevy2garmin#523),
 * scaled per the constant above. Rounded, because Garmin shows a whole number.
 *
 * A session that rounds to 0 is not written: the field is optional and an explicit
 * zero reads as a measurement, not as an absence.
 *
 * Safe against the PMC only because soma#990 landed first. The activity this
 * creates comes back through backfillLoadFromHistory on the next sync, and if
 * Garmin does echo the load back, computeActivityLoad would read it and write a
 * second training_load row for a session that already has one. The exclusion added
 * in soma#990 is what stops that.
 */
export function trainingLoadForUpload(
  load: { load_value: number } | null | undefined,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const scale = trainingLoadScale(env);
  if (scale <= 0) return undefined;
  const v = Number(load?.load_value);
  if (!(v > 0)) return undefined;
  const scaled = Math.round(v * scale);
  return scaled > 0 ? scaled : undefined;
}

export interface UploadOutcome { hevyId: string; status: "uploaded" | "error"; activityId?: number | null; error?: string; }

/** Generate a FIT for one workout and upload it to Garmin, then rename. Side-effectful. */
export async function processWorkout(
  client: GarminClient,
  c: UploadCandidate,
  athlete?: AthleteProfile,
): Promise<UploadOutcome> {
  try {
    // HEVY2GARMIN_TIMEZONE (IANA, e.g. Europe/Athens) stamps local_timestamp into
    // the FIT so Garmin forwards the correct local time to Strava. Empty = raw UTC.
    // hevy2garmin's generateFit requires an exercises array whose entries carry a title and a
    // sets array; a stored workout can be missing any of the three, and passing that through
    // used to reach the FIT writer untyped.
    const workout = {
      ...c.workout,
      exercises: (c.workout.exercises ?? []).map((ex) => ({
        ...ex,
        title: ex.title ?? "",
        sets: ex.sets ?? [],
      })),
    };
    const { fit } = generateFit(workout, c.hrSamples.length ? c.hrSamples : null, {
      profile: {
        timezone: process.env.HEVY2GARMIN_TIMEZONE ?? "",
        // Only the three calorie fields, and only as a set. Omitted when the caller has no
        // profile, which leaves generateFit on its own defaults exactly as before (soma#986).
        ...(athlete
          ? { weightKg: athlete.weightKg, birthYear: athlete.birthYear, vo2max: athlete.vo2max }
          : {}),
      },
      trainingLoad: trainingLoadForUpload(c.strengthLoad),
    });
    const start = c.workout?.start_time;
    const { activityId } = await uploadFit(client, fit, start);
    if (c.hevyTitle && activityId) {
      try { await renameActivity(client, activityId, c.hevyTitle); } catch { /* rename is best-effort */ }
    }
    return { hevyId: c.hevyId, status: "uploaded", activityId: activityId ?? null };
  } catch (e) {
    return { hevyId: c.hevyId, status: "error", error: (e as Error).message };
  }
}

export interface UploadRunResult { candidates: number; uploaded: number; matchedAfter: number; outcomes: UploadOutcome[]; }

/**
 * Orchestrate the dedup'd upload: match existing activities first, select the
 * still-unsent enriched workouts, upload each, and log every success to the
 * ledger so it is never re-uploaded. A final match pass adopts any 409s.
 *
 * `dryRun` (default true) generates FITs and reports candidates WITHOUT uploading,
 * so the selection can be inspected against production before firing live.
 */
export async function uploadEnrichedToGarmin(
  sql: QueryFn,
  client: GarminClient,
  opts: { dryRun?: boolean } = {},
): Promise<UploadRunResult> {
  const dryRun = opts.dryRun ?? true;
  const athlete = await getAthleteProfile(sql);
  await populateGarminIds(sql); // layer 1: adopt already-present activities
  const candidates = await getWorkoutsToUpload(sql);

  const outcomes: UploadOutcome[] = [];
  if (!dryRun) {
    for (const c of candidates) {
      const outcome = await processWorkout(client, c, athlete);
      outcomes.push(outcome);
      if (outcome.status === "uploaded") {
        await logActivitySync(sql, { sourceId: c.hevyId, destination: "garmin", destinationId: outcome.activityId ? String(outcome.activityId) : null, status: "sent" });
        // The upload told us the activity id, so record it now.
        //
        // Until soma#982 it was only written into the ledger, and the enrichment row waited for
        // `populateGarminIds` to find the activity in `garmin_activity_raw` — which the NEXT
        // pipeline run ingests, so the pairing arrived an hour late and nothing in this pass
        // could act on the new activity. `populateGarminIds` still runs below and still repairs
        // a missing pairing; this just stops it being the only way one is ever made.
        if (outcome.activityId) {
          await sql`
            UPDATE workout_enrichment
            SET garmin_activity_id = ${outcome.activityId}, status = 'uploaded', updated_at = NOW()
            WHERE hevy_id = ${c.hevyId}`;
        }
      }
    }
  }

  const matchedAfter = await populateGarminIds(sql); // layer 3: adopt 409/async uploads
  return { candidates: candidates.length, uploaded: outcomes.filter((o) => o.status === "uploaded").length, matchedAfter, outcomes };
}
