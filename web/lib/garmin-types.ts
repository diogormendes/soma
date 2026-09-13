/**
 * The parts of a Garmin activity payload the web reads. Garmin's JSON has far more; these are
 * the fields the activity routes and the share image touch, named instead of reached through
 * `any` (soma#958).
 */
export interface GarminActivitySummary {
  activityName?: string;
  activityType?: { typeKey?: string };
  locationName?: string;
  startTimeLocal?: string;
  distance?: number;
  duration?: number;
  movingDuration?: number;
  elevationGain?: number;
  calories?: number;
  averageHR?: number;
  maxHR?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  averageRunningCadenceInStepsPerMinute?: number;
  aerobicTrainingEffect?: number;
  vO2MaxValue?: number;
  elevationLoss?: number;
  avgStrideLength?: number;
  avgGroundContactTime?: number;
  avgVerticalOscillation?: number;
  avgVerticalRatio?: number;
  minTemperature?: number;
  maxTemperature?: number;
  waterEstimated?: number;
  anaerobicTrainingEffect?: number;
  averagePower?: number;
  [key: string]: unknown;
}

/** One heart-rate zone row of the zones endpoint. */
export interface GarminHrZone {
  zoneNumber?: number;
  secsInZone?: number;
  zoneLowBoundary?: number;
  [key: string]: unknown;
}

/** One jump of the kite extraction (lib/kite-jumps writes these). */
export interface KiteJump {
  height_m?: number;
  trajectory_m?: number[];
  path?: Array<[number, number, number]>;
  airtime_s?: number;
  takeoff_ts?: number;
  landing_ts?: number;
  rank?: number;
  distance_m?: number;
  lat?: number | null;
  lng?: number | null;
  [key: string]: unknown;
}

/** One lap of an activity's splits. */
export interface GarminLap {
  distance?: number;
  averageRunCadence?: number;
  duration?: number;
  movingDuration?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  averageHR?: number;
  maxHR?: number;
  elevationGain?: number;
  [key: string]: unknown;
}

/** One gear entry (shoes, board) attached to an activity. */
export interface GarminGear {
  gearTypeName?: string;
  displayName?: string;
  customMakeModel?: string;
  maximumMeters?: number;
  gearStatusName?: string;
  [key: string]: unknown;
}
