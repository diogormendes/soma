import { GarminAuth, DBTokenStore } from "garmin-auth";
import { HevyClient } from "hevy2garmin";
import { getDb, type QueryFn } from "./db";
import { runGarminIngest } from "./garmin-ingest";
import { getHevyApiKey, syncAllWorkouts } from "./hevy-ingest";
import { enrichNewWorkouts } from "./hevy-enrich-run";
import { computeHevyLoads } from "./training-load";
import { drainCaptures, reviveStalled } from "./meal-worker";
import { backfillLoadFromHistory, computeAndStorePmc } from "./pmc-stream";
import { fitFromDb } from "./banister";
import { pushPlanToGarmin } from "./garmin-workout-builder";
import { getLivePlan } from "./live-plan";
import { enrichGarminRunActivities } from "./garmin-run-enrich";
import { uploadEnrichedToGarmin } from "./hevy-upload";
import { enrichGarminGymActivities } from "./garmin-gym-enrich";
import { pushWeightsToGarmin } from "./weight-push";
import { notifyPendingWorkouts } from "./notify";

let activeSyncPromise: Promise<void> | null = null;

function countNumbers(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (Array.isArray(v)) return v.reduce<number>((a, x) => a + countNumbers(x), 0);
  if (v && typeof v === "object") return Object.values(v).reduce<number>((a, x) => a + countNumbers(x), 0);
  return 0;
}

export function isSyncRunningInMemory(): boolean {
  return activeSyncPromise !== null;
}

/**
 * Starts the full sync pipeline in the background inside the Node.js process.
 * Immediately inserts a 'running' row in `sync_log` so `/api/sync/status` and
 * the UI SyncButton track progress in real time, then updates the row on finish.
 */
export async function triggerLocalSync(trigger = "manual"): Promise<{ started: boolean; runId?: number; reason?: string }> {
  if (activeSyncPromise) {
    return { started: false, reason: "Sync already running" };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not configured");
  }

  if (!process.env.HEVY2GARMIN_TIMEZONE) {
    process.env.HEVY2GARMIN_TIMEZONE = process.env.TZ || "America/Sao_Paulo";
  }

  const sql: QueryFn = getDb();

  // Check database for any non-stale running sync
  const running = await sql`
    SELECT id, started_at
    FROM sync_log
    WHERE status = 'running'
      AND started_at >= NOW() - INTERVAL '30 minutes'
    ORDER BY started_at DESC
    LIMIT 1
  `;

  if (running.length > 0) {
    return { started: false, reason: "Sync already running" };
  }

  const startedAt = new Date();
  let runId: number | undefined;
  try {
    const inserted = (await sql`
      INSERT INTO sync_log (sync_type, status, records_synced, started_at)
      VALUES ('full_pipeline', 'running', 0, ${startedAt.toISOString()})
      RETURNING id
    `) as { id?: number | string }[];
    if (inserted[0]?.id !== undefined) {
      runId = Number(inserted[0].id);
    }
  } catch (e) {
    console.error("[sync] failed to insert initial running row in sync_log:", (e as Error).message);
  }

  activeSyncPromise = (async () => {
    const webBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.SOMA_WEB_URL || "https://soma.gkos.dev";
    const failures: string[] = [];
    let stepsRun = 0;
    let recordsTouched = 0;

    console.log(`[sync] starting local pipeline (trigger=${trigger}, runId=${runId ?? "none"})`);

    async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
      const t0 = Date.now();
      stepsRun++;
      try {
        const r = await fn();
        recordsTouched += countNumbers(r);
        console.log(`[sync] ${name} OK (${Date.now() - t0}ms):`, JSON.stringify(r));
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message}`);
        console.error(`[sync] ${name} FAILED (${Date.now() - t0}ms):`, (e as Error).message);
      }
    }

    let backfillRemaining = 0;
    try {
      // 1. Garmin daily + activities + parse + training-engine streams + kite.
      await step("garmin-ingest", async () => {
        const res = await runGarminIngest(databaseUrl, sql);
        backfillRemaining = res.backfillRemaining ?? 0;
        return res;
      });

      // 2. Hevy pull + enrich + training loads + PMC.
      await step("hevy", async () => {
        const apiKey = await getHevyApiKey(sql);
        if (!apiKey) throw new Error("Hevy API key not configured");
        const client = new HevyClient(apiKey);
        const pull = await syncAllWorkouts(client, sql);
        const enrich = await enrichNewWorkouts(sql);
        const loadsComputed = await computeHevyLoads(sql);
        const garminLoads = await backfillLoadFromHistory(sql);
        const pmc = await computeAndStorePmc(sql);
        return { pull, enrich, loadsComputed, garminLoads, pmcDays: pmc.length };
      });

      // 2b. Refit the Banister parameters.
      await step("banister-fit", () => fitFromDb(sql));

      // 2c. Meal captures.
      await step("meal-captures", async () => {
        const revived = await reviveStalled(sql);
        const drained = await drainCaptures(sql, 10);
        return { revived, drained };
      });

      // 3+4. Garmin client for the external-write steps (plan push + run enrichment).
      let garminClient: Awaited<ReturnType<GarminAuth["client"]>> | null = null;
      try {
        garminClient = await new GarminAuth({ store: new DBTokenStore(databaseUrl) }).client();
      } catch (e) {
        console.error("[sync] Garmin auth for push/enrich failed:", (e as Error).message);
      }

      if (garminClient) {
        await step("plan-push", async () => {
          const live = await getLivePlan(sql);
          if (!live.plan) return { activePlan: null, pushed: 0, engagement: live.engagement.state };
          return { activePlan: live.plan.id, ...(await pushPlanToGarmin(sql, garminClient!, live.plan.id)) };
        });
        await step("garmin-enrich", () => enrichGarminRunActivities(sql, garminClient!, webBaseUrl));
        await step("hevy-upload", () => uploadEnrichedToGarmin(sql, garminClient!, { dryRun: false }));
        await step("gym-enrich", () => enrichGarminGymActivities(sql, garminClient!, webBaseUrl));
        await step("weight-push", () => pushWeightsToGarmin(sql, garminClient!));
      }

      // 5. Telegram + push notifications for workouts now on Garmin.
      await step("notify", () => notifyPendingWorkouts(sql));
    } finally {
      const status = failures.length === 0 ? "success" : failures.length === stepsRun ? "failed" : "partial";
      const error = failures.length ? failures.join("; ").slice(0, 2000) : null;
      try {
        if (runId !== undefined) {
          await sql`
            UPDATE sync_log
            SET status = ${status},
                records_synced = ${recordsTouched},
                error_message = ${error},
                completed_at = NOW()
            WHERE id = ${runId}
          `;
        } else {
          await sql`
            INSERT INTO sync_log (sync_type, status, records_synced, error_message, started_at, completed_at)
            VALUES ('full_pipeline', ${status}, ${recordsTouched}, ${error}, ${startedAt.toISOString()}, NOW())
          `;
        }
        console.log(`[sync] run recorded: ${status}, ${recordsTouched} records, ${failures.length}/${stepsRun} steps failed`);
      } catch (e) {
        console.error("[sync] could not record the run in sync_log:", (e as Error).message);
      }
      activeSyncPromise = null;
      console.log("[sync] pipeline complete");
      if (backfillRemaining > 0 && failures.length < stepsRun) {
        console.log(`[sync] scheduling next historical backfill batch in 5s (${backfillRemaining} days remaining)`);
        setTimeout(() => {
          triggerLocalSync("backfill_continue").catch((err) =>
            console.error("[sync] backfill continuation failed:", err)
          );
        }, 5000);
      }
    }
  })();

  return { started: true, runId };
}
