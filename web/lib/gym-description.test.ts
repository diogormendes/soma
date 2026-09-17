import { describe, it, expect } from "vitest";
import {
  formatWeight,
  formatDuration,
  computePrs,
  generateGymDescription,
  type PrInfo,
} from "./gym-description";
import { synthesizeExerciseSets, timelineFromSamples } from "./set-timing";
import type { QueryFn } from "./db";
import type { HevyWorkout } from "./hevy-types";
import golden from "./gym-description.golden.json";

/**
 * The fixture that used to cover these two in `bridge/tests/description.golden.json`, moved here
 * with the functions. Its `hr_slices` cases went with `sliceHrByExercise`, whose proportional
 * split `set-timing.ts` replaced.
 */
const g = golden as { weights: { kg: number; out: string }[]; durations: { s: number; out: string }[] };

describe("formatWeight — Python parity (_format_weight)", () => {
  it("matches Python on every golden case", () => {
    for (const c of g.weights) expect(formatWeight(c.kg)).toBe(c.out);
  });
  it("0 is bodyweight", () => expect(formatWeight(0)).toBe("BW"));
  it("a whole number drops the decimal", () => expect(formatWeight(66)).toBe("66kg"));
  it("a whole number after rounding drops it too", () => expect(formatWeight(66.04)).toBe("66kg"));
  it("one decimal is kept", () => expect(formatWeight(2789.6)).toBe("2789.6kg"));
  it("rounds to one place", () => expect(formatWeight(12.34)).toBe("12.3kg"));
});

describe("formatDuration — Python parity (_format_duration)", () => {
  it("matches Python on every golden case", () => {
    for (const c of g.durations) expect(formatDuration(c.s)).toBe(c.out);
  });
  it("under an hour is minutes", () => expect(formatDuration(1920)).toBe("32m"));
  it("an hour or more splits", () => expect(formatDuration(4020)).toBe("1h 7m"));
  it("truncates rather than rounds", () => expect(formatDuration(119)).toBe("1m"));
  it("zero is 0m", () => expect(formatDuration(0)).toBe("0m"));
});

/** One set, spelled out so each test reads as the workout it describes. */
const set = (weight: number, reps: number, extra: Record<string, unknown> = {}) => ({
  type: "normal",
  weight_kg: weight,
  reps,
  ...extra,
});

describe("generateGymDescription", () => {
  const workout: HevyWorkout = {
    id: "w1",
    title: "Lower",
    start_time: "2026-07-10T17:00:00+00:00",
    end_time: "2026-07-10T17:32:00+00:00",
    exercises: [
      {
        title: "Leg Press (Machine)",
        exercise_template_id: "LP",
        sets: [
          set(170, 12, { type: "warmup" }),
          set(210, 12),
          set(240, 12),
        ],
      },
    ],
  };

  it("reproduces the header, both stat lines and the footer", () => {
    const out = generateGymDescription(
      workout,
      { avgHr: 86, maxHr: 97, calories: 139, durationS: 1920 },
      {},
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("🏋️ Lower  —  32m");
    expect(lines[1]).toBe("💪 2 sets  ·  📊 5.4t volume  ·  ❤️ 86 bpm avg");
    expect(lines[2]).toBe("🔥 139 kcal  ·  Max HR: 97 bpm  ·  1 exercises");
    expect(lines.at(-1)).toBe("Tracked by github.com/drkostas/soma");
  });

  it("excludes warmups from the set count and the volume", () => {
    // Two working sets at 210×12 and 240×12 is 5,400 kg. The 170 kg warmup is not volume.
    const out = generateGymDescription(workout, { durationS: 1920 }, {});
    expect(out).toContain("💪 2 sets");
    expect(out).toContain("📊 5.4t volume");
  });

  it("prints every set rather than a summary, so no set can be misrepresented", () => {
    // hevy2garmin takes max(weight) and max(reps) independently and would render the pair
    // below as `60.0kg × 15`, a set that was never lifted.
    const mixed: HevyWorkout = {
      title: "Push",
      exercises: [{ title: "Bench", sets: [set(60, 8), set(40, 15)] }],
    };
    const out = generateGymDescription(mixed, {}, {});
    expect(out).toContain("  1. 60kg × 8");
    expect(out).toContain("  2. 40kg × 15");
    expect(out).not.toContain("60kg × 15");
  });

  it("marks warmups, carries RPE, bodyweight, timed sets and notes", () => {
    const w: HevyWorkout = {
      title: "Mixed",
      exercises: [
        {
          title: "Everything",
          notes: "felt heavy",
          sets: [
            set(50, 10, { type: "warmup" }),
            set(0, 12),
            set(80, 5, { rpe: 9 }),
            { type: "normal", weight_kg: 0, reps: 0, duration_seconds: 45.7 },
          ],
        },
      ],
    };
    const out = generateGymDescription(w, {}, {});
    expect(out).toContain("  1. 50kg × 10  (warmup)");
    expect(out).toContain("  2. BW × 12");
    expect(out).toContain("  3. 80kg × 5  @RPE 9");
    expect(out).toContain("  4. 45s");
    expect(out).toContain("  📝 felt heavy");
  });

  it("renders a set with nothing on it as an em dash rather than 0kg", () => {
    const w: HevyWorkout = { title: "T", exercises: [{ title: "E", sets: [{ type: "normal" }] }] };
    expect(generateGymDescription(w, {}, {})).toContain("  1. —");
  });

  it("quotes the workout's own note under the header", () => {
    const w: HevyWorkout = { ...workout, description: "back at it" };
    expect(generateGymDescription(w, { durationS: 1920 }, {}).split("\n")[1]).toBe('"back at it"');
  });

  it("falls back to the Hevy timestamps when the enrichment has no duration", () => {
    expect(generateGymDescription(workout, {}, {})).toContain("🏋️ Lower  —  32m");
  });

  it("omits a stat line entirely rather than printing an empty one", () => {
    const out = generateGymDescription({ title: "Bare", exercises: [] }, {}, {});
    expect(out.split("\n")[0]).toBe("🏋️ Bare  —  0m");
    // No sets, no volume, no HR: the first stat line has nothing to say and is absent.
    expect(out).not.toContain("💪");
    expect(out).not.toContain("  ·  ");
  });

  it("prints the PR flags, and first-time instead of them", () => {
    const prs: Record<string, PrInfo> = {
      LP: {
        isNew: false,
        weightPr: { next: 240, prev: 220 },
        volumePr: null,
        setPr: { next: 2880, prev: 2789.6 },
      },
    };
    const out = generateGymDescription(workout, { durationS: 1920 }, prs);
    expect(out).toContain("  🏆 Weight PR: 240kg (prev: 220kg)");
    expect(out).toContain("  ⚡ Set PR: 2880kg (prev: 2789.6kg)");

    const fresh: Record<string, PrInfo> = {
      LP: { isNew: true, weightPr: null, volumePr: null, setPr: null },
    };
    const firstTime = generateGymDescription(workout, { durationS: 1920 }, fresh);
    expect(firstTime).toContain("  🆕 First time!");
    expect(firstTime).not.toContain("🏆");
  });

  it("reads per-exercise heart rate off the sets synthesizeExerciseSets wrote", () => {
    const w: HevyWorkout = JSON.parse(JSON.stringify(workout));
    const timeline = timelineFromSamples([80, 90, 100], 1920);
    synthesizeExerciseSets(timeline, w);
    const out = generateGymDescription(w, { durationS: 1920 }, {});
    expect(out).toMatch(/Leg Press \(Machine\) {2}❤️ \d+ bpm/);
  });

  it("omits per-exercise heart rate when nothing wrote it", () => {
    const out = generateGymDescription(workout, { durationS: 1920 }, {});
    expect(out).toContain("Leg Press (Machine)\n");
    expect(out).not.toContain("Leg Press (Machine)  ❤️");
  });
});

/**
 * A stand-in for the tagged-template query. `computePrs` runs one of two statements and reads
 * only `exercises` off each row, so the double returns the history it is given.
 */
function historySql(rows: unknown[]): QueryFn {
  return ((_strings: TemplateStringsArray) => Promise.resolve(rows)) as unknown as QueryFn;
}

describe("computePrs — Python parity (compute_prs)", () => {
  const exercises = [
    { title: "Leg Press", exercise_template_id: "LP", sets: [set(240, 12), set(210, 12)] },
  ];

  it("flags an exercise with no history as first time and computes no records for it", async () => {
    const prs = await computePrs(historySql([]), "w2", exercises, "2026-07-10T17:00:00Z");
    expect(prs.LP).toEqual({ isNew: true, weightPr: null, volumePr: null, setPr: null });
  });

  it("beats the previous heaviest set, best session volume and best single set", async () => {
    const history = [
      { exercises: [{ exercise_template_id: "LP", sets: [set(220, 12), set(200, 11)] }] },
    ];
    const prs = await computePrs(historySql(history), "w2", exercises, "2026-07-10T17:00:00Z");
    expect(prs.LP.isNew).toBe(false);
    expect(prs.LP.weightPr).toEqual({ next: 240, prev: 220 });
    // 240×12 + 210×12 = 5,400 against 220×12 + 200×11 = 4,840.
    expect(prs.LP.volumePr).toEqual({ next: 5400, prev: 4840 });
    expect(prs.LP.setPr).toEqual({ next: 2880, prev: 2640 });
  });

  it("reports no record when the history already holds a better one", async () => {
    const history = [
      { exercises: [{ exercise_template_id: "LP", sets: [set(250, 12), set(250, 12)] }] },
    ];
    const prs = await computePrs(historySql(history), "w2", exercises, "2026-07-10T17:00:00Z");
    expect(prs.LP.weightPr).toBeNull();
    expect(prs.LP.volumePr).toBeNull();
    expect(prs.LP.setPr).toBeNull();
  });

  it("ignores warmup sets on both sides", async () => {
    const history = [
      { exercises: [{ exercise_template_id: "LP", sets: [set(300, 12, { type: "warmup" })] }] },
    ];
    const prs = await computePrs(historySql(history), "w2", exercises, "2026-07-10T17:00:00Z");
    // The 300 kg warmup is not a record, so 240 kg still beats the (absent) previous best.
    expect(prs.LP.weightPr).toEqual({ next: 240, prev: 0 });
  });

  it("reads history rows that arrive as a JSON string, as the gateway hands them back", async () => {
    const history = [
      { exercises: JSON.stringify([{ exercise_template_id: "LP", sets: [set(220, 12)] }]) },
    ];
    const prs = await computePrs(historySql(history), "w2", exercises, "2026-07-10T17:00:00Z");
    expect(prs.LP.weightPr).toEqual({ next: 240, prev: 220 });
  });

  it("returns nothing when no exercise carries a template id, without querying", async () => {
    const threw = (() => {
      throw new Error("computePrs must not query when there is nothing to look up");
    }) as unknown as QueryFn;
    expect(await computePrs(threw, "w2", [{ title: "Custom", sets: [set(10, 10)] }], null)).toEqual({});
  });
});
