import { NextResponse } from "next/server";
import { GarminAuth, DBTokenStore } from "garmin-auth";
import { getDb } from "@/lib/db";
import { pushPlanToGarmin } from "@/lib/garmin-workout-builder";
import { getLivePlan } from "@/lib/live-plan";

// garmin-auth needs Node APIs (fetch/pg).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Plan-push cron (#187). Pushes the active training plan's pending workout days
 * to Garmin Connect (upload + schedule), marking each garmin_push_status.
 * Idempotent: only pushes days with status 'none'/'pending', so re-runs are
 * safe. This is the single pusher — the Python pipeline's push is disabled to
 * avoid a double-push race. CRON_SECRET-gated.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  const sql = getDb();
  try {
    // Only a LIVE plan reaches the watch (soma#926): a paused, finished or
    // dropped one pushes nothing, and a plan far ahead starts pushing once it
    // has a session within a week.
    const live = await getLivePlan(sql);
    if (!live.plan) return NextResponse.json({ ok: true, activePlan: null, pushed: 0, failed: 0, engagement: live.engagement });
    const planId = live.plan.id;

    const auth = new GarminAuth({ store: new DBTokenStore(databaseUrl) });
    const client = await auth.client();
    const { pushed, failed } = await pushPlanToGarmin(sql, client, planId);
    return NextResponse.json({ ok: true, activePlan: planId, pushed, failed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
