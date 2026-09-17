/**
 * The description soma puts on a gym workout, on Garmin and through it on Strava.
 *
 * Restored from `sync/src/strava_description.py`, which generated this text until the Python
 * pipeline was deleted on 2026-07-16 (`9b312c9`). Fifty-seven Garmin activities still carry its
 * output, so the format here is matched to what shipped rather than redesigned, and the
 * separator, the emoji and the footer are the same ones the run and kite descriptions use.
 *
 * ⛔ NOT the same thing as hevy2garmin's `generateDescription`, and deliberately so. That one
 * prints one summary line per exercise, no personal records, no per-exercise heart rate, no RPE
 * and no notes, and it takes the maximum weight and the maximum reps of an exercise
 * INDEPENDENTLY, so two sets of 60kg by 8 and 40kg by 15 render as `60.0kg × 15`, a set that
 * never happened. Printing every set cannot misrepresent one (soma#981).
 */
import type { QueryFn } from "./db";
import type { HevyExercise, HevySet, HevyWorkout } from "./hevy-types";

/** Format weight in kg, rounding neatly. 0 becomes BW. */
export function formatWeight(kg: number): string {
  if (kg === 0) return "BW";
  const rounded = Number(kg.toFixed(1));
  return rounded === Math.trunc(rounded) ? `${Math.trunc(rounded)}kg` : `${rounded}kg`;
}

/** Format duration as "Xh Ym", or "Ym" under an hour. */
export function formatDuration(seconds: number): string {
  const minutes = Math.trunc(seconds / 60);
  if (minutes >= 60) {
    const h = Math.trunc(minutes / 60);
    return `${h}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

/** What `computePrs` found for one exercise, against everything logged before this workout. */
export interface PrInfo {
  /** This exercise template has never been logged before. */
  isNew: boolean;
  /** Heaviest single set, beaten. */
  weightPr: { next: number; prev: number } | null;
  /** Most volume in one session of this exercise, beaten. */
  volumePr: { next: number; prev: number } | null;
  /** Heaviest single set by weight times reps, beaten. */
  setPr: { next: number; prev: number } | null;
}

const normalSets = (ex: HevyExercise): HevySet[] =>
  (ex.sets ?? []).filter((s) => s.type === "normal");

const setVolume = (s: HevySet): number => (s.weight_kg ?? 0) * (s.reps ?? 0);

/**
 * Personal records for this workout's exercises, against PRIOR workouts only.
 *
 * `workoutStartTime` is what makes an old description honest: comparing against everything ever
 * logged would flag a record that was only a record at the time, or miss one that was. Scoped to
 * workouts sharing an exercise template so it reads a slice of the table rather than all of it.
 */
export async function computePrs(
  sql: QueryFn,
  hevyId: string,
  exercises: HevyExercise[],
  workoutStartTime?: string | null,
): Promise<Record<string, PrInfo>> {
  const templateIds = exercises
    .map((ex) => ex.exercise_template_id)
    .filter((t): t is string => Boolean(t));
  if (!templateIds.length) return {};

  const rows = workoutStartTime
    ? await sql`
        SELECT raw_json->'exercises' AS exercises
        FROM hevy_raw_data
        WHERE endpoint_name = 'workout'
          AND hevy_id != ${hevyId}
          AND raw_json->>'start_time' < ${workoutStartTime}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(raw_json->'exercises') AS ex
            WHERE ex->>'exercise_template_id' = ANY(${templateIds}::text[])
          )
        ORDER BY raw_json->>'start_time' ASC`
    : await sql`
        SELECT raw_json->'exercises' AS exercises
        FROM hevy_raw_data
        WHERE endpoint_name = 'workout'
          AND hevy_id != ${hevyId}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(raw_json->'exercises') AS ex
            WHERE ex->>'exercise_template_id' = ANY(${templateIds}::text[])
          )
        ORDER BY raw_json->>'start_time' ASC`;

  const bestWeight = new Map<string, number>();
  const bestVolume = new Map<string, number>();
  const bestSet = new Map<string, number>();
  const seen = new Set<string>();

  for (const row of rows) {
    const exs: HevyExercise[] =
      typeof row.exercises === "string" ? JSON.parse(row.exercises) : (row.exercises ?? []);
    if (!Array.isArray(exs)) continue;
    for (const ex of exs) {
      const tid = ex.exercise_template_id;
      if (!tid) continue;
      seen.add(tid);
      const normals = normalSets(ex);
      for (const s of normals) {
        const w = s.weight_kg ?? 0;
        if (w > (bestWeight.get(tid) ?? 0)) bestWeight.set(tid, w);
        const sv = setVolume(s);
        if (sv > (bestSet.get(tid) ?? 0)) bestSet.set(tid, sv);
      }
      const vol = normals.reduce((a, s) => a + setVolume(s), 0);
      if (vol > (bestVolume.get(tid) ?? 0)) bestVolume.set(tid, vol);
    }
  }

  const result: Record<string, PrInfo> = {};
  for (const ex of exercises) {
    const tid = ex.exercise_template_id;
    if (!tid) continue;
    const normals = normalSets(ex);
    const isNew = !seen.has(tid);
    const info: PrInfo = { isNew, weightPr: null, volumePr: null, setPr: null };

    if (!isNew) {
      const curWeight = normals.reduce((m, s) => Math.max(m, s.weight_kg ?? 0), 0);
      const curVolume = normals.reduce((a, s) => a + setVolume(s), 0);
      const curSet = normals.reduce((m, s) => Math.max(m, setVolume(s)), 0);

      const prevW = bestWeight.get(tid) ?? 0;
      if (curWeight > prevW && curWeight > 0) info.weightPr = { next: curWeight, prev: prevW };
      const prevV = bestVolume.get(tid) ?? 0;
      if (curVolume > prevV && curVolume > 0) info.volumePr = { next: curVolume, prev: prevV };
      const prevS = bestSet.get(tid) ?? 0;
      if (curSet > prevS && curSet > 0) info.setPr = { next: curSet, prev: prevS };
    }
    result[tid] = info;
  }
  return result;
}

/** What the enrichment row contributes to the header. */
export interface GymEnrichment {
  avgHr?: number | null;
  maxHr?: number | null;
  calories?: number | null;
  durationS?: number | null;
}

const SEP = "  ·  ";

/** Average of the per-set figures `synthesizeExerciseSets` wrote, or null. */
function exerciseHr(ex: HevyExercise): number | null {
  const vals = (ex.sets ?? [])
    .map((s) => s.avg_hr)
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, v) => a + v, 0) / vals.length);
}

/**
 * The description text for one gym workout. Pure: every number arrives as an argument.
 *
 * Per-exercise heart rate is read off `set.avg_hr`, which `synthesizeExerciseSets` writes. Call
 * that first, and only when the enrichment's `hr_source` is `daily`: the `avg_N` and `static`
 * fallbacks are a single value repeated, so a per-exercise figure from them is the same number
 * printed once per exercise, which reads as data and is not.
 */
export function generateGymDescription(
  workout: HevyWorkout,
  enrichment: GymEnrichment,
  prs: Record<string, PrInfo> = {},
): string {
  const title = workout.title || "Workout";
  const exercises = workout.exercises ?? [];
  const workoutDesc = workout.description || "";

  let durationS = enrichment.durationS ?? 0;
  if (!durationS && workout.start_time && workout.end_time) {
    const t0 = Date.parse(workout.start_time.replace(" ", "T"));
    const t1 = Date.parse(workout.end_time.replace(" ", "T"));
    if (!Number.isNaN(t0) && !Number.isNaN(t1)) durationS = (t1 - t0) / 1000;
  }

  // Working sets only: a warmup is not volume, and a set with no weight or no reps is not a set.
  let totalSets = 0;
  let totalVolume = 0;
  for (const ex of exercises) {
    for (const s of ex.sets ?? []) {
      if (s.type === "normal" && (s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0) {
        totalSets += 1;
        totalVolume += setVolume(s);
      }
    }
  }
  const volumeStr =
    totalVolume > 0
      ? totalVolume >= 1000
        ? `${(totalVolume / 1000).toFixed(1)}t`
        : `${Math.round(totalVolume)}kg`
      : null;

  const lines: string[] = [`🏋️ ${title}  —  ${formatDuration(durationS)}`];
  if (workoutDesc) lines.push(`"${workoutDesc}"`);

  const p1: string[] = [];
  if (totalSets > 0) p1.push(`💪 ${totalSets} sets`);
  if (volumeStr) p1.push(`📊 ${volumeStr} volume`);
  if (enrichment.avgHr) p1.push(`❤️ ${enrichment.avgHr} bpm avg`);
  if (p1.length) lines.push(p1.join(SEP));

  const p2: string[] = [];
  if (enrichment.calories) p2.push(`🔥 ${enrichment.calories} kcal`);
  if (enrichment.maxHr) p2.push(`Max HR: ${enrichment.maxHr} bpm`);
  if (exercises.length) p2.push(`${exercises.length} exercises`);
  if (p2.length) lines.push(p2.join(SEP));

  lines.push("");

  for (const ex of exercises) {
    const exTitle = ex.title || "Unknown";
    const hr = exerciseHr(ex);
    lines.push(hr ? `${exTitle}  ❤️ ${hr} bpm` : exTitle);

    const sets = ex.sets ?? [];
    for (let j = 0; j < sets.length; j++) {
      const s = sets[j];
      const n = j + 1;
      const weight = s.weight_kg ?? 0;
      const reps = s.reps ?? 0;
      const suffix = s.type === "warmup" ? "  (warmup)" : s.rpe ? `  @RPE ${s.rpe}` : "";

      if (weight > 0) lines.push(`  ${n}. ${formatWeight(weight)} × ${reps}${suffix}`);
      else if (reps > 0) lines.push(`  ${n}. BW × ${reps}${suffix}`);
      else if (s.duration_seconds) lines.push(`  ${n}. ${Math.trunc(s.duration_seconds)}s${suffix}`);
      else lines.push(`  ${n}. —${suffix}`);
    }

    if (ex.notes) lines.push(`  📝 ${ex.notes}`);

    const pr = (ex.exercise_template_id && prs[ex.exercise_template_id]) || null;
    if (pr?.isNew) {
      lines.push("  🆕 First time!");
    } else if (pr) {
      if (pr.weightPr)
        lines.push(`  🏆 Weight PR: ${formatWeight(pr.weightPr.next)} (prev: ${formatWeight(pr.weightPr.prev)})`);
      if (pr.volumePr)
        lines.push(`  📈 Volume PR: ${formatWeight(pr.volumePr.next)} (prev: ${formatWeight(pr.volumePr.prev)})`);
      if (pr.setPr)
        lines.push(`  ⚡ Set PR: ${formatWeight(pr.setPr.next)} (prev: ${formatWeight(pr.setPr.prev)})`);
    }

    lines.push("");
  }

  lines.push("Tracked by github.com/drkostas/soma");
  return lines.join("\n");
}
