/**
 * Recompute workout_enrichment.calories with the athlete's real profile (soma#986).
 *
 *   cd web && set -a && . ./.env.local && set +a && \
 *   npx tsx scripts/gym-calories-recompute.mts          # dry run, prints the deltas
 *   npx tsx scripts/gym-calories-recompute.mts --write   # applies them
 *
 * Every stored row was computed against DEFAULT_PROFILE, an 80 kg person born in 1990 with a
 * VO2max of 45. The figure feeds the planned gym burn in /api/nutrition/plan, which averages the
 * last five sessions of each routine, so leaving history alone would keep the plan high for
 * several more sessions of every routine.
 *
 * ⛔ DOES NOT TOUCH nutrition_day. A closed day records what was believed when it was closed, and
 * rewriting it would change a figure already signed off for a difference of about 12 kcal.
 *
 * Pure recomputation from the heart-rate samples already stored on each row, so it needs no
 * Garmin call and can be re-run safely.
 */
import { calcCalories, DEFAULT_PROFILE } from "hevy2garmin";
import { getDb } from "../lib/db";
import { getAthleteProfile } from "../lib/athlete-profile";

const write = process.argv.includes("--write");
const sql = getDb();

const athlete = await getAthleteProfile(sql);
if (athlete.source !== "garmin") {
  console.error(
    "refusing to recompute with the default profile: no user_settings row is stored yet. " +
      "Run the Garmin ingest first (it fetches and stores it), then re-run this.",
  );
  process.exit(2);
}
console.log(
  `profile: ${athlete.weightKg.toFixed(1)} kg, born ${athlete.birthYear}, VO2max ${athlete.vo2max} (${athlete.source})`,
);

const rows = await sql`
  SELECT we.hevy_id, we.hevy_title, we.workout_date, we.calories, we.duration_s, we.hr_samples
  FROM workout_enrichment we
  WHERE we.hr_samples IS NOT NULL AND we.duration_s IS NOT NULL AND we.workout_date IS NOT NULL
  ORDER BY we.workout_date DESC`;

let changed = 0;
let sumOld = 0;
let sumNew = 0;
for (const r of rows) {
  const hr: number[] = typeof r.hr_samples === "string" ? JSON.parse(r.hr_samples) : (r.hr_samples ?? []);
  if (!hr.length) continue;
  // The year of the workout, so an old row is costed at the age he was then, exactly as the
  // enrichment does when it first writes the row.
  const year = new Date(String(r.workout_date)).getUTCFullYear();
  const next = calcCalories(hr, Number(r.duration_s), year, {
    ...DEFAULT_PROFILE,
    weightKg: athlete.weightKg,
    birthYear: athlete.birthYear,
    vo2max: athlete.vo2max,
  });
  const prev = Number(r.calories) || 0;
  if (next === prev) continue;

  sumOld += prev;
  sumNew += next;
  changed += 1;
  if (changed <= 12) {
    const d = next - prev;
    console.log(
      `  ${String(r.workout_date).slice(0, 10)} ${String(r.hevy_title ?? "?").padEnd(8)} ${prev} -> ${next} (${d > 0 ? "+" : ""}${d})`,
    );
  }
  if (write) {
    await sql`UPDATE workout_enrichment SET calories = ${next}, updated_at = NOW() WHERE hevy_id = ${r.hevy_id}`;
  }
}

if (changed > 12) console.log(`  ... and ${changed - 12} more`);
const pct = sumOld > 0 ? ((sumNew - sumOld) / sumOld) * 100 : 0;
console.log(
  `${write ? "WROTE" : "DRY RUN"}: ${changed} of ${rows.length} rows change, ` +
    `${sumOld} -> ${sumNew} kcal in total (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`,
);
process.exit(0);
