import { useState } from "react";
import { TextInput, View } from "react-native";
import { Text, Card, Button, Modal } from "soma-style";
import { usePlanLifecycle, dropPlan, createPlan, type PlanSummary, type PlanState } from "../lib/api";

/**
 * The plan's lifecycle on the Training tab (soma#926), parity with the web card:
 * the current plan's state in plain words, Drop for a plan the athlete is done
 * with, the plans that came before, and New plan on top of the generator.
 */
const STATE_TITLE: Record<PlanState, string> = {
  none: "No training plan", live: "Plan is live", paused: "Plan is paused", finished: "Plan finished", dropped: "Plan dropped",
};
function fmtDay(iso: string | null): string {
  if (!iso) return "?";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

export function PlanLifecycleCard({ fallbackLabel, planLive, onChanged }: { fallbackLabel: string | null; planLive: boolean; onChanged: () => void }) {
  const { data, refetch } = usePlanLifecycle();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [busy, setBusy] = useState<"drop" | "create" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [raceDate, setRaceDate] = useState("");
  const [distance, setDistance] = useState("21.1");
  const [goal, setGoal] = useState("1:35:00");
  const [name, setName] = useState("");
  const current = data?.current ?? null;
  const past = data?.past ?? [];
  const state: PlanState = current?.state ?? "none";
  const canDrop = !!current && (current.state === "live" || current.state === "paused");

  async function onDrop() {
    setBusy("drop"); setMsg(null);
    const r = await dropPlan();
    setBusy(null); setConfirmDrop(false);
    if (!r.ok) { setMsg(r.error || "Could not drop the plan."); return; }
    setMsg(r.removed ? `Dropped. ${r.removed} upcoming workout${r.removed === 1 ? "" : "s"} removed from Garmin.` : "Dropped.");
    refetch(); onChanged();
  }
  async function onCreate() {
    const parts = goal.split(":").map(Number);
    const goalSec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : NaN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) { setMsg("Race date as YYYY-MM-DD."); return; }
    if (!isFinite(goalSec) || goalSec <= 0) { setMsg("Goal time as h:mm:ss."); return; }
    setBusy("create"); setMsg(null);
    const r = await createPlan(raceDate, Number(distance) || 21.1, goalSec, name.trim() || undefined);
    setBusy(null);
    if (!r.ok) { setMsg(r.error || "Could not create the plan."); return; }
    setNewOpen(false); setMsg(`Plan created: ${r.days} days. Its workouts reach the watch with the next sync once the plan is live.`);
    refetch(); onChanged();
  }

  return (
    <Card className="gap-1" testID="training-plan-lifecycle">
      <Text variant="eyebrow">Plan</Text>
      <Text variant="body" className="text-text" testID="training-plan-state">
        {STATE_TITLE[state]}{current?.name ? ` · ${current.name}` : ""}
      </Text>
      {current ? <Text variant="caption" className="text-text-secondary" testID="training-plan-state-line">{stateLine(current)}.</Text> : null}
      {!planLive && fallbackLabel ? (
        <Text variant="micro" testID="training-fallback-note">Everything below is from what you actually did. Projections assume {fallbackLabel}.</Text>
      ) : null}
      {msg ? <Text variant="caption" className="text-text" testID="training-plan-msg">{msg}</Text> : null}
      <View className="flex-row flex-wrap items-center gap-2 pt-2">
        {canDrop && !confirmDrop ? <Button label="Drop this plan" variant="ghost" size="sm" onPress={() => setConfirmDrop(true)} testID="plan-drop" /> : null}
        {canDrop && confirmDrop ? (
          <>
            <Text variant="micro" className="text-text-muted" style={{ flexShrink: 1 }}>
              Drop {current!.name}? {current!.pushedAhead > 0 ? `${current!.pushedAhead} upcoming workout${current!.pushedAhead === 1 ? "" : "s"} come off Garmin.` : "Nothing is on Garmin ahead."} Its history stays.
            </Text>
            <Button label={busy === "drop" ? "Dropping…" : "Yes, drop it"} variant="primary" size="sm" disabled={busy === "drop"} onPress={onDrop} testID="plan-drop-confirm" />
            <Button label="Keep it" variant="ghost" size="sm" onPress={() => setConfirmDrop(false)} />
          </>
        ) : null}
        <Button label="New plan" variant="secondary" size="sm" onPress={() => setNewOpen(true)} testID="plan-new" />
      </View>
      {past.length > 0 ? (
        <View className="gap-0.5 pt-2" testID="training-past-plans">
          <Text variant="eyebrow">Past plans</Text>
          {past.map((p) => (
            <Text key={p.id} variant="micro" className="text-text-muted">
              {p.name ?? `Plan ${p.id}`} · {STATE_TITLE[p.state].replace("Plan ", "").toLowerCase()} · race {fmtDay(p.raceDate)} · {p.sessionsDone} of {p.sessionsPlanned} sessions
            </Text>
          ))}
        </View>
      ) : null}
      <Modal visible={newOpen} onClose={() => setNewOpen(false)} title="New plan">
        <View className="gap-3">
          <Text variant="micro" className="text-text-muted">A five-week build to the race from the generator.{current && (current.state === "live" || current.state === "paused") ? ` ${current.name} becomes a past plan.` : ""}</Text>
          <Text variant="caption" className="text-text-secondary">Race date (YYYY-MM-DD)</Text>
          <TextInput value={raceDate} onChangeText={setRaceDate} placeholder="2026-11-08" placeholderTextColor="#5a7a8a" autoCapitalize="none" className="rounded-lg border border-border-subtle px-3 py-2 text-text" testID="plan-new-date" />
          <Text variant="caption" className="text-text-secondary">Distance (km)</Text>
          <TextInput value={distance} onChangeText={setDistance} keyboardType="decimal-pad" className="rounded-lg border border-border-subtle px-3 py-2 text-text" testID="plan-new-distance" />
          <Text variant="caption" className="text-text-secondary">Name (optional)</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Half marathon · Oct 18, 2026" placeholderTextColor="#5a7a8a" className="rounded-lg border border-border-subtle px-3 py-2 text-text" testID="plan-new-name" />
          <Text variant="caption" className="text-text-secondary">Goal time (h:mm:ss)</Text>
          <TextInput value={goal} onChangeText={setGoal} autoCapitalize="none" className="rounded-lg border border-border-subtle px-3 py-2 text-text" testID="plan-new-goal" />
          <View className="flex-row justify-end gap-2 pt-1">
            <Button label="Cancel" variant="ghost" size="sm" onPress={() => setNewOpen(false)} />
            <Button label={busy === "create" ? "Creating…" : "Create plan"} variant="primary" size="sm" disabled={busy === "create"} onPress={onCreate} testID="plan-new-submit" />
          </View>
        </View>
      </Modal>
    </Card>
  );
}
