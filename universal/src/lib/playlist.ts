/**
 * Playlist builder core — ported faithfully from the web `playlist-builder.tsx`
 * + `segment-editor.tsx`. All song scoring happens server-side in
 * POST /api/playlist/sessions (which streams SSE); this file only builds the
 * segment payload, runs the stream (via expo/fetch, whose FetchResponse.body is
 * a real ReadableStream unlike RN's global fetch), and exposes GET helpers.
 */
import { fetch as streamFetch } from "expo/fetch";
import { API_BASE, AUTH_HEADERS, fetchJson, DAEMON_BASE, fetchJsonFrom } from "./api";
import { flatItems, type SegmentType, type SegmentItem, type ParsedStep, type RepeatGroup, type Segment } from "run-dj/segments";

// The segment model is run-dj's segments module, shared with the web. Its default ids are the ones this
// file used to make itself.
export {
  SEGMENT_TYPES, BPM_DEFAULTS, makeSegment, parsedToItems, flatItems, segsForGenerate,
  type SegmentType, type Segment, type RepeatGroup, type SegmentItem, type ParsedStep,
} from "run-dj/segments";

export interface SongData {
  track_id: string; name: string; artist_name: string; artist_id?: string;
  duration_ms: number; tempo?: number; energy?: number; valence?: number;
  quality_score?: number; genres?: string[]; is_skip?: boolean; is_half_time?: boolean;
}
export interface GarminRunMeta {
  activity_id: string; activity_name: string | null;
  start_time?: string | null; distance?: number | null; duration?: number | null;
}
export interface GarminRunDetail {
  activity_id: string; activity_name: string | null; start_time?: string | null;
  segments: ParsedStep[]; hasSplits: boolean; isTreadmill: boolean;
}
export interface GenreBucket { genre: string; count: number | string }

export const TYPE_COLORS: Record<SegmentType, string> = {
  warmup: "#77c8d1", easy: "#6ad4a0", aerobic: "#6ad4a0", tempo: "#e0c458",
  interval: "#e0a458", vo2max: "#e06060", recovery: "#8aa0ac", rest: "#5a7a8a",
  strides: "#e0c458", cooldown: "#6366b0",
};

/** Save the current segments as a reusable workout plan (mirrors web onSavePlan:
 *  strips ids, keeps repeat structure template-only). */
export async function saveWorkoutPlan(name: string, items: SegmentItem[], garminActivityId: string | null): Promise<boolean> {
  const serialize = (its: SegmentItem[]) => its.map((it) => {
    if (it.type === "repeat") {
      const { id: _id, children, ...rest } = it as RepeatGroup;
      return { ...rest, children: children.slice(0, (it as RepeatGroup).template_size).map((c) => { const { id: _cid, ...cr } = c; return cr; }) };
    }
    const { id: _id, ...rest } = it as Segment;
    return rest;
  });
  const total = flatItems(items).reduce((s, seg) => s + seg.duration_s, 0);
  try {
    const res = await fetch(`${API_BASE}/api/playlist/workout-plans`, {
      method: "POST", headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify({ name, segments: serialize(items), sport_type: "running", total_duration_s: total, source: "builder", garmin_activity_id: garminActivityId }),
    });
    return res.ok;
  } catch { return false; }
}

/* ---- SSE generation (POST /api/playlist/sessions streams text/event-stream) ---- */
export type SSEEvent =
  | { type: "segment_start"; index: number }
  | { type: "segment_done"; index: number; songs: SongData[]; pool_count: number }
  | { type: "segment_warning"; index: number; message: string; pool_count?: number }
  | { type: "error"; message: string }
  | { type: "done"; session_id: string | number };

export interface GenerateBody {
  segments: Omit<Segment, "id" | "sync_mode">[] | Segment[];
  excluded_track_ids: string[];
  genre_selection: string[];
  genre_threshold: number;
  source_playlist_ids: string[];
  garmin_activity_id: string | null;
}

/** Stream the generation, emitting each parsed SSE event to `onEvent`. Uses
 *  expo/fetch so `res.body` is a real ReadableStream on native. */
export async function generatePlaylist(body: GenerateBody, onEvent: (e: SSEEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await streamFetch(`${API_BASE}/api/playlist/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try { onEvent(JSON.parse(line.slice(6)) as SSEEvent); } catch { /* ignore keep-alive/partial */ }
    }
  }
}

/* ---- GET helpers (all OAuth-free — DB reads) ---- */
export const fetchGarminRuns = (q = "") =>
  fetchJson<GarminRunMeta[]>(`/api/playlist/garmin-runs?limit=50${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
export const fetchGarminRunDetail = (id: string) =>
  fetchJson<GarminRunDetail>(`/api/playlist/garmin-runs?id=${encodeURIComponent(id)}`);
export const fetchGenres = () =>
  fetchJson<{ genres: GenreBucket[]; total: number }>(`/api/playlist/genres`);

/* ---- Save to Spotify (POST create / PUT update, mirrors web handleSave) ---- */
export interface SpotifySaveBody {
  session_id: string | number;
  name?: string;
  track_ids: string[];
  song_assignments: Record<number, SongData[]>;
  playlist_id?: string | null;
}
export interface SpotifySaveResult {
  ok: boolean;
  status: number;
  playlist_id?: string;
  playlist_url?: string;
  error?: string;
}

/** Create (POST) or update (PUT, when `playlist_id` is set) the Spotify playlist
 *  for a generated session. Returns status so the UI can special-case 401
 *  ("Spotify not connected") vs other failures. Needs a server-side Spotify token. */
export async function saveSpotifyPlaylist(body: SpotifySaveBody): Promise<SpotifySaveResult> {
  const isUpdate = !!body.playlist_id;
  try {
    const res = await fetch(`${API_BASE}/api/playlist/spotify/create`, {
      method: isUpdate ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { playlist_id?: string; playlist_url?: string; error?: string };
    return { ok: res.ok, status: res.status, playlist_id: data.playlist_id, playlist_url: data.playlist_url, error: data.error };
  } catch (err) {
    return { ok: false, status: 0, error: String((err as Error)?.message ?? err) };
  }
}

/* ---- Pump-up Bank (max 10 saved pump-up songs; mirrors web pump-up-modal) ---- */
export interface PumpUpSong { track_id: string; name: string; artist_name: string; tempo: number | null; energy: number | null; added_at?: string }
export const fetchPumpUp = () => fetchJson<PumpUpSong[]>(`/api/playlist/pump-up`);
export async function addPumpUp(s: { track_id: string; name: string; artist_name: string; tempo?: number; energy?: number }): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/playlist/pump-up`, {
      method: "POST", headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify({ track_id: s.track_id, name: s.name, artist_name: s.artist_name, tempo: s.tempo, energy: s.energy }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, status: res.status, error: j.error };
  } catch (err) { return { ok: false, status: 0, error: String((err as Error)?.message ?? err) }; }
}
export async function removePumpUp(trackId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/playlist/pump-up/${encodeURIComponent(trackId)}`, { method: "DELETE", headers: { ...AUTH_HEADERS } });
    return res.ok;
  } catch { return false; }
}

/* ---- Track exclusion / blacklist ---- */
export async function postBlacklist(trackId: string): Promise<number> {
  try {
    const r = await fetch(`${API_BASE}/api/playlist/blacklist`, {
      method: "POST", headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify({ track_id: trackId }),
    });
    const j = (await r.json().catch(() => ({}))) as { count?: number };
    return Number(j.count) || 0;
  } catch { return 0; }
}
export async function confirmBlacklist(trackId: string, name: string, artistName: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/playlist/blacklist/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify({ track_id: trackId, name, artist_name: artistName }),
    });
  } catch { /* best effort */ }
}

/* ---- Live DJ (HR-driven auto-queue daemon; runs on a local host, reachable
 *      from the phone over Tailscale). The app only controls + monitors it:
 *      POST start/stop, GET status (the daemon writes /tmp/soma-dj-status.json),
 *      GET hr-defaults (avg resting / max HR from the last 90 days). ---- */
export type DjState = "stopped" | "starting" | "running" | "error";
export interface DjPlayHistoryItem {
  track_id: string; name: string; artist: string;
  track_bpm: number | null; target_bpm: number | null;
  started_at: number; duration_ms: number | null; image_url: string | null;
  status: "current" | "queued" | "played";
}
export interface DjQueueHistoryItem { name: string; artist: string; target_bpm: number | null; track_bpm: number | null; reason: string; ts: number }
export interface DjHrHistoryItem { ts: number; hr: number; target_bpm: number | null }
export interface DjStatus {
  state: DjState;
  hr?: number | null; hr_age_s?: number | null; target_bpm?: number | null; offset?: number;
  current_track?: string | null; current_track_id?: string | null; ms_remaining?: number | null;
  queued_track?: string | null; queued_track_id?: string | null;
  replace_reason?: string | null; no_queue_reason?: string | null; session_played_count?: number;
  allowed_track_count?: number | null; auto_detect?: boolean; context_name?: string | null;
  queue_history?: DjQueueHistoryItem[]; play_history?: DjPlayHistoryItem[]; hr_history?: DjHrHistoryItem[];
  error?: string; ts?: number;
}
export interface DjStartBody { hr_rest: number; hr_max: number; offset: number; genres: string[]; sources: string[] }
export interface DjControlResult { ok: boolean; status: number; pid?: number; alreadyRunning?: boolean; error?: string }

// The DJ runs on the daemon host (Mac behind tailscale serve); hr-defaults is DB-backed → API host.
export const fetchDjStatus = () => fetchJsonFrom<DjStatus>(DAEMON_BASE, `/api/playlist/dj/status`);
export const fetchDjHrDefaults = () => fetchJson<{ hr_rest?: number | null; hr_max?: number | null }>(`/api/playlist/dj/hr-defaults`);
export interface SpotifyPlaylistMeta { id: string; name: string; tracks: number }
export const fetchSpotifyPlaylists = () => fetchJson<SpotifyPlaylistMeta[]>(`/api/playlist/spotify/playlists`);

/* ---- Library BPM analysis (POST /api/playlist/spotify/library streams
 *      `event: progress|done|error` SSE; GET returns coverage status). ---- */
export interface LibraryStatus { total_tracks: number | string; tracks_with_bpm: number | string }
export const fetchLibraryStatus = () => fetchJson<LibraryStatus>(`/api/playlist/spotify/library`);
export type AnalyseEvent =
  | { type: "progress"; stage: string; pct: number }
  | { type: "done"; new: number }
  | { type: "error"; message: string };

/** Analyse the Spotify library for BPM data, emitting SSE progress. Uses the
 *  `event:`/`data:` SSE shape (differs from the generation stream's bare data). */
export async function analyseLibrary(sourceIds: string[], onEvent: (e: AnalyseEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await streamFetch(`${API_BASE}/api/playlist/spotify/library`, {
    method: "POST", headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ source_ids: sourceIds }), signal,
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); onEvent({ type: "error", message: `${res.status} ${t.slice(0, 120)}` }); return; }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const lines = part.trim().split("\n");
      const evtLine = lines.find((l) => l.startsWith("event: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!evtLine || !dataLine) continue;
      const evt = evtLine.slice(7).trim();
      let data: { stage?: string; pct?: number; new?: number; message?: string } = {};
      try { data = JSON.parse(dataLine.slice(6)); } catch { continue; }
      if (evt === "progress") onEvent({ type: "progress", stage: data.stage ?? "", pct: data.pct ?? 0 });
      else if (evt === "done") onEvent({ type: "done", new: data.new ?? 0 });
      else if (evt === "error") onEvent({ type: "error", message: data.message ?? "error" });
    }
  }
}

async function djPost(path: string, body?: unknown): Promise<DjControlResult> {
  try {
    const res = await fetch(`${DAEMON_BASE}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const j = (await res.json().catch(() => ({}))) as { pid?: number; alreadyRunning?: boolean; error?: string };
    return { ok: res.ok, status: res.status, pid: j.pid, alreadyRunning: j.alreadyRunning, error: j.error };
  } catch (err) {
    return { ok: false, status: 0, error: String((err as Error)?.message ?? err) };
  }
}
export const startDj = (body: DjStartBody) => djPost(`/api/playlist/dj/start`, body);
export const stopDj = () => djPost(`/api/playlist/dj/stop`);
