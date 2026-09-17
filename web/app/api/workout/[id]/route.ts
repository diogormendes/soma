import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { HevyExercise } from "@/lib/hevy-types";
import { synthesizeExerciseSets, timelineFromSamples, type HrPoint } from "@/lib/set-timing";

// --- Route Handler ---

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sql = getDb();

  const rows = await sql`
    SELECT raw_json
    FROM hevy_raw_data
    WHERE endpoint_name = 'workout'
      AND raw_json->>'id' = ${id}
    LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = rows[0].raw_json;
  // Normalise exercises: handle null, missing, or nested structures
  const workout = {
    ...raw,
    exercises: Array.isArray(raw.exercises)
      ? (raw.exercises as HevyExercise[]).map((ex) => ({
          ...ex,
          sets: Array.isArray(ex.sets) ? ex.sets : [],
        }))
      : [],
  };

  // Look up enrichment data (primary) or fall back to fuzzy timestamp match
  const enrichmentRows = await sql`
    SELECT hevy_id, garmin_activity_id, avg_hr, max_hr, calories, hr_samples, duration_s, min_hr
    FROM workout_enrichment
    WHERE hevy_id = ${id}
    LIMIT 1
  `;

  let garminActivityId: number | null = null;
  let enrichedHr: { avg_hr: number | null; max_hr: number | null; calories: number | null } | null = null;
  let enrichmentHrSamples: number[] | null = null;
  let enrichmentDuration: number | null = null;
  let enrichmentMinHr: number | null = null;

  if (enrichmentRows.length > 0) {
    const e = enrichmentRows[0];
    garminActivityId = e.garmin_activity_id;
    enrichedHr = { avg_hr: e.avg_hr, max_hr: e.max_hr, calories: e.calories };
    enrichmentMinHr = e.min_hr;
    enrichmentDuration = e.duration_s;
    if (e.hr_samples) {
      enrichmentHrSamples = Array.isArray(e.hr_samples) ? e.hr_samples : [];
    }
  } else {
    // Fallback: fuzzy timestamp match
    const garminRows = await sql`
      SELECT
        ga.activity_id,
        (ga.raw_json->>'averageHR')::float as avg_hr,
        (ga.raw_json->>'maxHR')::float as max_hr,
        (ga.raw_json->>'calories')::float as calories
      FROM garmin_activity_raw ga
      WHERE ga.endpoint_name = 'summary'
        AND ga.raw_json->'activityType'->>'typeKey' = 'strength_training'
        AND ABS(EXTRACT(EPOCH FROM (${workout.start_time}::timestamp - (ga.raw_json->>'startTimeGMT')::timestamp))) <= 21600
      ORDER BY ABS(EXTRACT(EPOCH FROM (${workout.start_time}::timestamp - (ga.raw_json->>'startTimeGMT')::timestamp)))
      LIMIT 1
    `;
    if (garminRows.length > 0) {
      const m = garminRows[0];
      garminActivityId = m.activity_id;
      enrichedHr = { avg_hr: m.avg_hr, max_hr: m.max_hr, calories: m.calories };
    }
  }

  let garmin: Record<string, unknown> | null = null;
  if (garminActivityId && enrichedHr) {
    // Fetch HR zones for the matched activity
    const zoneRows = await sql`
      SELECT raw_json
      FROM garmin_activity_raw
      WHERE endpoint_name = 'hr_zones'
        AND activity_id = ${garminActivityId}
      LIMIT 1
    `;

    let hrZones = null;
    if (zoneRows.length > 0) {
      const zoneData = zoneRows[0].raw_json;
      const zones = Array.isArray(zoneData) ? zoneData
        : zoneData?.hrTimeInZones ? zoneData.hrTimeInZones
        : [];
      // Sort by zone number and calculate high boundaries from next zone's low
      const sorted = [...zones].sort((a, b) => Number(a.zoneNumber) - Number(b.zoneNumber));
      hrZones = sorted.map((z, i: number) => ({
        zone: z.zoneNumber,
        seconds: z.secsInZone || 0,
        low: z.zoneLowBoundary || 0,
        high: i < sorted.length - 1 ? (sorted[i + 1].zoneLowBoundary - 1) : 220,
      }));
    }

    garmin = {
      avg_hr: enrichedHr.avg_hr,
      max_hr: enrichedHr.max_hr,
      min_hr: enrichmentMinHr,
      calories: enrichedHr.calories,
      hr_zones: hrZones,
    };

    // Build HR timeline from enrichment hr_samples (our DB, not Garmin API)
    const tl = timelineFromSamples(enrichmentHrSamples, enrichmentDuration);
    if (tl.length) garmin.hr_timeline = tl;

    // Synthesize exercise overlay from Hevy data + compute per-set HR via interpolation
    const timeline = (garmin.hr_timeline ?? []) as HrPoint[];
    if (timeline.length > 0 && workout.exercises.length > 0) {
      garmin.exercise_sets = synthesizeExerciseSets(timeline, workout);
    }
  } else if (enrichedHr) {
    // Enrichment data exists but no Garmin activity link — show HR/calories + timeline
    garmin = {
      avg_hr: enrichedHr.avg_hr,
      max_hr: enrichedHr.max_hr,
      min_hr: enrichmentMinHr,
      calories: enrichedHr.calories,
      hr_zones: null,
    };
    const tl2 = timelineFromSamples(enrichmentHrSamples, enrichmentDuration);
    if (tl2.length) {
      garmin.hr_timeline = tl2;
      // Synthesize exercise overlay + per-set HR via interpolation
      if (workout.exercises.length > 0) {
        garmin.exercise_sets = synthesizeExerciseSets(tl2, workout);
      }
    }
  }

  return NextResponse.json({ ...workout, garmin });
}
