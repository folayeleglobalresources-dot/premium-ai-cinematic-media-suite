"use client";

import { create } from "zustand";
import {
  defaultTitle,
  makeClip,
  normalizeTimeline,
  timelineDuration,
  type AssetMeta,
  type Clip,
  type ProjectDoc,
  type ProjectSettings,
  type Timeline,
  type TitlePreset,
} from "../types";
import { uid } from "../utils";

export type InspectorTab = "clip" | "color" | "audio" | "titles" | "fx" | "deliver";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
}

export interface EditorState {
  projectId: string;
  name: string;
  logline: string;
  settings: ProjectSettings;
  timeline: Timeline;
  assets: AssetMeta[];
  selection: string[];
  playhead: number;
  playing: boolean;
  zoom: number;
  tool: "select" | "blade";
  snapping: boolean;
  inspector: InspectorTab;
  past: Timeline[];
  future: Timeline[];
  dirty: boolean;
  quality: 1 | 0.5 | 0.25;
  loop: boolean;
  deliverPreset: string | null;
  busy: string | null;
  toast: Toast | null;
  rev: number;

  load(doc: ProjectDoc, assets: AssetMeta[]): void;
  setAssets(a: AssetMeta[]): void;
  addAsset(a: AssetMeta): void;
  beginGesture(): void;
  mutateLive(fn: (t: Timeline) => void): void;
  commit(fn: (t: Timeline) => void): void;
  undo(): void;
  redo(): void;
  select(ids: string[], additive?: boolean): void;
  setPlayhead(t: number): void;
  setPlaying(p: boolean): void;
  setZoom(z: number): void;
  set<K extends keyof EditorState>(key: K, value: EditorState[K]): void;
  setSettings(s: Partial<ProjectSettings>): void;
  rename(name: string): void;
  notify(text: string, tone?: Toast["tone"]): void;
  addAssetClip(asset: AssetMeta, opts?: { trackId?: string; at?: number }): string | null;
  addTitle(preset: TitlePreset, at?: number, text?: string, duration?: number): string;
  splitAtPlayhead(): void;
  deleteSelection(ripple?: boolean): void;
  duplicateSelection(): void;
  updateClips(ids: string[], fn: (c: Clip) => void): void;
  addTrack(kind: "video" | "audio" | "text"): void;
}

const MAX_HISTORY = 120;
const clone = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/* ───────────────────────── pure timeline ops ───────────────────────── */

export function clipEnd(c: Clip) {
  return c.start + c.duration;
}

export function compatibleTrack(t: Timeline, clip: Clip, trackId: string): boolean {
  const track = t.tracks.find((x) => x.id === trackId);
  if (!track) return false;
  if (clip.kind === "audio") return track.kind === "audio";
  if (clip.kind === "title") return track.kind === "text" || track.kind === "video";
  return track.kind === "video" || track.kind === "text";
}

export function splitClipAt(t: Timeline, clipId: string, time: number): string | null {
  const c = t.clips.find((x) => x.id === clipId);
  if (!c || time <= c.start + 0.04 || time >= clipEnd(c) - 0.04) return null;
  const leftDur = time - c.start;
  const right: Clip = {
    ...clone(c),
    id: uid("clip"),
    start: time,
    duration: c.duration - leftDur,
    sourceIn: c.sourceIn + leftDur * c.speed,
    transitionIn: null,
    fadeIn: 0,
  };
  c.duration = leftDur;
  c.fadeOut = 0;
  t.clips.push(right);
  return right.id;
}

/** Overwrite-edit: carve space on the clip's track so nothing overlaps it. */
export function resolveOverlaps(t: Timeline, clipId: string) {
  const c = t.clips.find((x) => x.id === clipId);
  if (!c) return;
  const s = c.start, e = clipEnd(c);
  const others = t.clips.filter((o) => o.id !== c.id && o.trackId === c.trackId && o.start < e - 0.001 && clipEnd(o) > s + 0.001);
  for (const o of others) {
    const os = o.start, oe = clipEnd(o);
    if (os >= s && oe <= e) {
      t.clips = t.clips.filter((x) => x.id !== o.id);
    } else if (os < s && oe > e) {
      const rightId = splitClipAt(t, o.id, e);
      const left = t.clips.find((x) => x.id === o.id)!;
      left.duration = s - left.start;
      if (rightId) {
        const r = t.clips.find((x) => x.id === rightId)!;
        r.transitionIn = null;
      }
    } else if (os < s) {
      o.duration = s - os;
    } else {
      const cut = e - os;
      o.start = e;
      o.sourceIn += cut * o.speed;
      o.duration -= cut;
      o.transitionIn = null;
    }
  }
  t.clips = t.clips.filter((x) => x.duration > 0.02);
}

export function rippleDelete(t: Timeline, ids: string[]) {
  const removed = t.clips.filter((c) => ids.includes(c.id)).sort((a, b) => b.start - a.start);
  t.clips = t.clips.filter((c) => !ids.includes(c.id));
  for (const r of removed) {
    for (const c of t.clips) {
      if (c.trackId === r.trackId && c.start >= clipEnd(r) - 0.001) c.start = Math.max(0, c.start - r.duration);
    }
  }
}

export function trackEnd(t: Timeline, trackId: string) {
  return t.clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

/* ───────────────────────── store ───────────────────────── */

let toastSeq = 0;

export const useEditor = create<EditorState>((set, get) => ({
  projectId: "",
  name: "Untitled",
  logline: "",
  settings: { width: 1920, height: 1080, fps: 24, aspect: "16:9" },
  timeline: normalizeTimeline(null),
  assets: [],
  selection: [],
  playhead: 0,
  playing: false,
  zoom: 60,
  tool: "select",
  snapping: true,
  inspector: "clip",
  past: [],
  future: [],
  dirty: false,
  quality: 1,
  loop: false,
  deliverPreset: null,
  busy: null,
  toast: null,
  rev: 0,

  load(doc, assets) {
    set({
      projectId: doc.id,
      name: doc.name,
      logline: doc.logline,
      settings: { width: doc.width, height: doc.height, fps: doc.fps, aspect: doc.aspect },
      timeline: normalizeTimeline(doc.timeline),
      assets,
      selection: [],
      playhead: 0,
      playing: false,
      past: [],
      future: [],
      dirty: false,
      quality: doc.width * doc.height > 2560 * 1440 ? 0.5 : 1,
      rev: 0,
    });
  },
  setAssets: (a) => set({ assets: a }),
  addAsset: (a) => set({ assets: [a, ...get().assets.filter((x) => x.id !== a.id)] }),

  beginGesture() {
    const { timeline, past } = get();
    set({ past: [...past.slice(-MAX_HISTORY), clone(timeline)], future: [] });
  },
  mutateLive(fn) {
    const next = clone(get().timeline);
    fn(next);
    set({ timeline: next, dirty: true, rev: get().rev + 1 });
  },
  commit(fn) {
    get().beginGesture();
    get().mutateLive(fn);
  },
  undo() {
    const { past, future, timeline } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ timeline: prev, past: past.slice(0, -1), future: [clone(timeline), ...future], dirty: true, rev: get().rev + 1 });
  },
  redo() {
    const { past, future, timeline } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    set({ timeline: next, future: rest, past: [...past, clone(timeline)], dirty: true, rev: get().rev + 1 });
  },
  select(ids, additive) {
    const cur = get().selection;
    if (additive) {
      const s = new Set(cur);
      ids.forEach((i) => (s.has(i) ? s.delete(i) : s.add(i)));
      set({ selection: [...s] });
    } else set({ selection: ids });
  },
  setPlayhead(t) {
    const max = Math.max(1, timelineDuration(get().timeline) + 5);
    set({ playhead: Math.min(Math.max(0, t), max) });
  },
  setPlaying: (p) => set({ playing: p }),
  setZoom: (z) => set({ zoom: Math.min(400, Math.max(4, z)) }),
  set: (key, value) => set({ [key]: value } as Partial<EditorState>),
  setSettings(s) {
    set({ settings: { ...get().settings, ...s }, dirty: true, rev: get().rev + 1 });
  },
  rename(name) {
    set({ name, dirty: true, rev: get().rev + 1 });
  },
  notify(text, tone = "info") {
    const id = ++toastSeq;
    set({ toast: { id, text, tone } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 4200);
  },

  addAssetClip(asset, opts) {
    const st = get();
    const t = st.timeline;
    const kind = asset.kind === "audio" ? "audio" : asset.kind === "image" ? "image" : "video";
    let trackId = opts?.trackId;
    if (!trackId || !t.tracks.some((x) => x.id === trackId)) {
      if (kind === "audio") {
        const music = asset.durationSec > 25 || /music|score|song|track|beat/i.test(asset.name);
        trackId = (music ? t.tracks.find((x) => x.id === "A2") : t.tracks.find((x) => x.id === "A1"))?.id ?? t.tracks.find((x) => x.kind === "audio")?.id;
      } else trackId = t.tracks.find((x) => x.id === "V1")?.id ?? t.tracks.find((x) => x.kind === "video")?.id;
    }
    if (!trackId) return null;
    const duration = kind === "image" ? 5 : Math.max(0.5, asset.durationSec || 5);
    const at = opts?.at ?? trackEnd(t, trackId);
    const clip = makeClip({
      trackId,
      kind,
      assetId: asset.id,
      name: asset.name,
      start: at,
      duration,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, fit: kind === "image" ? "cover" : "contain", flipH: false, cropTop: 0, cropBottom: 0 },
      motion: kind === "image" ? "kenburns-in" : "none",
    });
    get().commit((tl) => {
      tl.clips.push(clip);
      resolveOverlaps(tl, clip.id);
    });
    set({ selection: [clip.id] });
    return clip.id;
  },

  addTitle(preset, at, text, duration = 4) {
    const t = get().timeline;
    const track = t.tracks.find((x) => x.kind === "text") ?? t.tracks.find((x) => x.kind === "video")!;
    const spec = defaultTitle(preset, text ?? (preset === "lower-third" ? "Name Surname" : get().name.toUpperCase()));
    const clip = makeClip({ trackId: track.id, kind: "title", name: `Title · ${spec.text}`, start: at ?? get().playhead, duration, title: spec });
    get().commit((tl) => {
      tl.clips.push(clip);
      resolveOverlaps(tl, clip.id);
    });
    set({ selection: [clip.id], inspector: "titles" });
    return clip.id;
  },

  splitAtPlayhead() {
    const { timeline, playhead, selection } = get();
    const targets = timeline.clips.filter(
      (c) => playhead > c.start && playhead < clipEnd(c) && (selection.length === 0 || selection.includes(c.id)) && !timeline.tracks.find((tr) => tr.id === c.trackId)?.locked,
    );
    if (!targets.length) return;
    get().commit((tl) => targets.forEach((c) => splitClipAt(tl, c.id, playhead)));
  },

  deleteSelection(ripple = false) {
    const { selection } = get();
    if (!selection.length) return;
    get().commit((tl) => {
      if (ripple) rippleDelete(tl, selection);
      else tl.clips = tl.clips.filter((c) => !selection.includes(c.id));
    });
    set({ selection: [] });
  },

  duplicateSelection() {
    const { selection, timeline } = get();
    const src = timeline.clips.filter((c) => selection.includes(c.id));
    if (!src.length) return;
    const ids: string[] = [];
    get().commit((tl) => {
      for (const c of src) {
        const copy = { ...clone(c), id: uid("clip"), start: trackEnd(tl, c.trackId) };
        tl.clips.push(copy);
        ids.push(copy.id);
      }
    });
    set({ selection: ids });
  },

  updateClips(ids, fn) {
    get().commit((tl) => tl.clips.filter((c) => ids.includes(c.id)).forEach(fn));
  },

  addTrack(kind) {
    get().commit((tl) => {
      const n = tl.tracks.filter((t) => t.kind === kind).length + 1;
      const id = `${kind === "audio" ? "A" : kind === "text" ? "T" : "V"}${n}_${uid().slice(0, 4)}`;
      const track = { id, kind, name: `${kind === "audio" ? "A" : kind === "text" ? "T" : "V"}${n} · ${kind === "audio" ? "Audio" : kind === "text" ? "Text" : "Video"}`, muted: false, locked: false, hidden: false, solo: false, volume: 1 };
      if (kind === "audio") tl.tracks.push(track);
      else tl.tracks.unshift(track);
    });
  },
}));

export function selectedClips(s: Pick<EditorState, "timeline" | "selection">): Clip[] {
  return s.timeline.clips.filter((c) => s.selection.includes(c.id));
}
