import { describe, it, expect } from "vitest";
import { toPath, athleteToday, getStaleDates, lateWeighInDates } from "./garmin-ingest";
import { buildRequest, DAILY_ENDPOINTS } from "garmin-auth/endpoints";
import type { QueryFn } from "./db";

describe("toPath — connectapi query serialization", () => {
  it("appends params as a query string, no params → bare url", () => {
    expect(toPath({ url: "/x/y", params: null })).toBe("/x/y");
    expect(toPath(buildRequest(DAILY_ENDPOINTS.heart_rates, { display: "U", cdate: "2026-07-13" })))
      .toBe("/wellness-service/wellness/dailyHeartRate/U?date=2026-07-13");
    expect(toPath(buildRequest(DAILY_ENDPOINTS.sleep_data, { display: "U", cdate: "2026-07-13" })))
      .toBe("/wellness-service/wellness/dailySleepData/U?date=2026-07-13&nonSleepBufferMinutes=60");
  });
});

describe("athleteToday, his date in his zone (was misnamed todayNyc)", () => {
  it("returns YYYY-MM-DD in the athlete's timezone, Athens by default (soma#872)", () => {
    // 2026-07-12 21:30 UTC is already 2026-07-13 in Athens (EEST, +3); New York would still say the 12th.
    expect(athleteToday(new Date("2026-07-12T21:30:00Z"))).toBe("2026-07-13");
    expect(athleteToday(new Date("2026-07-13T12:00:00Z"))).toBe("2026-07-13");
  });
});

// Minimal mock QueryFn: routes by the SQL text of the first template chunk.
function mockSql(hrRows: unknown[], partialRows: unknown[]): QueryFn {
  return ((strings: TemplateStringsArray) => {
    const sql = strings.join(" ");
    if (sql.includes("heartRateValues")) return Promise.resolve(hrRows);
    if (sql.includes("daily_health_summary")) return Promise.resolve(partialRows);
    return Promise.resolve([]);
  }) as unknown as QueryFn;
}

describe("getStaleDates", () => {
  const now = new Date("2026-07-13T12:00:00Z"); // NY: 2026-07-13

  it("always includes today", async () => {
    const dates = await getStaleDates(mockSql([], []), 14, now);
    expect(dates).toContain("2026-07-13");
  });

  it("with a recent complete HR day, re-syncs days AFTER it (not the complete day itself)", async () => {
    // complete day 2026-07-11, today 07-13 → days_back=2 → adds 07-13, 07-12 (Python range(2)).
    // The complete day 07-11 is NOT re-synced.
    const dates = await getStaleDates(mockSql([{ date: "2026-07-11", pts: 700 }], []), 14, now);
    expect(dates).toEqual(expect.arrayContaining(["2026-07-12", "2026-07-13"]));
    expect(dates).not.toContain("2026-07-11");
    expect(dates).not.toContain("2026-07-01");
  });

  it("with no complete HR day, includes the whole lookback window", async () => {
    const dates = await getStaleDates(mockSql([{ date: "2026-07-12", pts: 100 }], []), 14, now);
    expect(dates.length).toBeGreaterThanOrEqual(14);
  });

  it("folds in partial-health-summary dates", async () => {
    const dates = await getStaleDates(mockSql([{ date: "2026-07-12", pts: 700 }], [{ date: "2026-07-09" }]), 14, now);
    expect(dates).toContain("2026-07-09");
  });

  it("returns dates sorted descending", async () => {
    const dates = await getStaleDates(mockSql([{ date: "2026-07-11", pts: 700 }], []), 14, now);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});

/**
 * ⛔ TWO CLOCKS IN ONE FUNCTION (soma#1123). `getStaleDates` took "today" from his zone in TypeScript
 * and measured its windows from `CURRENT_DATE`, which is New York's. Just after his midnight they
 * disagree by a day. The windows must be measured from the same date the function calls today.
 */
describe("getStaleDates measures its windows from HIS date, not the database's", () => {
  // 00:30 on 2 October in Athens is still 1 October in New York.
  const justAfterHisMidnight = new Date("2026-10-01T21:30:00Z");

  it("hands his date to every query that has a window", async () => {
    const seen: Array<{ text: string; values: unknown[] }> = [];
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      seen.push({ text: strings.join("?"), values });
      return Promise.resolve([]);
    }) as unknown as QueryFn;
    const dates = await getStaleDates(sql, 14, justAfterHisMidnight);
    expect(dates).toContain("2026-10-02");
    const windowed = seen.filter((q) => q.text.includes("::date"));
    expect(windowed.length).toBeGreaterThanOrEqual(2);
    for (const q of windowed) {
      expect(q.text).not.toMatch(/CURRENT_DATE/i);
      expect(q.values).toContain("2026-10-02");
      expect(q.values).not.toContain("2026-10-01");
    }
  });
});

/**
 * ⛔ A WEIGH-IN THAT REACHES GARMIN LATE WAS NEVER COLLECTED. `getStaleDates` re-fetches a day only while
 * its heart rate is incomplete or its health summary looks partial, so a weigh-in typed into Garmin the
 * next evening, after the day was already complete, was never picked up. One range call says which days
 * Garmin holds a weigh-in; any of those soma has no row for gets fetched again.
 */
describe("lateWeighInDates", () => {
  const range = (dates: string[]) => ({
    dailyWeightSummaries: dates.map((d) => ({ summaryDate: d, allWeightMetrics: [{ calendarDate: d, weight: 74500 }] })),
  });

  it("names a day Garmin has a weigh-in for and soma does not", () => {
    expect(lateWeighInDates(range(["2026-09-28", "2026-09-24"]), ["2026-09-24"])).toEqual(["2026-09-28"]);
  });

  it("names nothing when soma already holds every day", () => {
    expect(lateWeighInDates(range(["2026-09-28", "2026-09-24"]), ["2026-09-24", "2026-09-28"])).toEqual([]);
  });

  it("ignores a day whose summary has no samples in it", () => {
    const r = { dailyWeightSummaries: [{ summaryDate: "2026-09-28", allWeightMetrics: [] }] };
    expect(lateWeighInDates(r, [])).toEqual([]);
  });

  it("copes with an empty or unexpected answer instead of throwing", () => {
    expect(lateWeighInDates({}, [])).toEqual([]);
    expect(lateWeighInDates(null, [])).toEqual([]);
    expect(lateWeighInDates({ dailyWeightSummaries: "nope" }, [])).toEqual([]);
  });

  it("takes the sample's own date when the summary has none", () => {
    const r = { dailyWeightSummaries: [{ allWeightMetrics: [{ calendarDate: "2026-09-21" }] }] };
    expect(lateWeighInDates(r, [])).toEqual(["2026-09-21"]);
  });
});
