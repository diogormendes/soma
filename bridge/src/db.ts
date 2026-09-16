import { Pool } from "pg";

/**
 * The bridge runs on a GitHub runner and the database lives on a machine at home, so it cannot
 * simply open a socket to it. Exposing Postgres to the internet is not an option, so the database
 * is reached over HTTPS instead, through the gateway that answers SQL for the whole estate.
 *
 * ⛔ THE HOST IN THE CONNECTION STRING IS NOT A REAL HOST. `pg.gkos.dev` deliberately has no DNS
 * record: it exists only so a client can derive the HTTPS endpoint from it, the way Neon's own
 * driver does, by replacing the first label with `api.`. A client holding a real Postgres socket
 * tries to resolve it and dies with `getaddrinfo ENOTFOUND pg.gkos.dev`, which is exactly how the
 * Strava re-finalize workflow failed the first time this moved.
 *
 * So the driver is chosen from the connection string: an ordinary Postgres URL still gets a real
 * pool, and a gateway URL gets one that speaks HTTP. Callers see the same two methods either way.
 */
export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number }>;
  end(): Promise<void>;
}

/**
 * Read a JSONB column, whichever shape the driver handed back.
 *
 * ⛔ OVER THE GATEWAY A JSONB COLUMN ARRIVES AS A STRING. The `pg` driver parses
 * JSONB into a value; the gateway hands back the JSON its API serialised, so the
 * same column is an object locally and a string in Actions. Every JSONB reader
 * here has to coerce, and three of them already did it inline while the fourth
 * did not, which is how `loadSession` threw `cookies.map is not a function` on
 * the first run that ever reached it (soma#978).
 *
 * Local runs cannot catch this, because a local Postgres connection never
 * produces the string. That is the whole reason it lives in one place now.
 *
 * Returns `fallback` for null, undefined, or anything that will not parse. A
 * caller that needs a particular shape still has to check for it: valid JSON is
 * not the same thing as a usable row.
 */
export function jsonValue<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Run a `CREATE TABLE IF NOT EXISTS` bootstrap under a role that may not create.
 *
 * The bootstrap itself is worth keeping: a forker deploying this against an
 * empty Postgres needs the table on first run.
 *
 * ⛔ BUT IT CANNOT BE FATAL, BECAUSE `IF NOT EXISTS` DOES NOT MEAN "SKIP THE
 * PERMISSION CHECK". Postgres tests CREATE on the schema before it looks to see
 * whether the table is already there, so a least-privilege application role is
 * refused with 42501 even when the table exists and nothing needs creating.
 * This estate's roles hold exactly the SELECT/INSERT they use and no DDL, which
 * is the point of them, and that turns a no-op bootstrap line into a hard
 * failure of every run.
 *
 * Swallowing 42501 hides nothing: the caller's next statement reads or writes
 * the same table, so a table that genuinely does not exist still fails at once
 * with `relation does not exist`, which is the honest error for that condition.
 * Anything else still throws.
 *
 * This lives here, once, because the lesson was learned for the ledger in
 * main.ts and missed for the Strava session in strava-web.ts, and every live
 * run died there for it (soma#972).
 */
export async function ensureTable(db: Db, ddl: string, what: string): Promise<void> {
  try {
    await db.query(ddl);
  } catch (err) {
    if ((err as { code?: string })?.code !== "42501") throw err;
    console.warn(
      `[bridge] no CREATE privilege on the schema, so the ${what} bootstrap was skipped. ` +
        "That is expected under a least-privilege role; the table must already exist.",
    );
  }
}

/** The endpoint a gateway connection string points at, derived exactly as Neon's driver does. */
function endpointFor(host: string): string {
  return `https://${host.replace(/^[^.]+\./, "api.")}/sql`;
}

function httpDb(url: string): Db {
  const endpoint = endpointFor(new URL(url).hostname);
  return {
    async query(text, params = []) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The credential is the password in the connection string, which is what it is for
          // Neon too. Array mode is left off, so rows come back as objects like pg returns them.
          "Neon-Connection-String": url,
        },
        body: JSON.stringify({ query: text, params }),
      });
      const body = await res.json().catch(() => ({}) as any);
      if (!res.ok) {
        // Surface it as a database error, so callers' own handling still applies.
        const err = new Error(body?.message || `gateway HTTP ${res.status}`);
        Object.assign(err, { code: body?.code, detail: body?.detail, hint: body?.hint });
        throw err;
      }
      return { rows: body.rows ?? [], rowCount: body.rowCount ?? 0 };
    },
    async end() {
      /* nothing to close: every query is its own request */
    },
  };
}

/** A database handle for whatever the connection string names. */
export function openDb(url: string): Db {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* fall through to the real driver, which will complain more usefully than we can */
  }
  if (host.startsWith("pg.")) return httpDb(url);
  const pool = new Pool({ connectionString: url });
  // An idle client emitting error with no listener takes the process down, and idle clients emit
  // on any backend restart. The bridge is short-lived, but it runs unattended.
  pool.on("error", (err) => console.error("[bridge] idle client error:", err.message));
  return {
    // pg types rowCount as nullable; the callers here only ever read rows, so normalise it.
    query: async (text, params) => {
      const r = await pool.query(text, params as any[]);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    end: () => pool.end(),
  };
}
