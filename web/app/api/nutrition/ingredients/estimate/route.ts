import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { chatMode, proxyToLocal } from "@/lib/chat-transport";
import { proposalFromEstimate, runClaudeEstimate } from "@/lib/ingredient-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// A few estimates a minute is plenty for one person adding a food; this caps a loop bug.
const PER_MINUTE = 6;
const stamps: number[] = [];
function rateLimited(): number | null {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
  if (stamps.length >= PER_MINUTE) return Math.ceil((60_000 - (now - stamps[0])) / 1000);
  stamps.push(now);
  return null;
}

/**
 * POST { query, notes? } → { query, proposal, warnings }
 * Asks the local Claude Code for per-100 g values of a food neither USDA nor Open Food Facts has
 * (soma#933) and stores the answer as an `ingredient_proposals` row with source "claude",
 * confidence capped and the flag `estimated`. The existing confirm route takes it from there.
 * Runs only where the chat runs: on Vercel it answers 410 (or forwards, on the old tunnel path).
 */
export async function POST(req: NextRequest) {
  if (chatMode() === "proxy") return proxyToLocal(req, "/api/nutrition/ingredients/estimate");
  if (chatMode() === "gone") {
    return NextResponse.json({ error: "Estimates run on the Mac, not on the demo; open soma from a tailnet device." }, { status: 410 });
  }
  const body = (await req.json().catch(() => ({}))) as { query?: string; notes?: string };
  const query = (body.query ?? "").trim();
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 300) : undefined;
  if (query.length < 2 || query.length > 80) return NextResponse.json({ error: "query must be 2–80 characters" }, { status: 400 });
  const retry = rateLimited();
  if (retry != null) return NextResponse.json({ error: `At most ${PER_MINUTE} estimates a minute; try again in ${retry} s.` }, { status: 429, headers: { "Retry-After": String(retry) } });

  let run;
  try { run = await runClaudeEstimate(query, notes); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
  const p = proposalFromEstimate(query, run);

  const sql = getDb();
  const rows = (await sql`
    INSERT INTO ingredient_proposals
      (query, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g,
       category, is_raw, source, source_id, source_url, confidence, rationale, flags)
    VALUES (${query}, ${p.name}, ${p.calories_per_100g}, ${p.protein_per_100g}, ${p.carbs_per_100g}, ${p.fat_per_100g}, ${p.fiber_per_100g},
            ${p.category}, ${p.is_raw}, ${p.source}, ${p.source_id}, ${null}, ${p.confidence}, ${p.rationale}, ${p.flags})
    RETURNING id`) as { id: number }[];
  const warnings = p.flags.includes("kcal_macro_mismatch") ? ["the estimate's kcal do not match its macros; check before you trust it"] : [];
  return NextResponse.json({ query, proposal: { ...p, id: rows[0].id }, warnings, duration_ms: run.durationMs });
}
