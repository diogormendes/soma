import { describe, it, expect, vi } from "vitest";
import { DEFAULT_SSO_WORKER_URL } from "garmin-auth";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { CF_WORKER_URL } from "./credentials-dialog";

// #1161: the browser sign-in posted its ticket to a worker that had been
// deleted, so every attempt ended in "Network error". It must use the shared
// worker that garmin-auth itself points at.
describe("Garmin browser sign-in", () => {
  it("exchanges the ticket on the shared SSO worker", () => {
    expect(CF_WORKER_URL).toBe(`${DEFAULT_SSO_WORKER_URL}/exchange`);
  });
});
