/**
 * Shapes for data that arrives as JSON and has no schema of ours: API payloads, FIT developer
 * fields, golden fixtures. `unknown` is the honest element type; read a field with `num`, `str`
 * or `rec` rather than reaching through `any` (soma#958).
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonRecord = Record<string, unknown>;

/** A field read as a number, or null when it is absent or not numeric. */
export function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** A field read as a non-empty string, or null. */
export function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** A field read as an object, or null. */
export function rec(v: unknown): JsonRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null;
}

/** A field read as an array, or an empty one. */
export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
