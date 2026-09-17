/**
 * Per-set timing and heart rate for a Hevy workout.
 *
 * Hevy records what was lifted, not when: a set carries reps and weight and no clock. Garmin's
 * daily monitoring carries a heart rate every couple of minutes and no idea which set it belongs
 * to. This lays the sets out across the workout's real duration with rest gaps between them and
 * reads the heart rate at each set's midpoint, which is the only way to say anything per-exercise
 * from those two inputs.
 *
 * Lifted out of `app/api/workout/[id]/route.ts` unchanged (soma#981). The workout detail view and
 * the Garmin description both want the same per-set figure, and the Python they descend from had
 * two different answers: the route interpolated at set midpoints while `strava_description.py`
 * sliced the sample series proportionally by set count. The slice printed the same bpm for two
 * different exercises in the last description that shipped, so the interpolation is the one kept.
 */
import type { HevyWorkout } from "./hevy-types";

/** One point of the heart-rate series, in seconds from the workout start. */
export type HrPoint = { elapsed_sec: number; hr: number };

/** Interpolate HR at a given elapsed-second from the timeline. */
export function interpolateHr(timeline: HrPoint[], targetSec: number): number | null {
  if (timeline.length === 0) return null;
  if (targetSec <= timeline[0].elapsed_sec) return timeline[0].hr;
  if (targetSec >= timeline[timeline.length - 1].elapsed_sec)
    return timeline[timeline.length - 1].hr;
  // Find bracketing samples
  let before = timeline[0];
  let after = timeline[timeline.length - 1];
  for (const p of timeline) {
    if (p.elapsed_sec <= targetSec) before = p;
    if (p.elapsed_sec >= targetSec && p.elapsed_sec < after.elapsed_sec) after = p;
  }
  if (before.elapsed_sec === after.elapsed_sec) return before.hr;
  const t = (targetSec - before.elapsed_sec) / (after.elapsed_sec - before.elapsed_sec);
  return before.hr + (after.hr - before.hr) * t;
}

const EST_SET_SEC = 40;
const EST_REST_SEC = 25;
const EST_EX_REST_SEC = 60;

/** One synthesised set of the exercise-timing overlay. */
export interface SynthSet {
  exercise: string;
  start_sec: number;
  duration_sec: number;
  reps: number;
  weight: number;
  set_type: string;
  avg_hr?: number | null;
}

/**
 * Synthesize exercise timing overlay from Hevy data and compute per-set avg HR via interpolation.
 *
 * ⚠️ WRITES `avg_hr` ONTO THE SETS OF THE WORKOUT IT IS GIVEN. That mutation is how both callers
 * read the per-set figure: the detail route serialises the workout it passed in, and the
 * description walks the same object afterwards. Pass a workout you own.
 */
export function synthesizeExerciseSets(
  timeline: HrPoint[],
  workout: HevyWorkout,
): SynthSet[] {
  const totalDuration = timeline[timeline.length - 1].elapsed_sec;
  const allSets: Array<{ exercise: string; reps: number; weight: number; type: string }> = [];
  for (const ex of workout.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      allSets.push({
        exercise: ex.title || "Unknown",
        reps: s.reps || 0,
        weight: s.weight_kg || 0,
        type: s.type === "warmup" ? "warmup" : "normal",
      });
    }
  }
  if (allSets.length === 0) return [];

  const rawTotal = allSets.length * EST_SET_SEC +
    (allSets.length - 1) * EST_REST_SEC +
    ((workout.exercises?.length ?? 0) - 1) * (EST_EX_REST_SEC - EST_REST_SEC);
  const scale = rawTotal > 0 ? totalDuration / rawTotal : 1;

  const synthSets: SynthSet[] = [];
  let cursor = 0;
  let prevExercise = "";
  for (const s of allSets) {
    if (prevExercise && s.exercise !== prevExercise) {
      cursor += EST_EX_REST_SEC * scale;
    } else if (prevExercise) {
      cursor += EST_REST_SEC * scale;
    }
    const setDur = EST_SET_SEC * scale;
    synthSets.push({
      exercise: s.exercise,
      start_sec: Math.round(cursor),
      duration_sec: Math.round(setDur),
      reps: s.reps,
      weight: s.weight,
      set_type: s.type === "warmup" ? "WARMUP" : "ACTIVE",
    });
    cursor += setDur;
    prevExercise = s.exercise;
  }

  // Compute per-set avg HR via interpolation at set midpoint
  let setIdx = 0;
  for (const ex of workout.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      if (setIdx < synthSets.length) {
        const synth = synthSets[setIdx];
        const midpoint = synth.start_sec + synth.duration_sec / 2;
        const hr = interpolateHr(timeline, midpoint);
        if (hr !== null) {
          s.avg_hr = Math.round(hr);
        }
      }
      setIdx++;
    }
  }

  return synthSets;
}

/**
 * The heart-rate timeline for a workout, from the enrichment row's samples.
 *
 * The samples are evenly spaced across the workout by construction (that is what
 * `hevy-enrich` stores), so the interval is the duration divided by the count.
 */
export function timelineFromSamples(
  samples: number[] | null | undefined,
  durationS: number | null | undefined,
): HrPoint[] {
  if (!samples?.length || !durationS) return [];
  const interval = durationS / samples.length;
  return samples.map((hr, i) => ({ elapsed_sec: Math.round(i * interval), hr }));
}
