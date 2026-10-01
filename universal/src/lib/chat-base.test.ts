import { describe, it, expect } from "vitest";
import { chatBaseFrom, chatTransportFor } from "./chat-base";

const MOUNT = "https://gkos-mac.taile2630d.ts.net:8448";

describe("the app reaches the chat where the website does (soma#1136)", () => {
  it("⛔ uses the tailnet mount when configured, not the Vercel API host that answers 410", () => {
    expect(chatBaseFrom(MOUNT, "https://soma.gkos.dev")).toBe(MOUNT);
  });

  it("drops a trailing slash so paths join cleanly", () => {
    expect(chatBaseFrom(`${MOUNT}/`, "https://soma.gkos.dev")).toBe(MOUNT);
  });

  it("falls back to the API host when nothing is configured, which is a local dev server", () => {
    expect(chatBaseFrom(undefined, "http://localhost:3456/")).toBe("http://localhost:3456");
    expect(chatBaseFrom("  ", "http://localhost:3456")).toBe("http://localhost:3456");
  });

  it("labels the transport by where it actually goes", () => {
    expect(chatTransportFor(MOUNT, "https://soma.gkos.dev")).toBe("tailnet");
    expect(chatTransportFor(undefined, "http://localhost:3456")).toBe("local");
    expect(chatTransportFor(undefined, "http://10.0.2.2:3456")).toBe("local");
    expect(chatTransportFor(undefined, "https://soma.gkos.dev")).toBe("proxy");
  });
});
