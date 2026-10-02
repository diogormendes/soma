// Re-export from macro-engine-core (coverage), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type Slot,
  ALL_SLOTS,
  COVERAGE_FLOOR,
  STREAK_MAX_GAP_DAYS,
  slotCoverage,
  meetsCoverageFloor,
  daysBetween,
} from "macro-engine-core";
