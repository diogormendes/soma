import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { neonConfig } from "@neondatabase/serverless";
import { httpDb, DATE_OID } from "./db";

// A stand-in for the estate gateway: it answers like ~/services/db-gateway, with Postgres's own text
// for each value and the column's type id, and leaves the parsing to the driver. It also records the
// SQL it was sent, so composition can be checked.
let server: http.Server;
const seen: string[] = [];
const previousEndpoint = neonConfig.fetchEndpoint;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push(JSON.parse(body).query);
      const arr = req.headers["neon-array-mode"] === "true";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        command: "SELECT", rowCount: 1,
        rows: arr ? [["2026-09-28", "2026-09-28 06:00:00+00"]] : [{ day: "2026-09-28", at: "2026-09-28 06:00:00+00" }],
        fields: [
          { name: "day", dataTypeID: DATE_OID, tableID: 0, columnID: 0, dataTypeSize: 4, dataTypeModifier: -1, format: "text" },
          { name: "at", dataTypeID: 1184, tableID: 0, columnID: 0, dataTypeSize: 8, dataTypeModifier: -1, format: "text" },
        ],
        rowAsArray: arr,
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  neonConfig.fetchEndpoint = () => `http://127.0.0.1:${port}/sql`;
});

afterAll(() => {
  neonConfig.fetchEndpoint = previousEndpoint;
  server.close();
});

describe("the HTTP driver keeps a DATE as its calendar day (soma#1151)", () => {
  const sql = httpDb("postgresql://u:p@pg.example.dev/soma");

  it("⛔ returns the day text, not a midnight Date, from a tagged query", async () => {
    const [row] = await sql`SELECT day, at FROM t`;
    expect(row.day).toBe("2026-09-28");
  });

  it("still parses a timestamptz into a Date, because that IS a moment", async () => {
    const [row] = await sql`SELECT day, at FROM t`;
    expect(row.at).toBeInstanceOf(Date);
  });

  it("applies the same rule to .query", async () => {
    const rows = await (sql as unknown as { query: (t: string, p: unknown[]) => Promise<Array<{ day: unknown }>> })
      .query("SELECT day, at FROM t WHERE x = $1", [1]);
    expect(rows[0].day).toBe("2026-09-28");
  });

  it("still composes a nested fragment into one query, as track search needs", async () => {
    seen.length = 0;
    const genres = ["Rock"];
    await sql`SELECT day, at FROM t WHERE tempo > ${100} ${sql`AND genres && ${genres}`}`;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe("SELECT day, at FROM t WHERE tempo > $1 AND genres && $2");
  });
});
