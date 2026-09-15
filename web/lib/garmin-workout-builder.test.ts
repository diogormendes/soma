import { describe, it, expect } from "vitest";
import { stepsToGarminWorkout } from "./garmin-workout-builder";
import golden from "./garmin-workout-builder.golden.json";
import type { WorkoutStep } from "./plan-generator";

/** One golden case: the plan workout that went in and the Garmin payload Python produced. */
interface GoldenCase {
  day_index: number;
  name: string;
  steps: WorkoutStep[];
  payload: Record<string, unknown>;
}

const g = golden as unknown as GoldenCase[];

describe("garmin workout builder — Python parity", () => {
  it("stepsToGarminWorkout matches Python for all 30 plan workouts (incl. repeat groups)", () => {
    for (const c of g) {
      const payload = stepsToGarminWorkout(c.name, c.steps);
      expect(payload).toEqual(c.payload);
    }
  });

  it("produces at least one RepeatGroupDTO across the plan", () => {
    const hasRepeat = g.some((c) => {
      const payload = stepsToGarminWorkout(c.name, c.steps) as {
        workoutSegments: { workoutSteps: { type?: string }[] }[];
      };
      return payload.workoutSegments[0].workoutSteps.some((s) => s.type === "RepeatGroupDTO");
    });
    expect(hasRepeat).toBe(true);
  });
});
