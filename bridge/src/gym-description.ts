/**
 * The gym description for a bridged Strava activity, fetched from soma.
 *
 * The text is generated in the web app (`web/lib/gym-description.ts`), not here. The bridge runs
 * on a GitHub runner in its own package with its own dependencies, and a second copy of a
 * generator that reads personal records out of the database would drift from the first one the
 * day either changed. It already fetches the share card from soma over HTTP (`share-image.ts`),
 * so it fetches the words the same way (soma#983).
 *
 * ⛔ IT CANNOT READ THE DESCRIPTION OFF THE STORED GARMIN SUMMARY, which is what `refinalize`
 * does for every other activity type. `getStaleDates` re-ingests at most the last fourteen days,
 * so a description written to Garmin today never lands in `garmin_activity_raw` for a workout
 * from July, and those are exactly the ones that need re-finalizing.
 *
 * Never throws. A re-finalize that cannot reach soma should push the activity's existing text
 * rather than fail, so the caller falls back to the stored summary.
 */
import type { Db } from "./db";

const SOMA = process.env.SOMA_WEB_URL || process.env.SOMA_BASE_URL || "https://soma.gkos.dev";

/** The Hevy workout behind a Garmin activity, or null when it is not a synced gym workout. */
export async function hevyIdForActivity(db: Db, gid: number): Promise<string | null> {
  const r = await db.query(
    "SELECT hevy_id FROM workout_enrichment WHERE garmin_activity_id=$1 ORDER BY processed_at DESC LIMIT 1",
    [gid],
  );
  return (r.rows[0]?.hevy_id as string | undefined) ?? null;
}

/**
 * The generated gym description, or null with the reason.
 *
 * Two attempts: the render route can cold-start on Vercel, and an older production deploy will
 * not have this route at all, which comes back as a 404 and is a reason to fall back rather than
 * to retry.
 */
export async function gymDescriptionFor(
  db: Db,
  gid: number,
): Promise<{ description: string | null; note: string }> {
  const hevyId = await hevyIdForActivity(db, gid);
  if (!hevyId) return { description: null, note: "not a synced Hevy workout" };

  const url = `${SOMA}/api/workout/${hevyId}/description`;
  let note = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (resp.status === 404) return { description: null, note: "soma has no description route or no such workout" };
      if (!resp.ok) {
        note = `description http ${resp.status}`;
      } else {
        const body = (await resp.json()) as { description?: unknown };
        const desc = typeof body.description === "string" ? body.description : "";
        if (desc.trim()) return { description: desc, note: "" };
        note = "description empty";
      }
    } catch (e) {
      note = `description fetch failed: ${(e as Error).message.slice(0, 60)}`;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 4000));
  }
  return { description: null, note };
}
