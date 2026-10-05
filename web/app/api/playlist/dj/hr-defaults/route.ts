import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { todayForRequest } from "@/lib/request-tz";

export const runtime = "nodejs";

export async function GET() {
  // His calendar date on the device making this request, never the database's New York clock.
  const today = await todayForRequest();
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT
        ROUND(AVG(resting_heart_rate))::int AS hr_rest,
        MAX(max_heart_rate)::int            AS hr_max
      FROM daily_health_summary
      WHERE date >= ${today}::date - INTERVAL '90 days'
        AND resting_heart_rate IS NOT NULL
    `;
    const row = rows[0] as { hr_rest: number | null; hr_max: number | null } | undefined;
    if (!row) return NextResponse.json({});
    return NextResponse.json({
      hr_rest: row.hr_rest ?? null,
      hr_max: row.hr_max ?? null,
    });
  } catch {
    return NextResponse.json({});
  }
}
