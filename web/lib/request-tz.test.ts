import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which zone a request is served in. The app sends a header, a browser sends a cookie, and a job has
 * neither. Before soma#1125 only the cookie was read, so every request from the native app fell back to
 * Athens wherever the phone actually was.
 */
let header: string | null = null;
let cookie: string | undefined;
let outsideRequest = false;

vi.mock("next/headers", () => ({
  headers: async () => {
    if (outsideRequest) throw new Error("headers() was called outside a request scope");
    return new Headers(header === null ? {} : { "x-soma-tz": header });
  },
  cookies: async () => {
    if (outsideRequest) throw new Error("cookies() was called outside a request scope");
    return { get: (name: string) => (name === "soma_tz" && cookie ? { value: cookie } : undefined) };
  },
}));

import { requestTz, TZ_HEADER } from "./request-tz";

describe("requestTz", () => {
  beforeEach(() => { header = null; cookie = undefined; outsideRequest = false; });

  it("⛔ uses the app's header, which is the only thing the native app sends", async () => {
    header = "Asia/Tokyo";
    expect(await requestTz()).toBe("Asia/Tokyo");
  });

  it("prefers the header over a cookie when both are present", async () => {
    header = "Asia/Tokyo"; cookie = "America/New_York";
    expect(await requestTz()).toBe("Asia/Tokyo");
  });

  it("still uses the browser's cookie when there is no header", async () => {
    cookie = "America/New_York";
    expect(await requestTz()).toBe("America/New_York");
  });

  it("falls through a header that is not a real zone instead of failing the request", async () => {
    header = "Mars/Olympus"; cookie = "America/New_York";
    expect(await requestTz()).toBe("America/New_York");
  });

  it("falls through an empty header, which is what a phone without Intl would send", async () => {
    header = "";
    expect(await requestTz()).toBe("Europe/Athens");
  });

  it("uses the fallback outside a request, as the jobs and scripts need", async () => {
    outsideRequest = true;
    expect(await requestTz()).toBe("Europe/Athens");
  });

  it("names the header the app sends", () => {
    expect(TZ_HEADER).toBe("x-soma-tz");
  });
});

/**
 * The app and the server cannot import each other, so the header name lives in both. If they drift the
 * app's header is silently ignored and every app request falls back to Athens again, with no error.
 */
describe("the app sends the header this server reads", () => {
  it("has the same name in universal/src/lib/device-tz.ts", () => {
    const src = readFileSync(new URL("../../universal/src/lib/device-tz.ts", import.meta.url), "utf8");
    const m = src.match(/TZ_HEADER_NAME\s*=\s*"([^"]+)"/);
    expect(m?.[1]?.toLowerCase()).toBe(TZ_HEADER);
  });
});
