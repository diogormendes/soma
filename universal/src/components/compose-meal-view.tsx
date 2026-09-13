import { useState, useMemo, useEffect } from "react";
import { View, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { IngredientResearchSheet } from "./ingredient-research-sheet";
import { Text, Button } from "soma-style";
import {
  logComposedMeal, deleteMeal, savePreset,
  isCountBased, countToGrams, gramsToCount, rawToCooked, cookedToRaw, hasRawCookedToggle,
  researchIngredient, estimateIngredient, confirmIngredient,
  type Ingredient, type ComposeItem, type IngredientProposal,
} from "../lib/api";
import { solvePortions, computeItemMacros, rankIngredients, recentlyUsed, quickAddDefaults, canQuickAdd, isEstimated, type Ingredient as MEIngredient } from "macro-engine-core";

/** The app Ingredient is structurally the macro-engine-core Ingredient (only `unit`
 *  differs by null vs undefined); cast so the app shares web's solver + macro math. */
const mei = (ing: Ingredient): MEIngredient => ing as unknown as MEIngredient;
const im = (ing: Ingredient, grams: number) => computeItemMacros(mei(ing), grams);

const CATEGORY_LABELS: Record<string, string> = {
  protein: "Protein", carbs: "Carbs", grain: "Grain", vegetable: "Vegetable", fat: "Fat",
  dairy: "Dairy", fruit: "Fruit", sauce: "Sauce", supplement: "Supplement",
};
const CATEGORY_ORDER = ["protein", "carbs", "grain", "vegetable", "fat", "dairy", "fruit", "sauce", "supplement"];

/** Readable name from meal items, e.g. "Chicken Breast, Rice & Broccoli".
 *  Mirrors web's autoMealName (supplements/liquids sorted last). */
function autoMealName(items: { ingredient_id: string; name?: string }[]): string {
  if (!items.length) return "Custom meal";
  const pr = (id: string) => {
    const s = (id || "").toLowerCase();
    if (/whey|protein_powder|creatine|supplement|flax/.test(s)) return 3;
    if (/milk|water|juice|yogurt/.test(s)) return 2;
    return 1;
  };
  const sorted = [...items].sort((a, b) => pr(a.ingredient_id || a.name || "") - pr(b.ingredient_id || b.name || ""));
  const names = sorted.slice(0, 3).map((it) =>
    (it.name || it.ingredient_id || "")
      .replace(/_raw$/, "").replace(/_(dry|whole)$/i, "").replace(/_\d+pct$/i, "")
      .replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim());
  if (names.length <= 1) return names[0] || "Custom meal";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} & ${names[2]}`;
}

/** Compose a meal from raw ingredients: search + category-grouped picker,
 *  per-ingredient editors (grams, or pieces for count-based, or cooked weight),
 *  a max-yolks clamp, live macros + running totals + a volume-score hint, and
 *  a save-as-preset step after logging. Full parity with the web ComposeMealView. */
export function ComposeMealView({
  ingredients, date, slot, slotBudget, onLogged, initialGrams, editMealId, onTotalsChange, onIngredientAdded,
}: {
  ingredients: Ingredient[]; date: string; slot: string; onLogged: () => void;
  /** The slot's kcal budget — seeds the auto-solver so the preview ≈ budget (web parity). */
  slotBudget?: number;
  /** Pre-select ingredients (id -> grams) — used when editing a logged meal. */
  initialGrams?: Record<string, number>;
  /** When set, saving deletes this meal after re-logging (edit = replace). */
  editMealId?: number | null;
  /** Emits the in-progress meal totals on every change, so the screen can fold
   *  them into the day's live preview (remaining kcal + macro bars). */
  onTotalsChange?: (t: { calories: number; protein: number; carbs: number; fat: number; fiber: number }) => void;
  /** A researched ingredient was confirmed into the catalog — the parent refetches presets (T3a). */
  onIngredientAdded?: (ing: Ingredient) => void;
}) {
  const [search, setSearch] = useState("");
  const [researchOpen, setResearchOpen] = useState(false);
  // Beyond the catalog (soma#934): candidates from USDA / Open Food Facts loaded on demand, a Claude
  // estimate, the ingredients confirmed in this session (usable before the parent's refetch lands),
  // and the candidate being edited in the sheet.
  const [more, setMore] = useState<{ query: string; proposals: IngredientProposal[]; warnings: string[] } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [estimate, setEstimate] = useState<{ query: string; proposal: IngredientProposal } | null>(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [sourceErr, setSourceErr] = useState<string | null>(null);
  const [added, setAdded] = useState<Ingredient[]>([]);
  const [editPick, setEditPick] = useState<IngredientProposal | null>(null);
  // Typed portions (soma#934): the quantity is a field, not only a stepper. A draft holds the keystrokes
  // until the field is left, so "1" on the way to "120" never lands as 1 g.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [grams, setGrams] = useState<Record<string, number>>(initialGrams ?? {});
  const [busy, setBusy] = useState(false);
  const [cookedMode, setCookedMode] = useState<Set<string>>(new Set());
  const [gramMode, setGramMode] = useState<Set<string>>(new Set());
  const [maxYolks, setMaxYolks] = useState(1);
  const [savePrompt, setSavePrompt] = useState<{ items: ComposeItem[]; totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number }; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const initKey = initialGrams ? Object.entries(initialGrams).map(([k, v]) => `${k}:${v}`).join(",") : "";
  // A new initial set replaces the grams: adjusted during render, not in an effect.
  const [seenInit, setSeenInit] = useState(initKey);
  if (seenInit !== initKey) { setSeenInit(initKey); if (initialGrams) setGrams(initialGrams); }

  // The catalog plus what was confirmed here this session (the parent's refetch replaces it).
  const catalog = useMemo(() => {
    if (!added.length) return ingredients;
    const have = new Set(ingredients.map((i) => i.id));
    return [...ingredients, ...added.filter((a) => !have.has(a.id))];
  }, [ingredients, added]);
  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const selectedIds = Object.keys(grams).filter((id) => (grams[id] ?? 0) > 0 && byId.has(id));

  const query = search.trim();
  // With a query: one ranked list, the ones already used first. Without: "Recently used", then the categories.
  const ranked = useMemo(() => (query ? rankIngredients(catalog, query) : []), [catalog, query]);
  const recent = useMemo(() => (query ? [] : recentlyUsed(catalog, 8)), [catalog, query]);
  const groups = useMemo(() => {
    const m = new Map<string, Ingredient[]>();
    for (const ing of query ? [] : catalog) {
      const c = ing.category || "other";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(ing);
    }
    const order = [...CATEGORY_ORDER, ...[...m.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
    return order.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const);
  }, [catalog, query]);

  const totals = selectedIds.reduce(
    (a, id) => {
      const mm = im(byId.get(id)!, grams[id]);
      return { calories: a.calories + mm.calories, protein: a.protein + mm.protein, carbs: a.carbs + mm.carbs, fat: a.fat + mm.fat, fiber: a.fiber + mm.fiber };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  const totalGrams = selectedIds.reduce((s, id) => s + (grams[id] || 0), 0);
  const volumeScore = totals.calories > 0 ? totalGrams / totals.calories : 0;

  // Push the running totals up so the screen's day preview updates live.
  useEffect(() => {
    onTotalsChange?.(totals);
  }, [totals.calories, totals.protein, totals.carbs, totals.fat, totals.fiber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Web parity: adding an ingredient re-solves the whole selection to the slot's
  // kcal budget (+30g MPS protein floor) via solvePortions, so the preview totals
  // land near the budget immediately instead of dropping in a flat 100g.
  const addWith = (id: string, lookup: Map<string, Ingredient>) => setGrams((g) => {
    const ids = new Set(Object.keys(g).filter((k) => (g[k] ?? 0) > 0 && lookup.has(k)));
    ids.add(id);
    const sel = [...ids].map((k) => lookup.get(k)).filter((x): x is Ingredient => !!x);
    if (!slotBudget || slotBudget <= 0 || sel.length === 0) {
      return { ...g, [id]: g[id] && g[id] > 0 ? g[id] : 100 };
    }
    const next: Record<string, number> = {};
    for (const p of solvePortions(sel.map(mei), { calories: slotBudget })) next[p.ingredient_id] = p.grams;
    return next;
  });
  const add = (id: string) => addWith(id, byId);
  const setG = (id: string, v: number) => setGrams((g) => ({ ...g, [id]: Math.max(0, Math.round(v)) }));
  // Every keystroke lands (Android does not blur a field when the keyboard hides, so a commit on blur
  // alone can lose the typed value); the draft only keeps what is shown while typing.
  // A cleared field or a leading "0" (on the way to "0.5") must not zero the row: zero grams deselects the
  // ingredient, the field unmounts, and the next keystrokes land in the next row (seen on the device tour).
  const parseQty = (raw: string): number | null => {
    const t = raw.trim().replace(",", ".");
    if (t === "") return null;
    const v = Number(t);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const applyQty = (id: string, ing: Ingredient, asCount: boolean, asCooked: boolean, raw: string) => {
    const v = parseQty(raw);
    if (v == null || v <= 0) return;
    if (asCount) setG(id, countToGrams(ing, v));
    else if (asCooked) setG(id, cookedToRaw(ing, v));
    else setG(id, v);
  };
  /** Leaving the field: an explicit 0 removes the row; an empty field keeps the last value. */
  const finishQty = (id: string, ing: Ingredient, asCount: boolean, asCooked: boolean) => {
    const raw = draft[id];
    if (raw != null && parseQty(raw) === 0) setG(id, 0);
    else if (raw != null) applyQty(id, ing, asCount, asCooked, raw);
    setDraft((d) => { if (!(id in d)) return d; const n = { ...d }; delete n[id]; return n; });
  };
  const remove = (id: string) => setGrams((g) => { const n = { ...g }; delete n[id]; return n; });
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    setter((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleCooked = toggleSet(setCookedMode);
  const toggleGramMode = toggleSet(setGramMode);

  // ── Beyond the catalog: search more (USDA + Open Food Facts), estimate with Claude, one-tap add ──
  async function searchMore() {
    if (query.length < 2) return;
    setMoreBusy(true); setSourceErr(null);
    try { const r = await researchIngredient(query); setMore({ query, proposals: r.proposals, warnings: r.warnings }); }
    catch (e) { setSourceErr(String((e as Error).message ?? e)); }
    finally { setMoreBusy(false); }
  }
  async function askClaude() {
    if (query.length < 2) return;
    setEstimateBusy(true); setSourceErr(null);
    try { const r = await estimateIngredient(query); setEstimate({ query, proposal: r.proposal }); }
    catch (e) { setSourceErr(String((e as Error).message ?? e)); }
    finally { setEstimateBusy(false); }
  }
  /** A confirmed catalog row lands in the meal at once, before the parent's refetch. */
  function adopt(ing: Ingredient) {
    setAdded((a) => [...a.filter((x) => x.id !== ing.id), ing]);
    const lookup = new Map(byId); lookup.set(ing.id, ing);
    addWith(ing.id, lookup);
    onIngredientAdded?.(ing);
    setSearch(""); setMore(null); setEstimate(null);
  }
  /** One tap: confirm the candidate with the shared defaults and put it in the meal. A candidate with an
   *  unknown macro goes through the edit sheet instead (an unknown is not 0). */
  async function quickAdd(p: IngredientProposal) {
    if (!canQuickAdd(p)) { setEditPick(p); setResearchOpen(true); return; }
    setAdding(p.id); setSourceErr(null);
    const d = quickAddDefaults(p);
    const r = await confirmIngredient({
      proposal_id: p.id, ...d,
      calories_per_100g: p.calories_per_100g!, protein_per_100g: p.protein_per_100g!, carbs_per_100g: p.carbs_per_100g!,
      fat_per_100g: p.fat_per_100g!, fiber_per_100g: p.fiber_per_100g!,
    });
    setAdding(null);
    if (r.ok && r.ingredient) { adopt(r.ingredient); return; }
    if (r.status === 409) {
      // The id is taken: the catalog already has this food. Use that row rather than overwrite it blind.
      const have = byId.get(d.id);
      if (have) { add(have.id); setSearch(""); return; }
      setEditPick(p); setResearchOpen(true); return;
    }
    setSourceErr(r.error ?? `HTTP ${r.status}`);
  }

  const fmtN = (v: number | null) => (v == null ? "?" : String(v));
  const estBadge = <Text variant="micro" className="rounded-full border border-warm px-1 text-warm">est.</Text>;
  const renderRow = (ing: Ingredient) => {
    const on = (grams[ing.id] ?? 0) > 0;
    return (
      <Pressable key={ing.id} onPress={() => (on ? remove(ing.id) : add(ing.id))} className="flex-row items-center justify-between border-b border-border-subtle py-1.5">
        <View className="flex-1 flex-row items-center gap-1.5 pr-2">
          <Text variant="caption" className={on ? "text-teal" : "text-text"} numberOfLines={1}>{ing.name}</Text>
          {isEstimated(ing) ? estBadge : null}
        </View>
        <Text variant="micro" className="text-text-muted tabular-nums">{on ? "✓ " : ""}{Math.round(ing.calories_per_100g)}/100g</Text>
      </Pressable>
    );
  };
  const sourceLabel = (p: IngredientProposal) => (p.source === "usda" ? "USDA" : p.source === "off" ? "Open Food Facts" : "Claude estimate");
  const renderProposal = (p: IngredientProposal) => {
    const est = p.source === "claude";
    const flags = p.flags.filter((f) => f !== "estimated");
    return (
      <View key={p.id} testID={`candidate-${p.id}`} className="rounded-md border border-border-subtle p-2">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text variant="caption" className="text-text" numberOfLines={2}>{p.name}{p.brand ? ` · ${p.brand}` : ""}</Text>
              {est ? estBadge : null}
            </View>
            <Text variant="micro" className="text-text-muted tabular-nums">{fmtN(p.calories_per_100g)} kcal · P {fmtN(p.protein_per_100g)} · C {fmtN(p.carbs_per_100g)} · F {fmtN(p.fat_per_100g)} · fib {fmtN(p.fiber_per_100g)} /100 g</Text>
            <Text variant="micro" className={est ? "text-warm" : "text-teal"}>{sourceLabel(p)} · {Math.round(p.confidence * 100)}%{flags.length ? ` · ${flags.join(", ")}` : ""}</Text>
          </View>
          <View className="items-end gap-1">
            <Pressable testID={est ? "estimate-add" : `add-${p.id}`} onPress={() => quickAdd(p)} disabled={adding != null}>
              <Button label={adding === p.id ? "…" : canQuickAdd(p) ? "Add" : "Fill in…"} variant="primary" size="sm" disabled={adding != null} onPress={() => quickAdd(p)} />
            </Pressable>
            <Pressable testID={`edit-${p.id}`} onPress={() => { setEditPick(p); setResearchOpen(true); }} hitSlop={6}><Text variant="micro" className="text-text-muted">edit</Text></Pressable>
          </View>
        </View>
      </View>
    );
  };

  // Clamp whole-egg grams to the yolk cap when the max changes (mirrors web):
  // adjusted during render, not in an effect.
  const [seenMax, setSeenMax] = useState(maxYolks);
  if (seenMax !== maxYolks) {
    setSeenMax(maxYolks);
    const ing = byId.get("eggs_whole");
    if (ing && grams["eggs_whole"] > 0) {
      const maxGrams = (Number(ing.grams_per_unit) || 50) * maxYolks;
      if (grams["eggs_whole"] > maxGrams) setG("eggs_whole", maxGrams);
    }
  }

  function buildItems(): ComposeItem[] {
    return selectedIds.map((id) => {
      const ing = byId.get(id)!;
      const m = im(ing, grams[id]);
      return { ingredient_id: id, name: ing.name, grams: grams[id], calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber };
    });
  }

  async function onLog() {
    setBusy(true);
    const items = buildItems();
    const ok = await logComposedMeal(date, slot, items);
    if (ok && editMealId != null) await deleteMeal(editMealId);
    setBusy(false);
    if (!ok) return;
    if (editMealId == null) {
      // New meal — offer to save it as a preset before closing.
      const t = { calories: Math.round(totals.calories), protein: Math.round(totals.protein), carbs: Math.round(totals.carbs), fat: Math.round(totals.fat), fiber: Math.round(totals.fiber) };
      setSavePrompt({ items, totals: t, name: autoMealName(items) });
    } else {
      setGrams({}); onLogged();
    }
  }

  async function onSavePreset() {
    if (!savePrompt) return;
    setSaving(true); setSaveErr(null);
    const ok = await savePreset(savePrompt.name.trim(), savePrompt.items, slot, savePrompt.totals);
    setSaving(false);
    if (ok) { setSavePrompt(null); setGrams({}); onLogged(); }
    else setSaveErr("Couldn't save preset.");
  }

  // Save-as-preset step (after a new meal is logged).
  if (savePrompt) {
    return (
      <View className="gap-3 rounded-lg border border-dashed border-border-subtle p-3">
        <Text variant="caption" className="text-text-secondary">Meal logged. Save it as a preset for reuse?</Text>
        <TextInput
          value={savePrompt.name}
          onChangeText={(v) => setSavePrompt((p) => (p ? { ...p, name: v } : p))}
          placeholder="Preset name"
          placeholderTextColor="#5a7a8a"
          className="rounded-md border border-border-subtle px-3 py-2 text-text"
        />
        {saveErr ? <Text variant="micro" className="text-danger">{saveErr}</Text> : null}
        <View className="flex-row justify-end gap-2">
          <Button label="Skip" variant="ghost" size="sm" onPress={() => { setSavePrompt(null); setGrams({}); onLogged(); }} />
          <Button label={saving ? "…" : "Save preset"} variant="primary" size="sm" disabled={saving || !savePrompt.name.trim()} onPress={onSavePreset} />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {/* Selected ingredients — grams / pieces / cooked-weight editors + live macros */}
      {selectedIds.length ? (
        <View className="gap-2 rounded-lg border border-border-subtle p-3">
          <Text variant="eyebrow" className="text-text-muted">In this meal</Text>
          {selectedIds.map((id) => {
            const ing = byId.get(id)!;
            const g = grams[id];
            const m = im(ing, g);
            const asCount = isCountBased(ing) && !gramMode.has(id);
            const canCook = hasRawCookedToggle(ing);
            const asCooked = canCook && cookedMode.has(id);

            let qty: number;
            let displayVal: string;
            let onMinus: () => void;
            let onPlus: () => void;
            if (asCount) {
              const count = gramsToCount(ing, g);
              const step = Number(ing.unit_step) || 1;
              displayVal = `${count} ${ing.unit || "pcs"}`; qty = count;
              onMinus = () => setG(id, countToGrams(ing, Math.max(0, count - step)));
              onPlus = () => setG(id, countToGrams(ing, count + step));
            } else if (asCooked) {
              const cooked = rawToCooked(ing, g);
              displayVal = `${cooked} g`; qty = cooked;
              onMinus = () => setG(id, cookedToRaw(ing, Math.max(0, cooked - 10)));
              onPlus = () => setG(id, cookedToRaw(ing, cooked + 10));
            } else {
              displayVal = `${g} g`; qty = g;
              onMinus = () => setG(id, g - 10);
              onPlus = () => setG(id, g + 10);
            }

            return (
              <View key={id} className="border-b border-border-subtle pb-1.5">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5"><Text variant="caption" className="text-text" numberOfLines={1}>{ing.name}</Text>{isEstimated(ing) ? estBadge : null}</View>
                    <Text variant="micro" className="text-text-muted tabular-nums">
                      {Math.round(m.calories)} kcal · P{Math.round(m.protein)} C{Math.round(m.carbs)} F{Math.round(m.fat)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Pressable testID={`minus-${id}`} onPress={onMinus}><Button label="−" variant="ghost" size="sm" onPress={onMinus} /></Pressable>
                    <View className="w-20 flex-row items-center justify-center" accessibilityLabel={displayVal}>
                      <TextInput
                        testID={`qty-${id}`}
                        value={draft[id] ?? String(qty)}
                        onChangeText={(t) => { setDraft((d) => ({ ...d, [id]: t })); applyQty(id, ing, asCount, asCooked, t); }}
                        onEndEditing={() => finishQty(id, ing, asCount, asCooked)}
                        onSubmitEditing={() => finishQty(id, ing, asCount, asCooked)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        className="min-w-[34px] text-center text-text tabular-nums"
                        style={{ padding: 0, fontSize: 13 }}
                      />
                      <Text variant="caption" className="text-text-muted"> {asCount ? ing.unit || "pcs" : "g"}</Text>
                    </View>
                    <Pressable testID={`plus-${id}`} onPress={onPlus}><Button label="+" variant="ghost" size="sm" onPress={onPlus} /></Pressable>
                    <Pressable testID={`remove-${id}`} onPress={() => remove(id)}><Button label="✕" variant="ghost" size="sm" onPress={() => remove(id)} /></Pressable>
                  </View>
                </View>
                {canCook || isCountBased(ing) ? (
                  <View className="flex-row gap-4 pt-0.5">
                    {canCook ? (
                      <Pressable onPress={() => toggleCooked(id)} hitSlop={6}>
                        <Text variant="micro" className="text-teal">{asCooked ? `cooked (${g}g raw)` : "switch to cooked weight"}</Text>
                      </Pressable>
                    ) : null}
                    {isCountBased(ing) ? (
                      <Pressable onPress={() => toggleGramMode(id)} hitSlop={6}>
                        <Text variant="micro" className="text-teal">{gramMode.has(id) ? `switch to ${ing.unit || "pcs"}` : "switch to grams"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* Max yolks/day — clamps whole-egg grams */}
          {selectedIds.includes("eggs_whole") ? (
            <View className="flex-row items-center justify-between rounded-md px-2 py-1.5" style={{ backgroundColor: "#11202066" }}>
              <Text variant="micro" className="text-text-muted">Max yolks / day</Text>
              <View className="flex-row items-center gap-1.5">
                {[1, 2, 3].map((n) => (
                  <Pressable key={n} onPress={() => setMaxYolks(n)} hitSlop={4}>
                    <View className="h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: maxYolks === n ? "#77c8d1" : "#152232" }}>
                      <Text variant="caption" style={{ color: maxYolks === n ? "#0a1720" : "#a0b4c0" }}>{n}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {totals.calories > 0 ? (
            <Text variant="micro" className="text-center" style={{ color: volumeScore >= 1.5 ? "#6ad4a0" : volumeScore >= 0.8 ? "#5a7a8a" : "#e0a458" }}>
              {volumeScore >= 1.5 ? "High volume — great for satiety" : volumeScore >= 0.8 ? `${Math.round(totalGrams)}g total` : `${Math.round(totalGrams)}g total — low volume`}
            </Text>
          ) : null}

          <View className="flex-row items-center justify-between pt-1">
            <Text variant="caption" className="font-semibold tabular-nums">
              {Math.round(totals.calories)} kcal · P{Math.round(totals.protein)} C{Math.round(totals.carbs)} F{Math.round(totals.fat)}
            </Text>
            <Pressable testID="log-meal" onPress={onLog} disabled={busy || selectedIds.length === 0}><Button label={busy ? "…" : editMealId != null ? "Save changes" : "Log meal"} variant="primary" size="sm" disabled={busy || selectedIds.length === 0} onPress={onLog} /></Pressable>
          </View>
        </View>
      ) : null}

      {/* Search + category-grouped ingredient picker */}
      <TextInput
        testID="compose-search"
        placeholder="Search ingredients…"
        placeholderTextColor="#5a7a8a"
        value={search}
        onChangeText={setSearch}
        className="rounded-md border border-border-subtle px-3 py-2 text-text"
      />
      <ScrollView className="max-h-72" keyboardShouldPersistTaps="handled">
        {query ? (
          ranked.length === 0 ? <Text variant="caption" className="text-text-muted">{"Nothing in your catalog matches \u201c" + query + "\u201d."}</Text> : ranked.map(renderRow)
        ) : (
          <>
            {recent.length ? (
              <View className="mb-2">
                <Text variant="micro" className="mb-1 text-text-muted">Recently used</Text>
                {recent.map(renderRow)}
              </View>
            ) : null}
            {groups.map(([cat, list]) => (
              <View key={cat} className="mb-2">
                <Text variant="micro" className="mb-1 text-text-muted">{CATEGORY_LABELS[cat] ?? cat}</Text>
                {list.map(renderRow)}
              </View>
            ))}
          </>
        )}

        {/* Beyond the catalog (soma#934), on demand and never while typing: the food tables first, then Claude.
            Sits under the results like a "load more" so it is reachable exactly when the catalog ran out. */}
        {query.length >= 2 ? (
          <View className="mt-2 gap-2">
            {more?.query === query ? (
              <View className="gap-1">
                <Text variant="micro" className="text-text-muted">{"From USDA & Open Food Facts"}</Text>
                {more.proposals.length === 0 ? <Text variant="caption" className="text-text-muted">{"Nothing in USDA or Open Food Facts for \u201c" + query + "\u201d."}</Text> : more.proposals.map(renderProposal)}
                {more.warnings.map((w) => <Text key={w} variant="micro" className="text-warm">{w}</Text>)}
              </View>
            ) : (
              <Pressable testID="search-more" onPress={searchMore} disabled={moreBusy} className="flex-row items-center justify-center gap-2 rounded-md border border-border-subtle py-2">
                {moreBusy ? <ActivityIndicator size="small" /> : null}
                <Text variant="caption" className="text-teal">{moreBusy ? "Searching USDA & Open Food Facts\u2026" : "Search USDA & Open Food Facts for \u201c" + query + "\u201d"}</Text>
              </Pressable>
            )}
            {more?.query === query ? (
              estimate?.query === query ? (
                <View className="gap-1">
                  <Text variant="micro" className="text-text-muted">Estimated by Claude</Text>
                  {renderProposal(estimate.proposal)}
                </View>
              ) : (
                <Pressable testID="estimate-row" onPress={askClaude} disabled={estimateBusy} className="flex-row items-center justify-center gap-2 rounded-md border border-border-subtle py-2">
                  {estimateBusy ? <ActivityIndicator size="small" /> : null}
                  <Text variant="caption" className="text-warm">{estimateBusy ? "Asking Claude\u2026 this takes 10\u201330 s" : "Estimate \u201c" + query + "\u201d with Claude"}</Text>
                </Pressable>
              )
            ) : null}
            {sourceErr ? <Text variant="micro" className="text-danger">{sourceErr}</Text> : null}
          </View>
        ) : null}
      </ScrollView>
      <IngredientResearchSheet
        visible={researchOpen}
        initialQuery={query}
        initialPick={editPick}
        onClose={() => { setResearchOpen(false); setEditPick(null); }}
        onConfirmed={(ing) => adopt(ing)}
      />
    </View>
  );
}
