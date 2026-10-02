// Re-export from macro-engine-core (meal-fast-path), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type CatalogEntry,
  fastParse,
} from "macro-engine-core";
