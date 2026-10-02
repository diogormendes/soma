/**
 * The owner's portion bands, read from his meal log. The band logic itself lives in
 * macro-engine-core (portion-bands); see the comment there for why large is the 90th percentile.
 */
import type { QueryFn } from "./db";
import type { PortionBand } from "macro-engine-core";

export { type PortionBand, MIN_OBSERVATIONS, GENERIC_BANDS, bandFor } from "macro-engine-core";

/** The owner's own distribution per ingredient, straight from the meal log. */
export async function getPortionBands(sql: QueryFn): Promise<Map<string, PortionBand>> {
  const rows = (await sql`
    WITH it AS (
      SELECT it->>'ingredient_id' AS id, (it->>'grams')::float AS g
      FROM meal_log m
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(m.items) = 'array' THEN m.items
             WHEN jsonb_typeof(m.items->'items') = 'array' THEN m.items->'items'
             ELSE '[]'::jsonb END) it
      WHERE it->>'ingredient_id' IS NOT NULL
        AND (it->>'grams') ~ '^[0-9.]+$'
        AND (it->>'grams')::float > 0
    )
    SELECT id,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY g) AS small,
           percentile_cont(0.50) WITHIN GROUP (ORDER BY g) AS usual,
           percentile_cont(0.90) WITHIN GROUP (ORDER BY g) AS large,
           count(*)::int AS n
    FROM it GROUP BY id`) as Array<Record<string, unknown>>;
  const m = new Map<string, PortionBand>();
  for (const r of rows) {
    m.set(String(r.id), {
      small: Math.round(Number(r.small)), usual: Math.round(Number(r.usual)),
      large: Math.round(Number(r.large)), n: Number(r.n),
    });
  }
  return m;
}
