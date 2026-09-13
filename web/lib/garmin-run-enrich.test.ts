import { describe, it, expect } from "vitest";
import { generateRunStravaDescription } from "./garmin-run-enrich";
import golden from "./garmin-run-enrich.golden.json";
import type { RunSummary, RunHrZone } from "./garmin-run-enrich";

const g = golden as Array<{ in: { summary: RunSummary; hr_zones: RunHrZone[] | null }; desc: string }>;

describe("garmin run enrichment — Python parity", () => {
  it("generateRunStravaDescription matches Python (stats, zones, footer, empty)", () => {
    for (const c of g) {
      expect(generateRunStravaDescription(c.in.summary, c.in.hr_zones)).toBe(c.desc);
    }
  });
});
