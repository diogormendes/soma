// Re-export from macro-engine-core (weigh-in), the single source of truth. The reasoning and the
// tests live there; this file keeps soma's import path.
export {
  type WeighIn,
  type Discarded,
  OUTLIER_KG,
  LOCAL_WINDOW_DAYS,
  localMedian,
  flagOutliers,
} from "macro-engine-core";
