import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { neonConfig } from "@neondatabase/serverless";
import { httpDb, isReadOnlyBody } from "./db";

// A stand-in for the estate gateway that answers 502 for the first `failNext` requests, the way the
// edge answers while the gateway restarts (soma#1195), and then answers normally.
let server: http.Server;
let hits = 0;
let failNext = 0;
// Requests whose response is cut partway: headers and half a body, then the connection drops,
// which the client sees as `TypeError: terminated` (ECONNRESET) while reading the body (soma#1199).
let cutNext = 0;
const previousEndpoint = neonConfig.fetchEndpoint;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      hits += 1;
      if (cutNext > 0) {
        cutNext -= 1;
        res.writeHead(200, { "content-type": "application/json", "content-length": "500" });
        res.write('{"command":"SELECT","rows":[');
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      }
      if (failNext > 0) {
        failNext -= 1;
        res.writeHead(502, { "content-type": "text/html" });
        res.end("<html><title>502: Bad gateway</title></html>");
        return;
      }
      const arr = req.headers["neon-array-mode"] === "true";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        command: "SELECT", rowCount: 1, rows: arr ? [["1"]] : [{ n: "1" }],
        fields: [{ name: "n", dataTypeID: 25, tableID: 0, columnID: 0, dataTypeSize: -1, dataTypeModifier: -1, format: "text" }],
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

beforeEach(() => {
  hits = 0;
  failNext = 0;
  cutNext = 0;
});

const sql = () => httpDb("postgresql://soma_app:x@pg.example.org/soma");

describe("httpDb retries a read once when the gateway answers 502 (soma#1195)", () => {
  it("a SELECT that meets one 502 is sent again and succeeds", async () => {
    failNext = 1;
    const rows = await sql()`SELECT 1 AS n`;
    expect(rows).toEqual([{ n: "1" }]);
    expect(hits).toBe(2);
  });

  it("a SELECT is retried only once", async () => {
    failNext = 2;
    await expect(sql()`SELECT 1 AS n`).rejects.toThrow(/502/);
    expect(hits).toBe(2);
  });

  it("a write is never sent twice, because the first attempt may have run", async () => {
    failNext = 1;
    await expect(sql()`INSERT INTO t (a) VALUES (${1})`).rejects.toThrow(/502/);
    expect(hits).toBe(1);
  });

  it("a SELECT whose response is cut partway is sent again and succeeds (soma#1199)", async () => {
    cutNext = 1;
    const rows = await sql()`SELECT 1 AS n`;
    expect(rows).toEqual([{ n: "1" }]);
    expect(hits).toBe(2);
  });

  it("a write whose response is cut partway is not sent again", async () => {
    cutNext = 1;
    await expect(sql()`INSERT INTO t (a) VALUES (${1})`).rejects.toThrow();
    expect(hits).toBe(1);
  });

  it("a SELECT that succeeds first time is sent once", async () => {
    await sql()`SELECT 1 AS n`;
    expect(hits).toBe(1);
  });
});

describe("isReadOnlyBody", () => {
  it.each([
    [{ query: "SELECT 1" }, true],
    [{ query: "  select * from t" }, true],
    [{ query: "WITH x AS (SELECT 1) SELECT * FROM x" }, false],
    [{ query: "INSERT INTO t VALUES (1)" }, false],
    [{ query: "SELECT 1; DELETE FROM t" }, false],
    [{ queries: [{ query: "SELECT 1" }, { query: "SELECT 2" }] }, true],
    [{ queries: [{ query: "SELECT 1" }, { query: "UPDATE t SET a = 1" }] }, false],
  ])("%j -> %s", (body, expected) => {
    expect(isReadOnlyBody(JSON.stringify(body))).toBe(expected);
  });

  it("a body it cannot read is treated as a write", () => {
    expect(isReadOnlyBody("not json")).toBe(false);
    expect(isReadOnlyBody(undefined)).toBe(false);
  });
});
