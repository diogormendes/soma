import { describe, it, expect } from "vitest";
import { findMissed, type GarminActivitySummary } from "../src/dedup";

/**
 * The bridge's never-duplicate contract, after soma#971 found that one of its
 * two guards had been dead since the Strava API ingest was retired.
 *
 * What is left is the ledger, so the ledger has to be right about the one case
 * it used to miss: the window between the FIT reaching Garmin and Strava
 * confirming the new activity. That poll waits up to twelve minutes, and a
 * crash inside it left Strava with the workout and the ledger without it.
 */

const act = (id: number, name = "Workout"): GarminActivitySummary => ({ activityId: id, activityName: name });

describe("the ledger is the live guard", () => {
  it("excludes an activity that is merely claimed, before any Strava id exists", () => {
    // A claimed row has a null strava_activity_id, and the ledger read that
    // feeds this only asks which ids are present. That is what closes the
    // crash window: the next run already treats it as taken.
    const claimedOnly = new Set([200]);
    expect(findMissed([act(100), act(200)], claimedOnly, "").map((a) => a.activityId)).toEqual([100]);
  });

  it("offers an activity again once its claim is released", () => {
    // An upload that threw, or a forward that never arrived, releases the claim
    // so the workout stays retryable. Keeping it would be worse than the
    // duplicate the claim prevents: the workout would never reach Strava.
    expect(findMissed([act(100), act(200)], new Set(), "").map((a) => a.activityId)).toEqual([100, 200]);
  });
});

describe("the external-id filter is history, not a second opinion", () => {
  it("still excludes anything forwarded before the Strava ingest was retired", () => {
    // Worth keeping: it costs one query and protects the old forwards if the
    // ledger is ever rebuilt.
    expect(findMissed([act(23395066622)], new Set(), "23395066622_ACTIVITY.fit")).toEqual([]);
  });

  it("cannot see a recent activity, which is why the comment had to change", () => {
    // strava_raw_data stopped being written on 2026-06-30. A September activity
    // is invisible to it, so a ledger miss is a duplicate, with nothing behind
    // it. This test exists to stop anyone reading that filter as live cover.
    const septemberActivity = act(24360411253);
    const staleExternalIds = "23395066622_ACTIVITY.fit d4238c1f-0e94-422c-aa0c-5b7fa75ba3f6.fit";
    expect(findMissed([septemberActivity], new Set(), staleExternalIds)).toEqual([septemberActivity]);
  });
});
