"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer } from "lucide-react";
import { paceForZone, timeFromVdot } from "banister";

// Daniels/Gilbert VDOT equations from banister (vdot), the training engine's single source.

/** A zone's pace in sec/km as [fast, slow]; a single-pace zone gives the same number twice. */
function zonePace(vdot: number, zone: string): [number, number] {
  const p = paceForZone(vdot, zone);
  return Array.isArray(p) ? [Math.round(p[0]), Math.round(p[1])] : [Math.round(p), Math.round(p)];
}

/** Format seconds to M:SS pace string. */
function fmtPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format total seconds to H:MM or M:SS time string. */
function fmtTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ZonePace {
  zone: string;
  label: string;
  pace: string;
}

interface GoalPace {
  tier: string;
  time: string;
  pace: string;
}

function computeZonePaces(vdot: number): ZonePace[] {
  const zones: { key: string; zone: string; label: string }[] = [
    { key: "easy", zone: "E", label: "Easy" },
    { key: "marathon", zone: "M", label: "Marathon" },
    { key: "threshold", zone: "T", label: "Threshold" },
    { key: "interval", zone: "I", label: "Interval" },
    { key: "repetition", zone: "R", label: "Repetition" },
  ];

  return zones.map(({ key, zone, label }) => {
    const [fast, slow] = zonePace(vdot, key);
    const pace = fast === slow ? fmtPace(fast) : `${fmtPace(fast)}\u2013${fmtPace(slow)}`;
    return { zone, label, pace };
  });
}

function computeGoalPaces(vdot: number): GoalPace[] {
  // A goal = threshold pace
  const [tPace] = zonePace(vdot, "threshold");

  // B goal = predicted HM pace
  const hmTime = timeFromVdot(vdot, 21097.5);
  const hmPace = Math.round(hmTime / 21.0975);

  // C goal = B * 1.03 (conservative)
  const cPace = Math.round(hmPace * 1.03);

  return [
    { tier: "A", time: fmtTime(hmTime * (tPace / hmPace)), pace: `${fmtPace(tPace)}/km` },
    { tier: "B", time: fmtTime(hmTime), pace: `${fmtPace(hmPace)}/km` },
    { tier: "C", time: fmtTime(hmTime * 1.03), pace: `${fmtPace(cPace)}/km` },
  ];
}

const zoneColors: Record<string, string> = {
  E: "oklch(62% 0.17 142)",
  M: "oklch(65% 0.15 250)",
  T: "oklch(80% 0.18 87)",
  I: "oklch(65% 0.2 25)",
  R: "oklch(60% 0.22 25)",
};

export function TrainingPacesCard({ vdot = 47 }: { vdot?: number }) {
  const zonePaces = useMemo(() => computeZonePaces(vdot), [vdot]);
  const goalPaces = useMemo(() => computeGoalPaces(vdot), [vdot]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Timer className="h-4 w-4" style={{ color: "oklch(65% 0.15 250)" }} />
          Training Paces
          <span className="text-[10px] text-muted-foreground/60 ml-auto">VDOT {vdot.toFixed(1)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          {zonePaces.map((p) => (
            <div key={p.zone} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white"
                  style={{ backgroundColor: zoneColors[p.zone] }}
                >
                  {p.zone}
                </span>
                <span className="text-muted-foreground">{p.label}</span>
              </div>
              <span className="font-mono tabular-nums">{p.pace}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 pt-2">
          <div className="text-[10px] text-muted-foreground mb-1">HM Goal Paces</div>
          <div className="flex gap-3">
            {goalPaces.map((g) => (
              <div key={g.tier} className="text-center">
                <div className="text-[10px] text-muted-foreground">
                  {g.tier} ({g.time})
                </div>
                <div className="text-xs font-mono font-medium">{g.pace}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
