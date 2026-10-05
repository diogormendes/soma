/**
 * Per-meal protein quality (V9.1 / Schoenfeld & Aragon 2018; Trommelen 2023).
 * Classifies a single eating event for MPS signaling — NOT a day total.
 *
 * MPS-floor formula: 0.4 × weight_kg per eating event. For a 75 kg user that's
 * exactly 30g (the value commonly cited as a single threshold), but the actual
 * literature scales by body mass — a 60 kg user's MPS floor is ~24g, a 90 kg
 * user's is ~36g. Pass `weightKg` to use the personalised floor; omit it for
 * the legacy 30g default.
 *
 * No upper cap: >~0.55 g/kg per meal isn't incrementally better, not harmful.
 */
import React from "react";

// The rule itself (0.4 g/kg floor, 0.55 g/kg plenty, fixed grams without a weight) is
// macro-engine-core's meal-protein, shared with the app.
import { mealProteinLevel, mealProteinThresholds, type MealProteinLevel } from "macro-engine-core";

export type PerMealProteinLevel = MealProteinLevel;

export function perMealProteinLevel(g: number, weightKg?: number | null): PerMealProteinLevel {
  return mealProteinLevel(g, weightKg);
}

export function ProteinQualityPill({ grams, weightKg }: { grams: number; weightKg?: number | null }) {
  const level = perMealProteinLevel(grams, weightKg);
  if (level === "green" || level === "plenty") return null;
  const cls =
    level === "red"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : level === "amber"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  const label =
    level === "red"
      ? "low protein"
      : level === "amber"
        ? "below MPS"
        : "near MPS";
  // The floor the pill is judged against (0.4 g/kg, or 30 g without a weight).
  const mpsFloor = mealProteinThresholds(weightKg).yellow;
  return (
    <span
      className={`text-[9px] ml-1.5 px-1 py-[1px] rounded border ${cls} tabular-nums`}
      title={`Per-meal protein: ${Math.round(grams)}g. MPS optimum is ≥${mpsFloor}g per eating event (0.4 × weight_kg, Schoenfeld & Aragon 2018; Trommelen 2023).`}
    >
      {label}
    </span>
  );
}
