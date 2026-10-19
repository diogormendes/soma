export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.DEMO_MODE?.trim() !== "true" &&
    process.env.SYNC_MODE !== "github"
  ) {
    const intervalMinutes = Number(process.env.LOCAL_SYNC_INTERVAL_MINUTES ?? "60");
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      return;
    }

    const { triggerLocalSync } = await import("./lib/sync-pipeline");
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[sync-scheduler] Local background sync scheduled every ${intervalMinutes} minutes`);

    const timer = setInterval(() => {
      triggerLocalSync("schedule").catch((err) => {
        console.error("[sync-scheduler] Scheduled sync failed to start:", err);
      });
    }, intervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }

    const startupTimer = setTimeout(() => {
      triggerLocalSync("startup").catch((err) => {
        console.error("[sync-scheduler] Startup sync failed to start:", err);
      });
    }, 10_000);

    if (typeof startupTimer.unref === "function") {
      startupTimer.unref();
    }
  }
}
