import { describe, it, expect } from "vitest";
import { djStateDir, djPaths } from "./dj-paths";

describe("dj-paths (#668)", () => {
  it("SOMA_STATE_DIR wins everywhere", () => {
    expect(djStateDir({ SOMA_STATE_DIR: "/srv/soma-state" }, "linux", "/home/k")).toBe("/srv/soma-state/dj");
    expect(djStateDir({ SOMA_STATE_DIR: "/srv/soma-state" }, "darwin", "/Users/k")).toBe("/srv/soma-state/dj");
  });
  it("macOS uses Application Support, others ~/.soma; never /tmp", () => {
    expect(djStateDir({}, "darwin", "/Users/k")).toBe("/Users/k/Library/Application Support/soma/dj");
    expect(djStateDir({}, "linux", "/home/k")).toBe("/home/k/.soma/dj");
    expect(djStateDir({}, "darwin", "/Users/k")).not.toMatch(/^\/tmp/);
  });
  it("the four files hang off the directory", () => {
    const p = djPaths("/x/dj");
    expect(p).toEqual({ dir: "/x/dj", statusFile: "/x/dj/status.json", pidFile: "/x/dj/pid", logFile: "/x/dj/daemon.log", playedFile: "/x/dj/played.json" });
  });
});

import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDjPaths } from "./dj-paths";

describe("ensureDjPaths on a host where the state dir cannot be created (soma-demo on Vercel)", () => {
  it("falls back to a soma/dj directory under the OS temp dir instead of throwing at import", () => {
    // A FILE where the parent directory should be: mkdir fails with ENOTDIR on every OS, the way
    // it fails with ENOENT/EROFS for /home/sbx_user1051/.soma/dj on Vercel.
    const parent = mkdtempSync(join(tmpdir(), "soma-dj-test-"));
    const blocker = join(parent, "not-a-dir");
    writeFileSync(blocker, "");
    const p = ensureDjPaths(join(blocker, "dj"));
    expect(p.dir.startsWith(tmpdir())).toBe(true);
    expect(p.dir.endsWith(join("soma", "dj"))).toBe(true);
    expect(existsSync(p.dir)).toBe(true);
    expect(p.statusFile).toBe(join(p.dir, "status.json"));
  });
  it("uses the wanted directory when it can be created", () => {
    const parent = mkdtempSync(join(tmpdir(), "soma-dj-test-"));
    const p = ensureDjPaths(join(parent, "dj"));
    expect(p.dir).toBe(join(parent, "dj"));
    expect(existsSync(p.dir)).toBe(true);
  });
});
