/**
 * Who the athlete is, for the calorie estimate and the FIT.
 *
 * `calcCalories` is Keytel with a VO2max term, so it reads a weight, an age and a VO2max. Until
 * soma#986 every caller handed it `DEFAULT_PROFILE`, which is an 80 kg person born in 1990 with a
 * VO2max of 45, and the figure it produced went into `workout_enrichment.calories`. That column
 * is not decoration: `/api/nutrition/plan` averages it into the planned gym burn, close-day writes
 * it as the day's actual gym burn, and the gym description prints it.
 *
 * ⛔ THE THREE FIELDS MUST MOVE TOGETHER, AND THIS IS THE WHOLE REASON THE PROFILE IS ALL OR
 * NOTHING. Measured against his real values, each one alone pulls in a different direction:
 * weight 80 to 73.2 is -38 kcal/h, age 36 to 32 is -16 kcal/h, and VO2max 45 to 51.9 is
 * +40 kcal/h. Together they are -14 kcal/h, a 4.6% over-statement. Correct one field and leave
 * the others at the default and the error grows rather than shrinks, so a per-field fallback would
 * be worse than no fix at all. Hence: either every value is real, or every value is the default.
 *
 * The source is Garmin's own record of him, one call to `/userprofile-service/userprofile/
 * user-settings`, stored by the ingest at `endpoint_name = 'user_settings'`. It carries an exact
 * `birthDate` rather than a rounded age, it is the same profile Garmin uses for its own calorie
 * arithmetic, and it maintains itself when he changes a value in Garmin Connect. Reading it from
 * the database rather than calling Garmin here matters: `enrichNewWorkouts` runs before the sync
 * pipeline has built a Garmin client.
 */
import { DEFAULT_PROFILE } from "hevy2garmin";
import type { QueryFn } from "./db";
import { num, rec, str } from "./json";

/** The three fields `calcCalories` reads, plus where they came from. */
export interface AthleteProfile {
  weightKg: number;
  birthYear: number;
  vo2max: number;
  /** `garmin` when every value is Garmin's, `default` when any was missing. */
  source: "garmin" | "default";
}

/** What `DEFAULT_PROFILE` describes, named so a log line can say which was used. */
export const FALLBACK_PROFILE: AthleteProfile = {
  weightKg: DEFAULT_PROFILE.weightKg,
  birthYear: DEFAULT_PROFILE.birthYear,
  vo2max: DEFAULT_PROFILE.vo2max,
  source: "default",
};

/** The year out of an ISO date, or null. Garmin writes `birthDate` as `YYYY-MM-DD`. */
export function birthYearFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const y = Number(birthDate.slice(0, 4));
  // A plausible year, so a malformed or zeroed date cannot produce an age of two thousand.
  return Number.isInteger(y) && y > 1900 && y < 2100 ? y : null;
}

/**
 * Read the profile out of a stored `user_settings` payload.
 *
 * Pure, so the all-or-nothing rule is testable without a database. Garmin stores the weight in
 * GRAMS, which is the one unit surprise in this payload.
 */
export function profileFromUserSettings(raw: unknown): AthleteProfile {
  const settings = rec(raw);
  const ud = rec(settings?.userData) ?? settings;

  const grams = num(ud?.weight);
  const weightKg = grams != null && grams > 0 ? grams / 1000 : null;
  const birthYear = birthYearFrom(str(ud?.birthDate));
  const vo2max = num(ud?.vo2MaxRunning);

  if (weightKg == null || birthYear == null || vo2max == null || vo2max <= 0) {
    return FALLBACK_PROFILE;
  }
  return { weightKg, birthYear, vo2max, source: "garmin" };
}

/**
 * The athlete's profile, newest stored `user_settings` first, or the default.
 *
 * Never throws. A missing table or an empty result is the default profile, which is the behaviour
 * every caller had before this module existed.
 */
export async function getAthleteProfile(sql: QueryFn): Promise<AthleteProfile> {
  try {
    const rows = await sql`
      SELECT raw_json FROM garmin_raw_data
      WHERE endpoint_name = 'user_settings'
      ORDER BY date DESC LIMIT 1`;
    if (!rows.length) return FALLBACK_PROFILE;
    const raw = typeof rows[0].raw_json === "string" ? JSON.parse(rows[0].raw_json) : rows[0].raw_json;
    return profileFromUserSettings(raw);
  } catch {
    return FALLBACK_PROFILE;
  }
}
