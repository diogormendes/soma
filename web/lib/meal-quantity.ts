// Re-export from macro-engine-core (meal-quantity), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type Quantity,
  type ResolvableItem,
  type ResolvedItem,
  type WeighMethod,
  type ResolveInput,
  type ResolveResult,
  BITE_FRACTION,
  BITE_DEFAULT_G,
  resolveQuantities,
} from "macro-engine-core";
