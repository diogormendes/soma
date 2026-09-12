"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PlanLifecycle, PlanSummary } from "@/lib/live-plan";

/**
 * The plan's lifecycle on the Training page (soma#926): what state the current
 * plan is in, in plain words; Drop for a plan the athlete is done with; the
 * plans that came before; and New plan on top of the generator.
 */
const STATE_TITLE: Record<PlanSummary["state"], string> = {
  none: "No training plan",
  live: "Plan is live",
  paused: "Plan is paused",
  finished: "Plan finished",
  dropped: "Plan dropped",
};

function fmtDay(iso: string | null): string {
  if (!iso) return "?";
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtGoal(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function stateLine(p: PlanSummary): string {
  const done = `${p.sessionsDone} of ${p.sessionsPlanned} sessions done`;
  switch (p.state) {
    case "live": return `${p.basis} · ${done}`;
    case "paused": return `${p.basis}. The next session brings it back; drop it if you are done with it. ${done}`;
    case "finished": return `Race ${fmtDay(p.raceDate)} · ${done}`;
    case "dropped": return `Dropped ${fmtDay(p.droppedAt)} · race was ${fmtDay(p.raceDate)} · ${done}`;
    default: return "";
  }
}

export function PlanLifecycleCard({ lifecycle, fallbackLabel }: { lifecycle: PlanLifecycle; fallbackLabel: string }) {
  const router = useRouter();
  const { current, past } = lifecycle;
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [busy, setBusy] = useState<"drop" | "create" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [raceDate, setRaceDate] = useState("");
  const [distance, setDistance] = useState("21.1");
  const [goal, setGoal] = useState("1:35:00");
  const [name, setName] = useState("");

  const canDrop = current && (current.state === "live" || current.state === "paused");
  const state = current?.state ?? "none";

  async function drop() {
    if (!current) return;
    setBusy("drop"); setMsg(null);
    const res = await fetch("/api/training/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "drop" }) });
    const j = await res.json().catch(() => ({}));
    setBusy(null); setConfirmDrop(false);
    if (!res.ok) { setMsg(j.error || `Could not drop the plan (${res.status})`); return; }
    setMsg(j.removed > 0 ? `Dropped. ${j.removed} upcoming workout${j.removed === 1 ? "" : "s"} removed from Garmin.` : "Dropped.");
    router.refresh();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const parts = goal.split(":").map(Number);
    const goalSec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : NaN;
    if (!raceDate) { setMsg("Pick the race date."); return; }
    if (!isFinite(goalSec) || goalSec <= 0) { setMsg("Goal time as h:mm:ss."); return; }
    setBusy("create"); setMsg(null);
    const res = await fetch("/api/training/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", raceDate, raceDistanceKm: Number(distance) || 21.1, goalTimeSeconds: goalSec, name }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg(j.error || `Could not create the plan (${res.status})`); return; }
    setMsg(`Plan created: ${j.days} days. Its workouts reach the watch with the next sync once the plan is live.`);
    setShowNew(false);
    router.refresh();
  }

  return (
    <Card data-testid="training-plan-lifecycle">
      <CardContent className="py-6 space-y-4">
        <div className="flex items-start gap-4">
          <Target className="h-8 w-8 mt-0.5 text-muted-foreground opacity-50 shrink-0" />
          <div className="space-y-1 min-w-0 flex-1">
            <h2 className="text-[1rem] font-semibold text-foreground" data-testid="training-plan-state" data-state={state}>
              {STATE_TITLE[state]}{current?.name ? ` · ${current.name}` : ""}
            </h2>
            {current && <p className="text-sm text-muted-foreground" data-testid="training-plan-state-line">{stateLine(current)}.</p>}
            {state !== "live" && (
              <p className="text-sm text-muted-foreground">Everything below is from what you actually did. Projections assume {fallbackLabel}.</p>
            )}
            {msg && <p className="text-sm text-foreground" data-testid="training-plan-msg">{msg}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pl-12">
          {canDrop && !confirmDrop && (
            <button type="button" className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted" onClick={() => setConfirmDrop(true)} data-testid="plan-drop">
              Drop this plan
            </button>
          )}
          {canDrop && confirmDrop && (
            <>
              <span className="text-sm text-muted-foreground self-center">
                Drop {current!.name}? {current!.pushedAhead > 0 ? `${current!.pushedAhead} upcoming workout${current!.pushedAhead === 1 ? "" : "s"} come off Garmin.` : "Nothing is on Garmin ahead."} Its history stays.
              </span>
              <button type="button" className="text-sm px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50" disabled={busy === "drop"} onClick={drop} data-testid="plan-drop-confirm">
                {busy === "drop" ? "Dropping…" : "Yes, drop it"}
              </button>
              <button type="button" className="text-sm px-3 py-1.5 rounded-md border border-border" onClick={() => setConfirmDrop(false)}>Keep it</button>
            </>
          )}
          {!showNew && (
            <button type="button" className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted" onClick={() => setShowNew(true)} data-testid="plan-new">
              New plan
            </button>
          )}
        </div>

        {showNew && (
          <form onSubmit={create} className="pl-12 flex flex-wrap items-end gap-3" data-testid="plan-new-form">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">Race date
              <input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground" required />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">Distance (km)
              <input type="number" step="0.1" min="1" value={distance} onChange={(e) => setDistance(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground w-24" />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">Name (optional)
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Half marathon · Oct 18, 2026" className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground w-52" />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">Goal time (h:mm:ss)
              <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground w-28" />
            </label>
            <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50" disabled={busy === "create"} data-testid="plan-new-submit">
              {busy === "create" ? "Creating…" : "Create plan"}
            </button>
            <button type="button" className="text-sm px-3 py-1.5 rounded-md border border-border" onClick={() => setShowNew(false)}>Cancel</button>
            <p className="basis-full text-xs text-muted-foreground">A five-week build to the race from the generator. {current && current.state !== "dropped" && current.state !== "finished" ? `${current.name} becomes a past plan.` : ""}</p>
          </form>
        )}

        {past.length > 0 && (
          <div className="pl-12" data-testid="training-past-plans">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Past plans</h3>
            <ul className="text-sm space-y-1">
              {past.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                  <span className="text-foreground">{p.name ?? `Plan ${p.id}`}</span>
                  <span>{STATE_TITLE[p.state].replace("Plan ", "").toLowerCase()}</span>
                  <span>· race {fmtDay(p.raceDate)}{p.goalTimeSeconds ? ` · goal ${fmtGoal(p.goalTimeSeconds)}` : ""}</span>
                  <span>· {p.sessionsDone} of {p.sessionsPlanned} sessions</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
