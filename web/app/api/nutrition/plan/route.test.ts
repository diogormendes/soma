import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mockSql }));

import { GET } from "./route";

const missing = Object.assign(new Error('relation "nutrition_day" does not exist'), { code: "42P01" });

function req(date: string): NextRequest {
  return new NextRequest(`http://localhost/api/nutrition/plan?date=${date}`);
}

describe("GET /api/nutrition/plan", () => {
  it("answers an empty day with 200 when the nutrition tables are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSql.mockRejectedValue(missing);
    const res = await GET(req("2026-09-05"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBeNull();
    expect(body.meals).toEqual([]);
    expect(body.drinks).toEqual([]);
    expect(body.consumed).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    expect(body.remaining).toBeNull();
    expect(body.slotBudgets).toEqual({});
    expect(body.skippedSlots).toEqual([]);
    expect(body.adaptive).toBeNull();
    expect(body.engagement).toBeNull();
    expect(body.weightTrend).toBeNull();
    // The web dashboard reads plan.status; a null plan must read as an open day.
    expect(body.plan?.status).toBeUndefined();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it("logs the missing relation once per process, not per request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSql.mockRejectedValue(missing);
    await GET(req("2026-09-05"));
    await GET(req("2026-09-06"));
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it("does not swallow other database errors", async () => {
    mockSql.mockRejectedValue(new Error("boom"));
    await expect(GET(req("2026-09-05"))).rejects.toThrow("boom");
  });
});
