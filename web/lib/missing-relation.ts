/**
 * Postgres answers SQLSTATE 42P01 ("relation ... does not exist") when a table is missing.
 * A fresh fork, or the public demo before it was seeded, runs the web without the nutrition
 * tables; the routes that read them answer an empty day instead of a 500 (soma#947). Only
 * 42P01 qualifies. Every other error keeps surfacing, so a broken connection string or a
 * revoked grant is never mistaken for an empty database.
 */
export function isMissingRelation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; sourceError?: { code?: unknown } | null };
  if (e.code === "42P01" || e.sourceError?.code === "42P01") return true;
  return typeof e.message === "string" && /relation "[^"]+" does not exist/.test(e.message);
}

const warned = new Set<string>();

/** Log a missing relation once per process per route, so a demo does not fill its logs. */
export function warnMissingRelationOnce(route: string, err: unknown): void {
  if (warned.has(route)) return;
  warned.add(route);
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[${route}] nutrition tables missing, answering an empty day: ${msg}`);
}
