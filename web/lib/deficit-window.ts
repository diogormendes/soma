// Re-export from macro-engine-core (deficit-window), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type WindowDay,
  type DeficitWindow,
  countsForDeficit,
  deficitWindow,
  windowLabel,
} from "macro-engine-core";
