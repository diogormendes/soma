import { describe, it, expect, vi } from "vitest";

// Only the network call is replaced; generateFit runs for real, so the FIT is the one soma would send.
const uploadFit = vi.fn();
vi.mock("hevy2garmin", async (importOriginal) => {
  const real = await importOriginal<typeof import("hevy2garmin")>();
  return { ...real, uploadFit: (...a: unknown[]) => uploadFit(...a), renameActivity: vi.fn() };
});

import { GarminUploadRejected } from "hevy2garmin";
import { MAX_REJECTED_TRIES, processWorkout, rejectionLogStatus, type UploadCandidate } from "./hevy-upload";

const candidate: UploadCandidate = {
  hevyId: "h-1",
  hevyTitle: "Push",
  workout: {
    title: "Push",
    start_time: "2026-09-30T16:00:00+00:00",
    end_time: "2026-09-30T17:00:00+00:00",
    exercises: [{ title: "Bench Press (Barbell)", sets: [{ type: "normal", weight_kg: 60, reps: 8 }] }],
  },
  hrSamples: [],
  hrSource: "none",
  workoutDate: "2026-09-30",
  strengthLoad: null,
};
const client = {} as Parameters<typeof processWorkout>[0];

describe("a workout Garmin refuses (hevy2garmin 0.9)", () => {
  // No reset hook: in vitest 4 a reset or clear hook plus a mock that throws fails the test on the
  // caught rejection itself. Each test sets its own implementation instead.
  it("⛔ is reported as rejected, not as uploaded", async () => {
    uploadFit.mockImplementation(async () => {
      throw new GarminUploadRejected("Garmin rejected upload: duplicate");
    });
    const out = await processWorkout(client, candidate);
    expect(out.status).toBe("rejected");
    expect(out.error).toContain("duplicate");
  });

  it("keeps any other failure an error, which is retried on every run as before", async () => {
    uploadFit.mockImplementation(async () => {
      throw new Error("Garmin upload failed (503)");
    });
    expect((await processWorkout(client, candidate)).status).toBe("error");
  });

  it("still reports a real upload as uploaded", async () => {
    uploadFit.mockResolvedValue({ activityId: 123 });
    expect(await processWorkout(client, candidate)).toEqual({ hevyId: "h-1", status: "uploaded", activityId: 123 });
  });
});

describe("how many tries a refused workout gets", () => {
  it("retries on the next runs and gives up on the third refusal", () => {
    expect(MAX_REJECTED_TRIES).toBe(3);
    expect(rejectionLogStatus(0)).toBe("retry");
    expect(rejectionLogStatus(1)).toBe("retry");
    expect(rejectionLogStatus(2)).toBe("rejected");
  });
});
