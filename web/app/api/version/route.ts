import { NextResponse } from "next/server";

/**
 * GET /api/version — which commit this deployment is serving.
 *
 * soma runs in two places: the Mac host on the tailnet and soma.gkos.dev on
 * Vercel. Only the first was ever on drlab's record, through the
 * `deployed_commit` fact the deploy script reports. So when every production
 * build of soma-personal failed for four days (#938), the site went on serving
 * four-day-old code and nothing said a word, because nobody could ask the site
 * what it was running.
 *
 * Asking Vercel would not have caught it either. Vercel knew a deployment
 * existed; what was wrong was the gap between a deployment existing and the
 * alias serving it. The only answer that cannot be wrong in that way is the one
 * the running server gives about itself, which is what this route is for.
 *
 * It reports the source rather than inventing a value. Off Vercel there is no
 * `VERCEL_GIT_COMMIT_SHA`, and a caller comparing this against `origin/main`
 * needs to tell "serving something old" apart from "cannot tell", because those
 * are different problems.
 *
 * NOT public: it goes through the same gate as the rest of `/api/*`, which the
 * personal API token opens. A commit of a public repo is not a secret, and
 * confirming which one a deployment runs is still free targeting information
 * that the prober does not need to be given anonymously.
 */

// Never prerendered. A version baked at build time would report the commit of
// whichever build prerendered it, which is exactly the quietly-wrong answer
// this route exists to prevent.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOMA_COMMIT_SHA ?? null;
  return NextResponse.json({
    commit,
    short: commit ? commit.slice(0, 7) : null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "self-hosted",
    source: process.env.VERCEL_GIT_COMMIT_SHA
      ? "vercel"
      : process.env.SOMA_COMMIT_SHA
        ? "env"
        : "unknown",
  });
}
