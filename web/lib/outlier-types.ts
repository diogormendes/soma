/**
 * The shapes the outlier detector produces and the outlier chart renders.
 *
 * These lived inside `app/api/outliers/route.ts`, so the chart on the other side of the wire
 * declared its half as `any` and the two could drift without anything noticing (soma#958).
 */

/** One logged set, as the detector reads it. */
export interface SetEntry {
  date: string;
  weight: number;
  reps: number;
  workoutId: string;
  workoutTitle: string;
  exerciseIndex: number;
  setIndex: number;
}

/** A set the detector flagged, with the reason and what it would have expected. */
export interface Outlier extends SetEntry {
  localMedianWt: number | null;
  flag: "weight_high" | "weight_low" | "reps_high";
  reason: string;
  suggestedValue: number;
  globalMedianReps: number;
}

/** Every set of one exercise, marked with whether it was flagged. */
export interface ChartPoint extends SetEntry {
  localMedianWt: number | null;
  isOutlier: boolean;
}

/** One exercise's detection result. */
export interface ExerciseResult {
  name: string;
  templateId: string | null;
  outlierCount: number;
  totalSets: number;
  globalMedianReps: number;
  outliers: Outlier[];
  chartData: ChartPoint[];
}
