"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Ingredient } from "@/lib/portion-solver";
import { canQuickAdd, isEstimated, quickAddDefaults, rankIngredients, recentlyUsed, type CatalogIngredient } from "macro-engine-core";
import { IngredientResearchPanel, sourceLabel, type Proposal } from "@/components/ingredient-research-panel";

const CATEGORY_ORDER = ["protein", "carbs", "grain", "vegetable", "fat", "dairy", "fruit", "sauce", "supplement"];

const CATEGORY_LABELS: Record<string, string> = {
  protein: "Protein", carbs: "Carbs", grain: "Grain", vegetable: "Vegetable", fat: "Fat",
  dairy: "Dairy", fruit: "Fruit", sauce: "Sauce", supplement: "Supplement",
  condiment: "Condiment", drink: "Drink", snack: "Snack", dessert: "Dessert", treat: "Treat", restaurant: "Restaurant",
};

/** The catalog row as the picker sees it: the solver's ingredient plus how it has been used (soma#932). */
export type PickerIngredient = Ingredient & CatalogIngredient;

interface IngredientPickerProps {
  ingredients: PickerIngredient[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDone: () => void;
  onCancel: () => void;
  /** A researched or estimated ingredient was confirmed into the catalog: the parent selects it and refreshes its list. */
  onIngredientAdded?: (ing: Ingredient) => void;
}

const fmt = (v: number | null) => (v == null ? "?" : String(v));

/**
 * Pick ingredients for a composed meal (soma#935). The ones already used come first; with a
 * query the list is one ranked row set. When the catalog runs out, a button under the results
 * searches USDA and Open Food Facts on demand (never while typing), each candidate has a one-tap
 * Add and an edit path, and a second button asks Claude for an estimate, marked "est." wherever
 * that ingredient then appears.
 */
export function IngredientPicker({ ingredients, selected, onToggle, onDone, onCancel, onIngredientAdded }: IngredientPickerProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [researchOpen, setResearchOpen] = useState(false);
  const [editPick, setEditPick] = useState<Proposal | null>(null);
  const [more, setMore] = useState<{ query: string; proposals: Proposal[]; warnings: string[] } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [estimate, setEstimate] = useState<{ query: string; proposal: Proposal } | null>(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [sourceErr, setSourceErr] = useState<string | null>(null);
  // Confirmed in this session, shown before the parent's refresh lands.
  const [added, setAdded] = useState<PickerIngredient[]>([]);

  const have = new Set(ingredients.map((i) => i.id));
  const catalog: PickerIngredient[] = added.length ? [...ingredients, ...added.filter((a) => !have.has(a.id))] : ingredients;
  const query = search.trim();
  const ranked = query ? rankIngredients(catalog, query) : [];
  const recent = query ? [] : recentlyUsed(catalog, 8);
  const grouped = new Map<string, PickerIngredient[]>();
  if (!query) for (const ing of catalog) { if (!grouped.has(ing.category)) grouped.set(ing.category, []); grouped.get(ing.category)!.push(ing); }

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  async function searchMore() {
    if (query.length < 2) return;
    setMoreBusy(true); setSourceErr(null);
    try {
      const r = await fetch("/api/nutrition/ingredients/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; proposals?: Proposal[]; warnings?: string[] };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMore({ query, proposals: j.proposals ?? [], warnings: j.warnings ?? [] });
    } catch (e) { setSourceErr(String((e as Error).message ?? e)); }
    finally { setMoreBusy(false); }
  }
  async function askClaude() {
    if (query.length < 2) return;
    setEstimateBusy(true); setSourceErr(null);
    try {
      const r = await fetch("/api/nutrition/ingredients/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; proposal?: Proposal };
      if (!r.ok || !j.proposal) throw new Error(j.error ?? `HTTP ${r.status}`);
      setEstimate({ query, proposal: j.proposal });
    } catch (e) { setSourceErr(String((e as Error).message ?? e)); }
    finally { setEstimateBusy(false); }
  }
  /** A confirmed catalog row is selected at once, before the parent's refresh. */
  function adopt(ing: Ingredient) {
    setAdded((a) => [...a.filter((x) => x.id !== ing.id), ing as PickerIngredient]);
    if (!selected.has(ing.id)) onToggle(ing.id);
    onIngredientAdded?.(ing);
    setSearch(""); setMore(null); setEstimate(null); setResearchOpen(false); setEditPick(null);
  }
  /** One tap: confirm with the shared defaults and select. An unknown macro goes through the edit form (an unknown is not 0). */
  async function quickAdd(p: Proposal) {
    if (!canQuickAdd(p)) { setEditPick(p); setResearchOpen(true); return; }
    setAdding(p.id); setSourceErr(null);
    const d = quickAddDefaults(p);
    const r = await fetch("/api/nutrition/ingredients/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      proposal_id: p.id, ...d,
      calories_per_100g: p.calories_per_100g, protein_per_100g: p.protein_per_100g, carbs_per_100g: p.carbs_per_100g, fat_per_100g: p.fat_per_100g, fiber_per_100g: p.fiber_per_100g,
    }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ingredient?: Ingredient; error?: string };
    setAdding(null);
    if (r.ok && j.ok && j.ingredient) { adopt(j.ingredient); return; }
    if (r.status === 409) {
      // The id is taken: the catalog already has this food. Select that row rather than overwrite it blind.
      const existing = catalog.find((i) => i.id === d.id);
      if (existing) { if (!selected.has(existing.id)) onToggle(existing.id); setSearch(""); return; }
      setEditPick(p); setResearchOpen(true); return;
    }
    setSourceErr(j.error ?? `HTTP ${r.status}`);
  }

  const estBadge = <span className="ml-1 rounded-full border border-amber-500 px-1 text-[10px] leading-4 text-amber-500">est.</span>;
  const chip = (ing: PickerIngredient) => (
    <Button key={ing.id} variant={selected.has(ing.id) ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => onToggle(ing.id)} data-testid={`ing-${ing.id}`}>
      {ing.name}{isEstimated(ing) ? estBadge : null}
    </Button>
  );
  const candidate = (p: Proposal) => {
    const est = p.source === "claude";
    const flags = p.flags.filter((f) => f !== "estimated");
    return (
      <div key={p.id} data-testid={`candidate-${p.id}`} className="flex items-start justify-between gap-2 rounded-md border p-2">
        <div className="min-w-0">
          <div className="text-sm">{p.name}{p.brand ? ` · ${p.brand}` : ""}{est ? estBadge : null}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{fmt(p.calories_per_100g)} kcal · P {fmt(p.protein_per_100g)} · C {fmt(p.carbs_per_100g)} · F {fmt(p.fat_per_100g)} · fib {fmt(p.fiber_per_100g)} /100 g</div>
          <div className={`text-xs ${est ? "text-amber-500" : "text-primary"}`}>{sourceLabel(p)} · {Math.round(p.confidence * 100)}%{flags.length ? ` · ${flags.join(", ")}` : ""}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button size="sm" className="h-7 text-xs" data-testid={`add-${p.id}`} disabled={adding != null} onClick={() => quickAdd(p)}>{adding === p.id ? "…" : canQuickAdd(p) ? "Add" : "Fill in…"}</Button>
          <button className="text-xs text-muted-foreground underline" data-testid={`edit-${p.id}`} onClick={() => { setEditPick(p); setResearchOpen(true); }}>edit</button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Pick ingredients ({selected.size} selected)
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <input
        type="text"
        placeholder="Search ingredients..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border px-2 py-1.5 text-sm bg-background"
        autoFocus
      />

      {query ? (
        ranked.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-2">Nothing in your catalog matches &ldquo;{query}&rdquo;</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">{ranked.map(chip)}</div>
        )
      ) : (
        <>
          {recent.length ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recently used</div>
              <div className="flex flex-wrap gap-1.5">{recent.map(chip)}</div>
            </div>
          ) : null}
          {[...CATEGORY_ORDER.filter((cat) => grouped.has(cat)), ...[...grouped.keys()].filter((cat) => !CATEGORY_ORDER.includes(cat))].map((cat) => (
            <div key={cat}>
              <button
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5"
                onClick={() => toggleCategory(cat)}
              >
                {collapsed.has(cat) ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
              {!collapsed.has(cat) && <div className="flex flex-wrap gap-1.5">{grouped.get(cat)!.map(chip)}</div>}
            </div>
          ))}
        </>
      )}

      {/* Beyond the catalog (soma#935), on demand and never while typing: the food tables first, then Claude. */}
      {query.length >= 2 && !researchOpen ? (
        <div className="space-y-2">
          {more?.query === query ? (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">From USDA &amp; Open Food Facts</div>
              {more.proposals.length === 0 ? <div className="text-xs text-muted-foreground">Nothing in USDA or Open Food Facts for &ldquo;{query}&rdquo;.</div> : more.proposals.map(candidate)}
              {more.warnings.map((w) => <div key={w} className="text-xs text-amber-500">{w}</div>)}
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs" data-testid="search-more" disabled={moreBusy} onClick={searchMore}>
              {moreBusy ? "Searching USDA & Open Food Facts…" : `Search USDA & Open Food Facts for “${query}”`}
            </Button>
          )}
          {more?.query === query ? (
            estimate?.query === query ? (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Estimated by Claude</div>
                {candidate(estimate.proposal)}
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full text-xs text-amber-600" data-testid="estimate-row" disabled={estimateBusy} onClick={askClaude}>
                {estimateBusy ? "Asking Claude… this takes 10–30 s" : `Estimate “${query}” with Claude`}
              </Button>
            )
          ) : null}
          {sourceErr ? <div className="text-xs text-red-500">{sourceErr}</div> : null}
        </div>
      ) : null}

      {/* The edit path (T3a): the full research panel, opened on a candidate's confirm form or on the query. */}
      {researchOpen ? (
        <IngredientResearchPanel
          initialQuery={query}
          initialPick={editPick}
          onClose={() => { setResearchOpen(false); setEditPick(null); }}
          onConfirmed={(ing) => adopt(ing)}
        />
      ) : null}

      {selected.size > 0 && (
        <Button size="sm" className="w-full" onClick={onDone}>
          Size portions ({selected.size} ingredients)
        </Button>
      )}
    </div>
  );
}
