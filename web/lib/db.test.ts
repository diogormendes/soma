import { describe, it, expect } from "vitest";
import { driverFor } from "./db";

/* soma#939: the driver is chosen from the connection string, never from the code. A Neon host
 * and the estate gateway's `pg.` host both speak the HTTP shape; everything else is a socket. */
describe("driverFor", () => {
  it("Neon hosts get the HTTP driver", () => {
    expect(driverFor("postgresql://u:p@ep-x-y.eu-central-1.aws.neon.tech/soma?sslmode=require")).toBe("http");
  });
  it("the estate gateway host pg.<domain> gets the HTTP driver (it is not a real hostname)", () => {
    expect(driverFor("postgresql://soma_app:p@pg.gkos.dev/soma")).toBe("http");
    expect(driverFor("postgres://soma_ro:p@pg.example.org:5432/soma_demo?sslmode=require")).toBe("http");
  });
  it("a real Postgres host gets the pool", () => {
    expect(driverFor("postgresql://soma:p@127.0.0.1:5432/soma")).toBe("pool");
    expect(driverFor("postgresql://soma:p@localhost/soma")).toBe("pool");
    expect(driverFor("postgresql://u:p@db.internal.example.com/soma")).toBe("pool");
  });
  it("an unparsable connection string is a configuration fault, not a hint", () => {
    expect(() => driverFor("not a url")).toThrow(/DATABASE_URL/);
  });
});

import { afterEach, beforeEach } from "vitest";
import { getDb } from "./db";

/* soma#940: `next build` must never need a database. During the build phase getDb() hands back
 * the empty stub whatever DATABASE_URL says, so a prerendered ISR route gets a placeholder and
 * the first request after deploy fills it. Before this, the stub applied only when the variable
 * was missing, and production builds ran real queries against the gateway host. */
describe("getDb during next build", () => {
  const saved = { phase: process.env.NEXT_PHASE, url: process.env.DATABASE_URL, npm: process.env.npm_lifecycle_event };
  beforeEach(() => { process.env.NEXT_PHASE = "phase-production-build"; process.env.DATABASE_URL = "postgresql://soma_ro:x@pg.gkos.dev/soma"; delete process.env.npm_lifecycle_event; });
  afterEach(() => { process.env.NEXT_PHASE = saved.phase; process.env.DATABASE_URL = saved.url; if (saved.npm) process.env.npm_lifecycle_event = saved.npm; });
  it("answers every query with an empty array instead of opening a connection", async () => {
    const sql = getDb();
    const rows = await sql`SELECT 1 AS one FROM nutrition_day`;
    expect(rows).toEqual([]);
  });
});
