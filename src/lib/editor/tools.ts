"use client";

import type { DirectorAction, DirectorContext } from "../ai/director";
import { resolveGrade } from "../looks";
import { autoBalance, bestMoments, detectBeats, detectScenes, detectSilences, frameStats, saliencyCenter, sampleImage, shotMatch } from "../media/analysis";
import { decodeAssetAudio, objectUrl, seekTo } from "../media/media";
import { defaultGrade, defaultTitle, FORMAT_PRESETS, makeClip, timelineDuration, type AssetMeta, type Clip, type Grade, type Timeline } from "../types";
import { clamp, timecode, uid } from "../utils";
import { clipEnd, resolveOverlaps, splitClipAt, useEditor, type EditorState } from "./store";

type Get = () => EditorState;

export function buildContext(s: EditorState): DirectorContext {
  const clips = s.timeline.clips;
  const audioTracks = s.timeline.tracks.filter((t) => t.kind === "audio").map((t) => t.id);
  return {
    projectName: s.name,
    aspect: s.settings.aspect,
    width: s.settings.width,
    height: s.settings.height,
    fps: s.settings.fps,
    duration: Math.round(timelineDuration(s.timeline) * 10) / 10,
    clipCount: clips.length,
    videoClips: clips.filter((c) => c.kind === "video" || c.kind === "image").length,
    audioClips: clips.filter((c) => c.kind === "audio" || c.kind === "video").length,
    titleCount: clips.filter((c) => c.kind === "title").length,
    selectedCount: s.selection.length,
    looks: [...new Set(clips.map((c) => c.grade.look).filter(Boolean) as string[])],
    hasMusic: clips.some((c) => c.kind === "audio" && audioTracks.includes(c.trackId)),
    letterbox: s.timeline.finishing.letterbox,
    captions: s.timeline.captions.length,
    transitions: clips.filter((c) => c.transitionIn).length,
  };
}

const visualKinds = new Set(["video", "image"]);

function targets(s: EditorState, target: "all" | "selected" | undefined, kinds = visualKinds): Clip[] {
  const pool = s.timeline.clips.filter((c) => kinds.has(c.kind));
  if (target === "selected" && s.selection.length) return pool.filter((c) => s.selection.includes(c.id));
  if (s.selection.length && target !== "all") return pool.filter((c) => s.selection.includes(c.id));
  return pool;
}

const analysisVideos = new Map<string, HTMLVideoElement>();

async function clipFrame(c: Clip, fraction = 0.5): Promise<ImageData | null> {
  if (!c.assetId) return null;
  const url = await objectUrl(c.assetId);
  if (!url) return null;
  if (c.kind === "image") {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => null);
    return sampleImage(img);
  }
  let v = analysisVideos.get(c.assetId);
  if (!v) {
    v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.src = url;
    analysisVideos.set(c.assetId, v);
    await new Promise<void>((r) => {
      v!.onloadeddata = () => r();
      v!.onerror = () => r();
      setTimeout(r, 5000);
    });
  }
  await seekTo(v, c.sourceIn + c.duration * c.speed * fraction);
  return sampleImage(v);
}

function rippleRetime(tl: Timeline, id: string, newDur: number) {
  const c = tl.clips.find((x) => x.id === id);
  if (!c) return;
  const oldEnd = clipEnd(c);
  const delta = newDur - c.duration;
  for (const o of tl.clips) if (o.id !== id && o.trackId === c.trackId && o.start >= oldEnd - 0.001) o.start += delta;
  c.duration = newDur;
}

function packTrack(tl: Timeline, trackId: string) {
  let t = 0;
  tl.clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .forEach((c) => {
      c.start = t;
      t += c.duration;
    });
}

/* ───────────────────────── executor ───────────────────────── */

export async function runActions(actions: DirectorAction[], get: Get = useEditor.getState): Promise<string[]> {
  const log: string[] = [];
  for (const a of actions) {
    try {
      const msg = await runAction(a, get);
      if (msg) log.push(msg);
    } catch (e) {
      log.push(`⚠ ${a.type}: ${(e as Error).message}`);
    }
  }
  get().set("busy", null);
  return log;
}

async function runAction(a: DirectorAction, get: Get): Promise<string | null> {
  const s = get();
  switch (a.type) {
    case "undo":
      s.undo();
      return null;
    case "applyLook": {
      const ids = targets(s, a.target).map((c) => c.id);
      s.updateClips(ids, (c) => {
        c.grade = { ...c.grade, look: a.look, lookAmount: clamp(a.amount ?? 1, 0, 1.5) };
      });
      return null;
    }
    case "adjustGrade": {
      const ids = targets(s, a.target).map((c) => c.id);
      s.updateClips(ids, (c) => {
        const g = { ...c.grade } as Grade;
        for (const [k, v] of Object.entries(a.patch)) {
          if (typeof v !== "number") continue;
          const key = k as keyof Grade;
          const cur = g[key] as unknown as number;
          (g as unknown as Record<string, number>)[key] = a.mode === "set" ? v : cur + v;
        }
        g.contrast = clamp(g.contrast, 0.3, 2.5);
        g.saturation = clamp(g.saturation, 0, 2.5);
        g.exposure = clamp(g.exposure, -4, 4);
        c.grade = g;
      });
      return null;
    }
    case "mono":
      s.updateClips(targets(s, a.target).map((c) => c.id), (c) => {
        c.grade = { ...c.grade, mono: a.on };
      });
      return null;
    case "resetGrade":
      s.updateClips(targets(s, a.target).map((c) => c.id), (c) => {
        c.grade = defaultGrade();
      });
      return null;
    case "setFormat": {
      const p = FORMAT_PRESETS.find((f) => f.id === a.preset);
      if (p) s.setSettings({ width: p.width, height: p.height, aspect: p.aspect });
      return null;
    }
    case "letterbox":
      s.commit((tl) => (tl.finishing.letterbox = a.ratio));
      return null;
    case "finishing":
      s.commit((tl) => {
        if (a.grain !== undefined) tl.finishing.grain = clamp(a.grain, 0, 1);
        if (a.vignette !== undefined) tl.finishing.vignette = clamp(a.vignette, 0, 1);
      });
      return null;
    case "addTitle": {
      const total = timelineDuration(s.timeline);
      const at = a.at === "start" ? 0 : a.at === "end" ? total : s.playhead;
      const id = s.addTitle(a.preset, at, a.text, a.duration ?? 4);
      if (a.subtitle) get().updateClips([id], (c) => c.title && (c.title.subtitle = a.subtitle!));
      if (a.at === "start") {
        get().updateClips([id], (c) => {
          c.fadeIn = 0.6;
        });
      }
      return null;
    }
    case "transitions": {
      const tg = targets(s, a.target);
      const ids = new Set(tg.map((c) => c.id));
      s.commit((tl) => {
        for (const c of tl.clips) {
          if (!ids.has(c.id)) continue;
          const prev = tl.clips.find((o) => o.trackId === c.trackId && o.id !== c.id && Math.abs(clipEnd(o) - c.start) < 0.05);
          if (!prev) continue;
          c.transitionIn = { type: a.transition, duration: Math.min(a.duration, c.duration / 2, prev.duration / 2) };
        }
      });
      return null;
    }
    case "speed": {
      const tg = targets(s, a.target, new Set(["video", "audio"]));
      const sp = clamp(a.speed, 0.1, 16);
      s.commit((tl) => {
        for (const t of tg) {
          const c = tl.clips.find((x) => x.id === t.id)!;
          const nd = (c.duration * c.speed) / sp;
          c.speed = sp;
          rippleRetime(tl, c.id, nd);
        }
      });
      return null;
    }
    case "motion":
      s.updateClips(targets(s, a.target).map((c) => c.id), (c) => {
        c.motion = a.motion;
        if (a.motion !== "none" && c.transform.fit === "contain") c.transform.fit = "cover";
      });
      return null;
    case "volume": {
      const audioTracks = s.timeline.tracks.filter((t) => t.kind === "audio");
      const musicTracks = new Set(audioTracks.filter((t, i) => /score|music/i.test(t.name) || i > 0).map((t) => t.id));
      const pool = s.timeline.clips.filter((c) => {
        if (c.kind !== "audio" && c.kind !== "video") return false;
        if (a.track === "music") return c.kind === "audio" && musicTracks.has(c.trackId);
        if (a.track === "dialogue") return c.kind === "video" || !musicTracks.has(c.trackId);
        return true;
      });
      s.updateClips(pool.map((c) => c.id), (c) => {
        if (a.mute) c.muted = true;
        else {
          c.muted = false;
          c.volume = clamp(c.volume * Math.pow(10, a.gainDb / 20), 0, 4);
        }
      });
      return null;
    }
    case "fades": {
      const vis = s.timeline.clips.filter((c) => visualKinds.has(c.kind)).sort((x, y) => x.start - y.start);
      const aud = s.timeline.clips.filter((c) => c.kind === "audio");
      const first = vis[0], last = vis[vis.length - 1];
      s.commit((tl) => {
        if (first && a.fadeIn) tl.clips.find((c) => c.id === first.id)!.fadeIn = a.fadeIn;
        if (last && a.fadeOut) tl.clips.find((c) => c.id === last.id)!.fadeOut = a.fadeOut;
        const end = timelineDuration(tl);
        for (const c of tl.clips.filter((x) => aud.some((y) => y.id === x.id))) {
          if (a.fadeIn && c.start < 0.1) c.fadeIn = a.fadeIn;
          if (a.fadeOut && Math.abs(clipEnd(c) - end) < 1) c.fadeOut = a.fadeOut;
        }
      });
      return null;
    }
    case "removeSilences": {
      s.set("busy", "Listening for dead air…");
      const pool = s.timeline.clips
        .filter((c) => (c.kind === "video" || c.kind === "audio") && c.assetId)
        .filter((c) => !/score|music/i.test(s.timeline.tracks.find((t) => t.id === c.trackId)?.name ?? ""));
      let removedTotal = 0;
      const plans: { id: string; keeps: Array<[number, number]> }[] = [];
      for (const c of pool) {
        const buf = await decodeAssetAudio(c.assetId!);
        if (!buf) continue;
        const k = a.aggressiveness ?? 1;
        const regions = detectSilences(buf, { minSilence: k > 1 ? 0.3 : k < 1 ? 0.7 : 0.45, thresholdDb: k > 1 ? -34 : -38 });
        const srcStart = c.sourceIn, srcEnd = c.sourceIn + c.duration * c.speed;
        const keeps: Array<[number, number]> = [];
        let cursor = srcStart;
        for (const [rs, re] of regions) {
          if (re <= srcStart || rs >= srcEnd) continue;
          const s0 = Math.max(rs, srcStart), e0 = Math.min(re, srcEnd);
          if (s0 - cursor > 0.15) keeps.push([cursor, s0]);
          cursor = e0;
        }
        if (srcEnd - cursor > 0.15) keeps.push([cursor, srcEnd]);
        if (keeps.length && keeps.reduce((acc, [x, y]) => acc + (y - x), 0) < srcEnd - srcStart - 0.2) plans.push({ id: c.id, keeps });
      }
      if (!plans.length) return "No significant silences found — the dialogue is already tight.";
      s.commit((tl) => {
        for (const plan of plans.sort((x, y) => (tl.clips.find((c) => c.id === y.id)?.start ?? 0) - (tl.clips.find((c) => c.id === x.id)?.start ?? 0))) {
          const c = tl.clips.find((x) => x.id === plan.id);
          if (!c) continue;
          const origEnd = clipEnd(c);
          let t = c.start;
          const pieces: Clip[] = plan.keeps.map(([ks, ke], i) => {
            const d = (ke - ks) / c.speed;
            const piece: Clip = { ...JSON.parse(JSON.stringify(c)), id: i === 0 ? c.id : uid("clip"), start: t, duration: d, sourceIn: ks, transitionIn: i === 0 ? c.transitionIn : null };
            t += d;
            return piece;
          });
          const removed = origEnd - t;
          removedTotal += removed;
          tl.clips = tl.clips.filter((x) => x.id !== c.id);
          for (const o of tl.clips) if (o.trackId === c.trackId && o.start >= origEnd - 0.001) o.start -= removed;
          tl.clips.push(...pieces);
        }
      });
      return `Removed ${removedTotal.toFixed(1)}s of silence across ${plans.length} clip${plans.length > 1 ? "s" : ""}.`;
    }
    case "beatSync": {
      const music = s.timeline.clips.filter((c) => c.kind === "audio" && c.assetId).sort((x, y) => y.duration - x.duration)[0];
      if (!music) return "Add a music cue on an audio track first, then I'll cut to its beat.";
      s.set("busy", "Tracking tempo…");
      const buf = await decodeAssetAudio(music.assetId!);
      if (!buf) return "Couldn't decode that music file.";
      const { bpm, beats } = detectBeats(buf);
      const tlBeats = beats.map((b) => music.start + (b - music.sourceIn) / music.speed).filter((b) => b >= 0 && b <= clipEnd(music));
      if (tlBeats.length < 4) return "The beat grid was too weak to conform to.";
      const period = 60 / bpm;
      const unit = period < 0.45 ? 4 : period < 0.7 ? 2 : 1;
      s.commit((tl) => {
        const v1 = tl.tracks.find((t) => t.kind === "video")?.id;
        const vids = tl.clips.filter((c) => c.trackId === v1 && visualKinds.has(c.kind)).sort((x, y) => x.start - y.start);
        let t = vids[0]?.start ?? 0;
        for (const c of vids) {
          const asset = c.assetId ? s.assets.find((x) => x.id === c.assetId) : undefined;
          const maxDur = c.kind === "image" || !asset ? 30 : (asset.durationSec - c.sourceIn) / c.speed;
          const want = t + Math.min(c.duration, maxDur);
          const candidates = tlBeats.filter((b, i) => b > t + 0.4 && b <= t + maxDur + 0.001 && i % unit === 0);
          const end = candidates.length ? candidates.reduce((best, b) => (Math.abs(b - want) < Math.abs(best - want) ? b : best), candidates[0]) : want;
          c.start = t;
          c.duration = Math.max(0.3, end - t);
          if (c.transitionIn) c.transitionIn.duration = Math.min(c.transitionIn.duration, c.duration / 2);
          t = end;
        }
        tl.markers = tl.markers.filter((m) => m.label !== "♪");
        tlBeats.filter((_, i) => i % unit === 0).slice(0, 96).forEach((b) => tl.markers.push({ id: uid("mk"), time: b, label: "♪", color: "#D8B57A" }));
      });
      return `Detected ${bpm} BPM — conformed cuts to every ${unit === 1 ? "" : unit + " "}beat${unit > 1 ? "s" : ""}.`;
    }
    case "detectScenes": {
      const pool = targets(s, undefined, new Set(["video"]));
      let total = 0;
      for (const [i, c] of pool.entries()) {
        const asset = s.assets.find((x) => x.id === c.assetId);
        const url = c.assetId ? await objectUrl(c.assetId) : null;
        if (!asset || !url) continue;
        get().set("busy", `Scanning shot ${i + 1}/${pool.length} for cuts…`);
        const cuts = await detectScenes(url, asset.durationSec);
        const times = cuts.map((ct) => c.start + (ct - c.sourceIn) / c.speed).filter((t) => t > c.start + 0.3 && t < clipEnd(c) - 0.3);
        if (!times.length) continue;
        total += times.length;
        get().commit((tl) => {
          let currentId = c.id;
          for (const t of times) {
            const nid = splitClipAt(tl, currentId, t);
            if (nid) currentId = nid;
          }
        });
      }
      return total ? `Found ${total} scene cut${total > 1 ? "s" : ""} and split the clips.` : "No hard scene changes detected.";
    }
    case "autoColor": {
      const pool = targets(s, a.target);
      for (const [i, c] of pool.entries()) {
        get().set("busy", `Measuring shot ${i + 1}/${pool.length}…`);
        const img = await clipFrame(c);
        if (!img) continue;
        const fix = autoBalance(frameStats(img));
        get().updateClips([c.id], (cl) => {
          cl.grade = { ...cl.grade, ...fix };
        });
      }
      return `Balanced ${pool.length} shot${pool.length === 1 ? "" : "s"} to a neutral reference.`;
    }
    case "matchColor": {
      const pool = s.timeline.clips.filter((c) => visualKinds.has(c.kind)).sort((x, y) => x.start - y.start);
      const ref = pool.find((c) => s.selection.includes(c.id)) ?? pool[0];
      if (!ref || pool.length < 2) return "Need at least two shots to match.";
      get().set("busy", "Building hero-shot colour reference…");
      const refImg = await clipFrame(ref);
      if (!refImg) return "Couldn't read the reference shot.";
      const refStats = frameStats(refImg);
      for (const c of pool) {
        if (c.id === ref.id) continue;
        const img = await clipFrame(c);
        if (!img) continue;
        const cdl = shotMatch(refStats, frameStats(img));
        get().updateClips([c.id], (cl) => {
          cl.grade = { ...cl.grade, ...cdl, look: ref.grade.look, lookAmount: ref.grade.lookAmount };
        });
      }
      return `Matched ${pool.length - 1} shots to "${ref.name}".`;
    }
    case "smartReframe": {
      const pool = targets(s, "all");
      for (const [i, c] of pool.entries()) {
        get().set("busy", `Reframing shot ${i + 1}/${pool.length}…`);
        const pts: { x: number; y: number }[] = [];
        for (const f of [0.25, 0.5, 0.75]) {
          const img = await clipFrame(c, f);
          if (img) pts.push(saliencyCenter(img));
        }
        if (!pts.length) continue;
        const x = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
        const y = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
        get().updateClips([c.id], (cl) => {
          cl.reframe = { x, y };
          cl.transform = { ...cl.transform, fit: "cover" };
        });
      }
      return null;
    }
    case "trimTo": {
      const total = timelineDuration(s.timeline);
      if (total <= a.seconds) return `Already ${total.toFixed(1)}s — under ${a.seconds}s.`;
      const f = a.seconds / total;
      s.commit((tl) => {
        const v1 = tl.tracks.find((t) => t.kind === "video")?.id;
        tl.clips.filter((c) => c.trackId === v1).forEach((c) => (c.duration = Math.max(0.4, c.duration * f)));
        if (v1) packTrack(tl, v1);
        tl.clips = tl.clips.filter((c) => c.start < a.seconds);
        tl.clips.forEach((c) => {
          if (clipEnd(c) > a.seconds) c.duration = a.seconds - c.start;
          if (c.transitionIn) c.transitionIn.duration = Math.min(c.transitionIn.duration, c.duration / 2);
        });
      });
      return null;
    }
    case "autoEdit":
      return autoEdit(a.style, a.seconds ?? 30, get);
    case "captions": {
      s.commit((tl) => {
        tl.finishing.captionsVisible = a.visible ?? true;
        if (a.style) tl.finishing.captionStyle = a.style;
        if (!tl.captions.length) {
          for (const c of tl.clips) {
            const asset = s.assets.find((x) => x.id === c.assetId);
            for (const cap of asset?.captions ?? []) {
              const st = c.start + (cap.start - c.sourceIn) / c.speed;
              const en = c.start + (cap.end - c.sourceIn) / c.speed;
              if (en > c.start && st < clipEnd(c)) tl.captions.push({ id: uid("cap"), start: Math.max(c.start, st), end: Math.min(clipEnd(c), en), text: cap.text });
            }
          }
        }
      });
      return null;
    }
    case "marker":
      s.commit((tl) => tl.markers.push({ id: uid("mk"), time: s.playhead, label: a.label, color: "#E8C27A" }));
      return null;
    case "deliver":
      s.set("deliverPreset", a.preset);
      s.set("inspector", "deliver");
      return null;
  }
  return null;
}

async function autoEdit(style: "trailer" | "montage" | "social" | "documentary", seconds: number, get: Get): Promise<string> {
  const s = get();
  const usedIds = [...new Set(s.timeline.clips.filter((c) => c.kind === "video" && c.assetId).map((c) => c.assetId!))];
  const sources: AssetMeta[] = (usedIds.length ? s.assets.filter((a) => usedIds.includes(a.id)) : s.assets.filter((a) => a.kind === "video")).filter((a) => a.durationSec > 1);
  if (!sources.length) return "Import or capture some footage first — I need picture to cut.";
  s.set("busy", "Ranking moments by energy…");
  const shotLen = style === "trailer" ? 1.8 : style === "social" ? 1.2 : style === "documentary" ? 4.5 : 2.6;
  const count = Math.max(3, Math.round(seconds / shotLen));
  const perSource = Math.ceil(count / sources.length);
  const moments: { asset: AssetMeta; t: number }[] = [];
  for (const asset of sources) {
    const buf = await decodeAssetAudio(asset.id);
    const picks = bestMoments(buf, asset.durationSec, perSource, shotLen);
    picks.forEach((t) => moments.push({ asset, t }));
  }
  // interleave sources for variety
  const ordered = moments.sort((a, b) => a.t / a.asset.durationSec - b.t / b.asset.durationSec).slice(0, count);
  s.commit((tl) => {
    const v1 = tl.tracks.find((t) => t.kind === "video")!.id;
    tl.clips = tl.clips.filter((c) => !(c.trackId === v1) && c.kind !== "title");
    let t = 0;
    ordered.forEach((m, i) => {
      const accel = style === "trailer" ? clamp(1.5 - (i / ordered.length) * 0.9, 0.55, 1.5) : 1;
      const d = Math.min(shotLen * accel, m.asset.durationSec - m.t);
      const c = makeClip({ trackId: v1, kind: "video", assetId: m.asset.id, name: m.asset.name, start: t, duration: Math.max(0.5, d), sourceIn: m.t });
      if (i > 0) {
        if (style === "trailer") c.transitionIn = i % 4 === 0 ? { type: "dip-black", duration: 0.5 } : i === ordered.length - 2 ? { type: "flash", duration: 0.3 } : null;
        else if (style === "montage" || style === "documentary") c.transitionIn = { type: "dissolve", duration: 0.6 };
        else c.transitionIn = i % 3 === 0 ? { type: "zoom", duration: 0.3 } : null;
      }
      if (style === "trailer" || style === "social") c.motion = i % 2 ? "kenburns-in" : "punch-in";
      c.transform.fit = "cover";
      if (!c.grade.look) c.grade = { ...c.grade, look: style === "trailer" ? "teal-orange" : style === "documentary" ? "documentary" : "kodak2383", lookAmount: 0.85 };
      tl.clips.push(c);
      t += c.duration;
    });
    const end = t;
    const textTrack = tl.tracks.find((x) => x.kind === "text")?.id ?? v1;
    if (style === "trailer") {
      tl.finishing.letterbox = 2.39;
      tl.finishing.grain = Math.max(tl.finishing.grain, 0.15);
      const title = makeClip({ trackId: textTrack, kind: "title", name: "Title · end card", start: end, duration: 4, title: { ...defaultTitleSpec(s.name.toUpperCase(), "epic"), subtitle: "COMING SOON" } });
      tl.clips.push(title);
    } else if (style === "documentary") {
      tl.clips.push(makeClip({ trackId: textTrack, kind: "title", name: "Title · slug", start: 0.5, duration: 4, title: defaultTitleSpec(s.name.toUpperCase(), "documentary") }));
    } else {
      tl.clips.push(makeClip({ trackId: textTrack, kind: "title", name: "Title · open", start: 0, duration: 3, title: defaultTitleSpec(s.name.toUpperCase(), style === "social" ? "kinetic" : "cinematic") }));
    }
    for (const c of tl.clips) resolveOverlaps(tl, c.id);
  });
  const hasMusic = get().timeline.clips.some((c) => c.kind === "audio");
  if (hasMusic) await runAction({ type: "beatSync" }, get);
  return `Cut a ${style} from ${ordered.length} moments across ${sources.length} source${sources.length > 1 ? "s" : ""}${hasMusic ? ", locked to the music" : ""}.`;
}

function defaultTitleSpec(text: string, preset: "epic" | "documentary" | "kinetic" | "cinematic") {
  return { ...defaultTitle(preset), text };
}

/* ───────────────────────── interchange ───────────────────────── */

export function exportEDL(s: EditorState): string {
  const fps = s.settings.fps;
  const tc = (t: number) => timecode(t, fps);
  const lines = [`TITLE: ${s.name.toUpperCase().slice(0, 60)}`, "FCM: NON-DROP FRAME", ""];
  let n = 1;
  const offset = 3600;
  const tracks = s.timeline.tracks;
  const media = s.timeline.clips.filter((c) => c.kind === "video" || c.kind === "audio" || c.kind === "image").sort((a, b) => a.start - b.start);
  for (const c of media) {
    const tr = tracks.find((t) => t.id === c.trackId);
    const ch = tr?.kind === "audio" ? "A" : "V";
    const srcIn = c.sourceIn, srcOut = c.sourceIn + c.duration * c.speed;
    const id = String(n).padStart(3, "0");
    lines.push(`${id}  AX       ${ch.padEnd(5)} C        ${tc(srcIn)} ${tc(srcOut)} ${tc(offset + c.start)} ${tc(offset + c.start + c.duration)}`);
    if (c.speed !== 1) lines.push(`M2   AX       ${(fps * c.speed).toFixed(1).padStart(5, "0")}                ${tc(srcIn)}`);
    lines.push(`* FROM CLIP NAME: ${c.name}`);
    if (c.transitionIn) lines.push(`* TRANSITION: ${c.transitionIn.type.toUpperCase()} ${Math.round(c.transitionIn.duration * fps)} FRAMES`);
    if (c.grade.look) lines.push(`* LOOK: ${c.grade.look} @ ${Math.round(c.grade.lookAmount * 100)}%`);
    lines.push("");
    n++;
  }
  for (const m of s.timeline.markers.filter((mk) => mk.label !== "♪")) lines.push(`* MARKER ${tc(offset + m.time)} ${m.label}`);
  return lines.join("\n");
}

export function exportSRT(s: EditorState): string {
  const fmt = (t: number) => {
    const ms = Math.floor((t % 1) * 1000);
    const total = Math.floor(t);
    const p = (v: number, l = 2) => String(v).padStart(l, "0");
    return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)},${p(ms, 3)}`;
  };
  return s.timeline.captions
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`)
    .join("\n");
}

export function exportCDL(s: EditorState): string {
  const rows = s.timeline.clips
    .filter((c) => visualKinds.has(c.kind))
    .map((c) => {
      const r = resolveGrade(c.grade);
      const ex = Math.pow(2, r.exposure / 2.2);
      const slope = r.slope.map((v, i) => (v * r.gain[i] * ex).toFixed(4)).join(" ");
      const offset = r.offset.map((v, i) => (v + r.lift[i] * 0.5).toFixed(4)).join(" ");
      const power = r.power.map((v, i) => (v / r.gamma[i]).toFixed(4)).join(" ");
      const id = c.name.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40) + "_" + c.id.slice(-4);
      return `  <ColorCorrection id="${id}">
    <Description>${c.grade.look ? `Look: ${c.grade.look}` : "Primary"} · LUMIÈRE</Description>
    <SOPNode>
      <Slope>${slope}</Slope>
      <Offset>${offset}</Offset>
      <Power>${power}</Power>
    </SOPNode>
    <SatNode>
      <Saturation>${r.saturation.toFixed(4)}</Saturation>
    </SatNode>
  </ColorCorrection>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ColorCorrectionCollection xmlns="urn:ASC:CDL:v1.01">\n${rows.join("\n")}\n</ColorCorrectionCollection>\n`;
}

export function exportProject(s: EditorState): string {
  return JSON.stringify({ format: "lumiere-project@1", name: s.name, logline: s.logline, settings: s.settings, timeline: s.timeline, exportedAt: new Date().toISOString() }, null, 2);
}
