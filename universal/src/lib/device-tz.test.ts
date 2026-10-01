import { describe, expect, it } from "vitest";
import { TZ_HEADER_NAME, withDeviceTz } from "./device-tz";

/**
 * ⛔ The app's requests carried only `Authorization`, so the server never learned the phone's zone and
 * every app screen fell back to Athens (soma#1125). The zone now rides on the shared headers object as
 * a getter, read afresh on every request.
 */
describe("withDeviceTz", () => {
  it("adds the zone to every spread of the shared headers", () => {
    const h = withDeviceTz({ Authorization: "Bearer x" }, () => "Asia/Tokyo");
    expect({ ...h }).toEqual({ Authorization: "Bearer x", [TZ_HEADER_NAME]: "Asia/Tokyo" });
  });

  it("⛔ reads the zone afresh on each request, so a flight is picked up without restarting", () => {
    let zone = "Europe/Athens";
    const h = withDeviceTz({} as Record<string, string>, () => zone);
    expect({ ...h }[TZ_HEADER_NAME]).toBe("Europe/Athens");
    zone = "America/New_York";
    expect({ ...h }[TZ_HEADER_NAME]).toBe("America/New_York");
  });

  it("is sent when the object is handed to fetch directly, not only when spread", () => {
    const h = withDeviceTz({ Authorization: "Bearer x" }, () => "Asia/Tokyo");
    expect(new Headers(h).get("x-soma-tz")).toBe("Asia/Tokyo");
  });

  it("leaves later Authorization changes working, which sign-in relies on", () => {
    const h = withDeviceTz({} as Record<string, string>, () => "Asia/Tokyo");
    h.Authorization = "Bearer y";
    expect({ ...h }).toEqual({ [TZ_HEADER_NAME]: "Asia/Tokyo", Authorization: "Bearer y" });
    delete h.Authorization;
    expect({ ...h }).toEqual({ [TZ_HEADER_NAME]: "Asia/Tokyo" });
  });

  it("names the header the server reads", () => {
    expect(TZ_HEADER_NAME.toLowerCase()).toBe("x-soma-tz");
  });
});
