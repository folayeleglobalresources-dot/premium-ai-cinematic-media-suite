import { DEFAULT_GRADE, emptyTimeline, newClipId, type Clip, type TimelineData, type TransitionType } from "./types";

export type AutoEditSource = {
  assetId: number;
  name: string;
  kind: "video" | "image";
  duration: number; // seconds
  width: number;
  height: number;
  energy: number[]; // motion/detail energy samples across the clip (0..1)
};

export type AutoEditMood = "trailer" | "cinematic" | "documentary" | "musicVideo" | "wedding" | "commercial";

export const MOODS: Record<AutoEditMood, { label: string; shot: [number, number]; lookId: string; transition: TransitionType; transitionDur: number; crescendo: boolean; titleFont: "serif" | "sans" | "mono"; tagline: string }> = {
  trailer: { label: "Trailer", shot: [0.7, 2.6], lookId: "teal-amber", transition: "dipBlack", transitionDur: 0.25, crescendo: true, titleFont: "serif", tagline: "Accelerating cuts, dips to black, crescendo to the strongest material." },
  cinematic: { label: "Cinematic", shot: [2.2, 4.5], lookId: "anamorphic", transition: "dissolve", transitionDur: 0.6, crescendo: false, titleFont: "serif", tagline: "Measured pacing, soft dissolves, anamorphic warmth." },
  documentary: { label: "Documentary", shot: [4, 8], lookId: "overcast-film", transition: "dissolve", transitionDur: 0.4, crescendo: false, titleFont: "sans", tagline: "Chronological, truthful, long takes." },
  musicVideo: { label: "Music Video", shot: [0.5, 1.4], lookId: "neon-night", transition: "none", transitionDur: 0, crescendo: true, titleFont: "mono", tagline: "Rapid rhythmic cuts on energy peaks." },
  wedding: { label: "Wedding", shot: [2.5, 5], lookId: "velvet-rose", transition: "dissolve", transitionDur: 0.9, crescendo: false, titleFont: "serif", tagline: "Romantic diffusion, gentle dissolves, emotional arc." },
  commercial: { label: "Commercial", shot: [1.2, 2.4], lookId: "hdr-pop", transition: "none", transitionDur: 0, crescendo: true, titleFont: "sans", tagline: "Punchy, bright, product-forward." },
};

type Segment = { src: AutoEditSource; inPoint: number; duration: number; energy: number; order: number };

export function planAutoEdit(
  sources: AutoEditSource[],
  opts: { mood: AutoEditMood; targetDuration: number; title?: string; subtitle?: string; width: number; height: number; fps: number },
): TimelineData {
  const mood = MOODS[opts.mood];
  const tl = emptyTimeline(opts.width, opts.height, opts.fps);
  tl.masterLookId = mood.lookId;
  const usable = sources.filter((s) => s.duration > 0.3 || s.kind === "image");
  if (!usable.length) return tl;

  const total = usable.reduce((a, s) => a + (s.kind === "image" ? 4 : s.duration), 0);
  const target = Math.max(5, Math.min(opts.targetDuration, Math.max(total, 5)));
  const avgShot = (mood.shot[0] + mood.shot[1]) / 2;
  const shotCount = Math.max(usable.length, Math.round(target / avgShot));

  // Allocate shots per source proportional to duration (images get one)
  const segments: Segment[] = [];
  let order = 0;
  for (const src of usable) {
    if (src.kind === "image") {
      segments.push({ src, inPoint: 0, duration: Math.min(mood.shot[1], 4), energy: 0.5, order: order++ });
      continue;
    }
    const share = Math.max(1, Math.round((src.duration / total) * shotCount));
    const e = src.energy.length ? src.energy : [0.5];
    const samples = e.map((v, i) => ({ t: (i / Math.max(1, e.length - 1)) * src.duration, v }));
    // Peak picking with minimum spacing
    const minGap = Math.max(mood.shot[1] * 1.2, src.duration / (share * 1.5));
    const picked: { t: number; v: number }[] = [];
    const sorted = [...samples].sort((a, b) => b.v - a.v);
    for (const s of sorted) {
      if (picked.length >= share) break;
      if (picked.every((p) => Math.abs(p.t - s.t) >= minGap)) picked.push(s);
    }
    if (!picked.length) picked.push({ t: 0, v: 0.5 });
    picked.sort((a, b) => a.t - b.t);
    for (const p of picked) {
      const len = mood.shot[0] + (mood.shot[1] - mood.shot[0]) * (mood.crescendo ? 1 - p.v * 0.6 : 0.5 + (0.5 - p.v) * 0.4);
      const duration = Math.min(len, src.duration);
      const inPoint = Math.max(0, Math.min(src.duration - duration, p.t - duration * 0.4));
      segments.push({ src, inPoint, duration, energy: p.v, order: order++ });
    }
  }

  // Ordering: crescendo sorts energy ascending with light shuffling; else chronological
  let ordered = segments;
  if (mood.crescendo) {
    ordered = [...segments].sort((a, b) => a.energy - b.energy || a.order - b.order);
  }
  // Fit to target duration by scaling shot lengths
  let sum = ordered.reduce((a, s) => a + s.duration, 0);
  if (sum > target) {
    const k = target / sum;
    for (const s of ordered) s.duration = Math.max(0.4, s.duration * k);
    sum = ordered.reduce((a, s) => a + s.duration, 0);
  }

  const clips: Clip[] = [];
  let t = 0;
  ordered.forEach((seg, i) => {
    // trailer: accelerate — shorten later shots progressively then hold the last
    let dur = seg.duration;
    if (opts.mood === "trailer" && i < ordered.length - 1) dur = Math.max(0.5, dur * (1.15 - (i / ordered.length) * 0.5));
    const trans: TransitionType = i === 0 ? "none" : mood.transition;
    const tdur = i === 0 ? 0 : mood.transitionDur;
    const start = Math.max(0, t - tdur);
    clips.push({
      id: newClipId(),
      assetId: seg.src.assetId,
      kind: seg.src.kind,
      name: seg.src.name,
      track: 0,
      start,
      inPoint: seg.inPoint,
      duration: dur,
      sourceDuration: seg.src.duration,
      speed: 1,
      volume: opts.mood === "musicVideo" ? 0.2 : 1,
      muted: false,
      fadeIn: i === 0 ? 0.5 : 0,
      fadeOut: i === ordered.length - 1 ? 1 : 0,
      opacity: 1,
      transitionIn: { type: trans, duration: tdur },
      grade: { ...DEFAULT_GRADE },
      lookId: null,
      motion: seg.src.kind === "image" ? (i % 2 ? "zoomIn" : "zoomOut") : seg.energy < 0.25 && opts.mood !== "documentary" ? "drift" : "none",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      width: seg.src.width,
      height: seg.src.height,
    });
    t = start + dur;
  });

  if (opts.title) {
    clips.push({
      id: newClipId(),
      assetId: null,
      kind: "title",
      name: "Opening title",
      track: 1,
      start: Math.min(1.2, t * 0.1),
      inPoint: 0,
      duration: Math.min(4.5, Math.max(2.5, t * 0.2)),
      sourceDuration: 0,
      speed: 1,
      volume: 0,
      muted: true,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      transitionIn: { type: "none", duration: 0 },
      grade: { ...DEFAULT_GRADE },
      lookId: null,
      motion: "none",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      title: {
        text: opts.title,
        subtitle: opts.subtitle ?? "",
        font: mood.titleFont,
        size: 6,
        color: "#f3e7c9",
        align: "center",
        position: "center",
        animation: opts.mood === "musicVideo" ? "typewriter" : "tracking",
        background: "none",
      },
    });
    clips.push({
      id: newClipId(),
      assetId: null,
      kind: "title",
      name: "End card",
      track: 1,
      start: Math.max(0, t - 2.5),
      inPoint: 0,
      duration: 2.5,
      sourceDuration: 0,
      speed: 1,
      volume: 0,
      muted: true,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      transitionIn: { type: "none", duration: 0 },
      grade: { ...DEFAULT_GRADE },
      lookId: null,
      motion: "none",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      title: {
        text: opts.title.toUpperCase(),
        subtitle: "An Obsidian Studio production",
        font: "serif",
        size: 3,
        color: "#d4af6a",
        align: "center",
        position: "lower",
        animation: "fade",
        background: "gradient",
      },
    });
  }
  tl.clips = clips;
  return tl;
}
