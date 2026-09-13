/**
 * The parts of a Hevy workout the web reads. Hevy's payload has more fields; these are the ones
 * the image routes, the workout detail route and the outlier fixer touch, so they are the ones
 * worth naming instead of reaching through `any` (soma#958).
 */
export interface HevySet {
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  rpe?: number | null;
  /** Written back by the workout detail route when it interpolates HR per set. */
  avg_hr?: number | null;
}

export interface HevyExercise {
  title?: string;
  exercise_template_id?: string;
  superset_id?: string | number | null;
  notes?: string | null;
  sets?: HevySet[];
}

export interface HevyWorkout {
  id?: string;
  title?: string;
  description?: string | null;
  start_time?: string;
  end_time?: string;
  updated_at?: string;
  exercises?: HevyExercise[];
}
