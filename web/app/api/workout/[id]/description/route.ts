import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { describeGymWorkout } from "@/lib/garmin-gym-enrich";
import type { HevyWorkout } from "@/lib/hevy-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The generated description for one gym workout, as plain text.
 *
 * Exists for the Strava re-finalize (soma#983). That runs in the bridge, a separate package, and
 * it needs the same text the pipeline writes to Garmin. It cannot read it off the stored Garmin
 * summary, because `getStaleDates` re-ingests at most the last fourteen days, so a description
 * written to Garmin today never reaches the row for a workout from July. And it should not carry
 * a second copy of the generator: the bridge already fetches the share card from this app, so it
 * fetches the words the same way.
 *
 * Read-only. No Garmin calls, no writes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const sql = getDb();

  const rows = await sql`
    SELECT we.hevy_id, we.hr_samples, we.hr_source, we.avg_hr, we.max_hr, we.calories, we.duration_s,
           h.raw_json AS workout
    FROM workout_enrichment we
    JOIN hevy_raw_data h ON h.hevy_id = we.hevy_id AND h.endpoint_name = 'workout'
    WHERE we.hevy_id = ${id}
    LIMIT 1`;
  if (!rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = rows[0];
  const workout: HevyWorkout = typeof r.workout === "string" ? JSON.parse(r.workout) : r.workout;
  const description = await describeGymWorkout(sql, {
    hevy_id: r.hevy_id,
    workout,
    hrSamples: typeof r.hr_samples === "string" ? JSON.parse(r.hr_samples) : (r.hr_samples ?? []),
    hrSource: r.hr_source ?? "unknown",
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    calories: r.calories,
    durationS: r.duration_s,
  });

  return NextResponse.json({ hevyId: r.hevy_id, description });
}
