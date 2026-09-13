import { describe, it, expect, vi } from "vitest";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mockSql }));

import { GET } from "./route";

const missing = Object.assign(new Error('relation "preset_meals" does not exist'), { code: "42P01" });

describe("GET /api/nutrition/presets", () => {
  it("answers an empty catalog with 200 when the nutrition tables are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSql.mockRejectedValue(missing);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ presets: [], ingredients: [] });
    warn.mockRestore();
  });

  it("does not swallow other database errors", async () => {
    mockSql.mockRejectedValue(new Error("boom"));
    await expect(GET()).rejects.toThrow("boom");
  });
});
