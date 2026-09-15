import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

/**
 * The point of this route is that it cannot be quietly wrong. Every production
 * build failed for four days while soma.gkos.dev served old code (#938), and
 * nothing noticed because nothing could ask the site what it was running.
 *
 * So the tests that matter are the ones about honesty: the commit comes from
 * the running process, and when there is no commit to give it says so instead
 * of guessing.
 */

const SHA = "974a5571a4f3c0d2e1b8a9c7d6e5f4a3b2c1d0e9";
const saved = { ...process.env };

beforeEach(() => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.SOMA_COMMIT_SHA;
  delete process.env.VERCEL_GIT_COMMIT_REF;
  delete process.env.VERCEL_ENV;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("GET /api/version", () => {
  it("reports the commit Vercel built, and says where it came from", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = SHA;
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    process.env.VERCEL_ENV = "production";
    const body = await (GET() as Response).json();
    expect(body).toEqual({
      commit: SHA,
      short: "974a557",
      ref: "main",
      env: "production",
      source: "vercel",
    });
  });

  it("says unknown rather than inventing a commit when there is none", async () => {
    // The Mac host is not Vercel. A caller comparing this against origin/main
    // has to tell "serving something old" apart from "cannot tell": those are
    // different problems and only one of them is an outage.
    const body = await (GET() as Response).json();
    expect(body.commit).toBeNull();
    expect(body.short).toBeNull();
    expect(body.source).toBe("unknown");
    expect(body.env).toBe("self-hosted");
  });

  it("accepts a commit supplied off Vercel, so a self-hosted deploy can answer too", async () => {
    process.env.SOMA_COMMIT_SHA = SHA;
    const body = await (GET() as Response).json();
    expect(body.short).toBe("974a557");
    expect(body.source).toBe("env");
  });

  it("prefers Vercel's own value when both are present", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = SHA;
    process.env.SOMA_COMMIT_SHA = "0000000000000000000000000000000000000000";
    const body = await (GET() as Response).json();
    expect(body.commit).toBe(SHA);
    expect(body.source).toBe("vercel");
  });

  it("never touches a database, so it cannot fail a build or an outage", async () => {
    // #940 closed because DB-backed routes ran queries during next build. This
    // one imports nothing that could, and the test would fail to import if it did.
    const body = await (GET() as Response).json();
    expect(Object.keys(body).sort()).toEqual(["commit", "env", "ref", "short", "source"]);
  });
});
