// Re-export from macro-engine-core (energy-reconcile), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type DayIn,
  type DaySource,
  type DayOut,
  KCAL_PER_KG,
  reconcile,
} from "macro-engine-core";
