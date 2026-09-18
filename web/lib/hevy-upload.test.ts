import { describe, it, expect } from "vitest";
import { trainingLoadForUpload, trainingLoadScale, GARMIN_LOAD_SCALE } from "./hevy-upload";

describe("trainingLoadForUpload", () => {
  it("scales the sRPE load onto Garmin's scale (soma#991)", () => {
    // banister's session load for a gym workout is sRPE: session RPE x minutes, which
    // runs 382 to 1954 for these sessions. Garmin's own load for a run runs 59 to 416.
    // Writing the raw number would put one gym session above every run ever recorded.
    expect(trainingLoadForUpload({ load_value: 476.9 }, {})).toBe(100); // the gym median lands on the run median
    expect(trainingLoadForUpload({ load_value: 1954.3 }, {})).toBe(410); // the hardest session lands near the hardest run
  });

  it("takes the scale from the environment, and 0 turns the write off", () => {
    expect(trainingLoadForUpload({ load_value: 400 }, { HEVY2GARMIN_TRAINING_LOAD_SCALE: "0.5" })).toBe(200);
    expect(trainingLoadForUpload({ load_value: 400 }, { HEVY2GARMIN_TRAINING_LOAD_SCALE: "0" })).toBeUndefined();
  });

  it("falls back to the default scale rather than writing nonsense", () => {
    expect(trainingLoadScale({})).toBe(GARMIN_LOAD_SCALE);
    expect(trainingLoadScale({ HEVY2GARMIN_TRAINING_LOAD_SCALE: "" })).toBe(GARMIN_LOAD_SCALE);
    expect(trainingLoadScale({ HEVY2GARMIN_TRAINING_LOAD_SCALE: "banana" })).toBe(GARMIN_LOAD_SCALE);
    expect(trainingLoadScale({ HEVY2GARMIN_TRAINING_LOAD_SCALE: "-2" })).toBe(GARMIN_LOAD_SCALE);
  });

  it("never writes a zero or missing load", () => {
    expect(trainingLoadForUpload(null, {})).toBeUndefined();
    expect(trainingLoadForUpload(undefined, {})).toBeUndefined();
    expect(trainingLoadForUpload({ load_value: 0 }, {})).toBeUndefined();
    // a load small enough to round to zero is not a load Garmin should be told about
    expect(trainingLoadForUpload({ load_value: 2 }, {})).toBeUndefined();
  });
});
