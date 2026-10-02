// Re-export from macro-engine-core (adherence), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type AdherenceStatus,
  type Adherence,
  ADHERENCE_TOLERANCE,
  computeWeeklyAdherence,
} from "macro-engine-core";
