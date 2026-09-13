/**
 * The confirmed ingredient catalog as the pickers want it (soma#932): every row plus how it has
 * been used, so a picker can show the ingredients already used on top. `use_count` and
 * `last_used` come from the meal log, `in_presets` from the preset meals; both stores keep items
 * either as a bare array or under `items.items`, and both shapes are read. One query, one shape,
 * for the API route and the server-rendered nutrition page alike.
 */
import type { QueryFn } from "./db";

export async function listIngredients(sql: QueryFn): Promise<Record<string, unknown>[]> {
  return (await sql`
    WITH used AS (
      SELECT it->>'ingredient_id' AS id, count(*)::int AS use_count, to_char(max(m.date), 'YYYY-MM-DD') AS last_used
      FROM meal_log m
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(m.items) = 'array' THEN m.items
             WHEN jsonb_typeof(m.items->'items') = 'array' THEN m.items->'items'
             ELSE '[]'::jsonb END) it
      WHERE it->>'ingredient_id' IS NOT NULL
      GROUP BY 1),
    presets AS (
      SELECT it->>'ingredient_id' AS id, count(*)::int AS in_presets
      FROM preset_meals p
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.items) = 'array' THEN p.items
             WHEN jsonb_typeof(p.items->'items') = 'array' THEN p.items->'items'
             ELSE '[]'::jsonb END) it
      WHERE it->>'ingredient_id' IS NOT NULL
      GROUP BY 1)
    SELECT i.*, COALESCE(u.use_count, 0) AS use_count, u.last_used, COALESCE(pr.in_presets, 0) AS in_presets
    FROM ingredients i
    LEFT JOIN used u ON u.id = i.id
    LEFT JOIN presets pr ON pr.id = i.id
    WHERE i.status = 'confirmed'
    ORDER BY i.category, i.name`) as Record<string, unknown>[];
}
