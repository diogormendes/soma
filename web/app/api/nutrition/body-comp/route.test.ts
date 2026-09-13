import { describe, it, expect, vi } from "vitest";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mockSql }));

import { GET } from "./route";

const missing = Object.assign(new Error('relation "nutrition_profile" does not exist'), { code: "42P01" });

describe("GET /api/nutrition/body-comp", () => {
  it("answers an empty trajectory with 200 when the nutrition tables are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSql.mockRejectedValue(missing);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeNull();
    expect(body.weights).toEqual([]);
    expect(body.goalLine).toEqual([]);
    expect(body.trendPrediction).toEqual([]);
    expect(body.calPredicted).toEqual([]);
    expect(body.dailyDeficits).toEqual([]);
    warn.mockRestore();
  });

  it("still answers 404 when the tables exist but there is no profile", async () => {
    mockSql.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("does not swallow other database errors", async () => {
    mockSql.mockRejectedValue(new Error("boom"));
    await expect(GET()).rejects.toThrow("boom");
  });
});
