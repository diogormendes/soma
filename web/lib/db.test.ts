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
