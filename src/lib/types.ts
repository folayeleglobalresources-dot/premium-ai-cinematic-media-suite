import { uid } from "./utils";

/* ───────────────────────── Color science ───────────────────────── */

export interface Wheel {
  /** puck position in the unit disk (x → hue direction, y) */
  x: number;
  y: number;
  /** master ring (luminance) */
  m: number;
}

export interface Grade {
  exposure: number; // stops  -4..4
  contrast: number; // 0.4..2
  pivot: number; // 0.2..0.7
  saturation: number; // 0..2
  vibrance: number; // -1..1
  temperature: number; // -1..1
  tint: number; // -1..1
  highlights: number; // -1..1
  shadows: number; // -1..1
  hue: number; // -180..180
  lift: Wheel;
  gamma: Wheel;
  gain: Wheel;
  // ASC CDL (Slope / Offset / Power) — industry interchange standard
  slope: [number, number, number];
  offset: [number, number, number];
  power: [number, number, number];
  splitShadowHue: number;
  splitShadowAmt: number;
  splitHighHue: number;
  splitHighAmt: number;
  fade: number; // 0..1 matte blacks
  vignette: number; // 0..1
  grain: number; // 0..1
  sharpen: number; // 0..1
  halation: number; // 0..1
  bloom: number; // 0..1
  chromatic: number; // 0..1
  mono: boolean;
  look: string | null;
  lookAmount: number; // 0..1
}

export const neutralWheel = (): Wheel => ({ x: 0, y: 0, m: 0 });

export function defaultGrade(): Grade {
  return {
    exposure: 0,
    contrast: 1,
    pivot: 0.45,
    saturation: 1,
    vibrance: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    hue: 0,
    lift: neutralWheel(),
    gamma: neutralWheel(),
    gain: neutralWheel(),
    slope: [1, 1, 1],
    offset: [0, 0, 0],
    power: [1, 1, 1],
    splitShadowHue: 200,
    splitShadowAmt: 0,
    splitHighHue: 35,
    splitHighAmt: 0,
    fade: 0,
    vignette: 0,
    grain: 0,
    sharpen: 0,
    halation: 0,
    bloom: 0,
    chromatic: 0,
    mono: false,
    look: null,
    lookAmount: 1,
  };
}

/* ───────────────────────── Timeline ───────────────────────── */

export type TrackKind = "video" | "audio" | "text";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  solo: boolean;
  volume: number;
}

export type TransitionType =
  | "dissolve"
  | "dip-black"
  | "dip-white"
  | "wipe-left"
  | "wipe-right"
  | "slide-up"
  | "zoom"
  | "blur"
  | "iris"
  | "flash"
  | "glitch";

export interface Transition {
  type: TransitionType;
  duration: number;
}

export type MotionPreset =
  | "none"
  | "kenburns-in"
  | "kenburns-out"
  | "pan-left"
  | "pan-right"
  | "drift-up"
  | "handheld"
  | "punch-in";

export type TitlePreset =
  | "cinematic"
  | "epic"
  | "lower-third"
  | "chapter"
  | "credits"
  | "subtitle"
  | "neon"
  | "minimal"
  | "documentary"
  | "kinetic";

export type TitleAnimation = "fade" | "rise" | "tracking" | "typewriter" | "zoom" | "blur" | "wipe" | "none";

export interface TitleSpec {
  text: string;
  subtitle: string;
  preset: TitlePreset;
  font: string;
  size: number; // relative to frame height (0.02..0.3)
  color: string;
  accent: string;
  align: "left" | "center" | "right";
  x: number; // 0..1
  y: number; // 0..1
  animation: TitleAnimation;
  tracking: number; // letter spacing in em
  weight: number;
  italic: boolean;
  shadow: boolean;
  box: boolean;
  uppercase: boolean;
}

export type ClipKind = "video" | "audio" | "image" | "title" | "solid";

export interface ClipTransform {
  x: number; // offset as fraction of frame width
  y: number;
  scale: number;
  rotation: number; // degrees
  fit: "contain" | "cover" | "fill";
  flipH: boolean;
  cropTop: number;
  cropBottom: number;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  assetId?: string;
  name: string;
  start: number;
  duration: number;
  sourceIn: number;
  speed: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  opacity: number;
  blend: GlobalCompositeOperation;
  transform: ClipTransform;
  motion: MotionPreset;
  grade: Grade;
  transitionIn: Transition | null;
  title?: TitleSpec;
  color?: string;
  reframe?: { x: number; y: number } | null;
  label?: string;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface Finishing {
  letterbox: number | null; // target aspect, e.g. 2.39
  grain: number;
  vignette: number;
  captionsVisible: boolean;
  captionStyle: "cinema" | "social" | "broadcast";
  background: string;
}

export interface Timeline {
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  captions: Caption[];
  finishing: Finishing;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  aspect: string;
}

export interface ProjectDoc extends ProjectSettings {
  id: string;
  name: string;
  logline: string;
  timeline: Timeline;
  poster: string | null;
  status: string;
  durationSec: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetMeta {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  mime: string;
  source: string;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
  thumbnail: string | null;
  filmstrip: string[];
  peaks: number[];
  slate: Record<string, string>;
  tags: string[];
  analysis: Record<string, unknown>;
  captions: { start: number; end: number; text: string }[];
  rating: number;
  favorite: boolean;
  projectId: string | null;
  createdAt: string;
}

export function defaultTitle(preset: TitlePreset = "cinematic", text = "LUMIÈRE"): TitleSpec {
  const base: TitleSpec = {
    text,
    subtitle: "",
    preset,
    font: "Cormorant Garamond",
    size: 0.11,
    color: "#F4ECDD",
    accent: "#D8B57A",
    align: "center",
    x: 0.5,
    y: 0.5,
    animation: "tracking",
    tracking: 0.32,
    weight: 500,
    italic: false,
    shadow: true,
    box: false,
    uppercase: true,
  };
  switch (preset) {
    case "epic":
      return { ...base, font: "Cinzel", size: 0.13, tracking: 0.42, animation: "zoom", weight: 600 };
    case "lower-third":
      return { ...base, font: "Manrope", size: 0.045, align: "left", x: 0.08, y: 0.8, animation: "wipe", tracking: 0.08, uppercase: false, weight: 700, box: true, subtitle: "Director of Photography" };
    case "chapter":
      return { ...base, font: "Cormorant Garamond", size: 0.085, italic: true, uppercase: false, tracking: 0.04, animation: "blur", subtitle: "CHAPTER ONE" };
    case "credits":
      return { ...base, font: "Manrope", size: 0.04, tracking: 0.28, animation: "rise", weight: 600, subtitle: "Directed by" };
    case "subtitle":
      return { ...base, font: "Manrope", size: 0.042, y: 0.86, tracking: 0, uppercase: false, animation: "fade", weight: 600, box: false };
    case "neon":
      return { ...base, font: "Monoton", size: 0.1, color: "#FF4FD8", accent: "#36E8FF", tracking: 0.12, animation: "fade", weight: 400 };
    case "minimal":
      return { ...base, font: "Manrope", size: 0.05, tracking: 0.55, weight: 300, animation: "fade", shadow: false };
    case "documentary":
      return { ...base, font: "JetBrains Mono", size: 0.035, align: "left", x: 0.08, y: 0.12, tracking: 0.1, animation: "typewriter", uppercase: true, weight: 500, subtitle: "LOCATION · 05:42 AM" };
    case "kinetic":
      return { ...base, font: "Bebas Neue", size: 0.16, tracking: 0.06, animation: "rise", weight: 400, color: "#FFFFFF", accent: "#E8C27A" };
    default:
      return base;
  }
}

export function defaultTransform(): ClipTransform {
  return { x: 0, y: 0, scale: 1, rotation: 0, fit: "contain", flipH: false, cropTop: 0, cropBottom: 0 };
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "trackId" | "kind" | "name" | "start" | "duration">): Clip {
  return {
    id: uid("clip"),
    sourceIn: 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    opacity: 1,
    blend: "source-over",
    transform: defaultTransform(),
    motion: "none",
    grade: defaultGrade(),
    transitionIn: null,
    reframe: null,
    ...partial,
  };
}

export function defaultTimeline(): Timeline {
  return {
    tracks: [
      { id: "V3", kind: "text", name: "Titles", muted: false, locked: false, hidden: false, solo: false, volume: 1 },
      { id: "V2", kind: "video", name: "V2 · Overlay", muted: false, locked: false, hidden: false, solo: false, volume: 1 },
      { id: "V1", kind: "video", name: "V1 · Picture", muted: false, locked: false, hidden: false, solo: false, volume: 1 },
      { id: "A1", kind: "audio", name: "A1 · Dialogue", muted: false, locked: false, hidden: false, solo: false, volume: 1 },
      { id: "A2", kind: "audio", name: "A2 · Score", muted: false, locked: false, hidden: false, solo: false, volume: 0.8 },
    ],
    clips: [],
    markers: [],
    captions: [],
    finishing: {
      letterbox: null,
      grain: 0,
      vignette: 0,
      captionsVisible: true,
      captionStyle: "cinema",
      background: "#000000",
    },
  };
}

export function normalizeTimeline(raw: unknown): Timeline {
  const base = defaultTimeline();
  if (!raw || typeof raw !== "object") return base;
  const t = raw as Partial<Timeline>;
  return {
    tracks: Array.isArray(t.tracks) && t.tracks.length ? t.tracks : base.tracks,
    clips: Array.isArray(t.clips)
      ? t.clips.map((c) => ({ ...makeClip(c), ...c, grade: { ...defaultGrade(), ...(c.grade ?? {}) }, transform: { ...defaultTransform(), ...(c.transform ?? {}) } }))
      : [],
    markers: Array.isArray(t.markers) ? t.markers : [],
    captions: Array.isArray(t.captions) ? t.captions : [],
    finishing: { ...base.finishing, ...(t.finishing ?? {}) },
  };
}

export function timelineDuration(t: Timeline): number {
  return t.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

/* ───────────────────────── Formats ───────────────────────── */

export interface FormatPreset {
  id: string;
  label: string;
  group: string;
  width: number;
  height: number;
  fps: number;
  aspect: string;
  note: string;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  { id: "dci4k", label: "DCI 4K Cinema", group: "Cinema", width: 4096, height: 2160, fps: 24, aspect: "1.90:1", note: "Digital Cinema Initiatives · theatrical" },
  { id: "uhd", label: "UHD 4K", group: "Cinema", width: 3840, height: 2160, fps: 24, aspect: "16:9", note: "Streaming masters · Netflix / Prime" },
  { id: "scope", label: "Anamorphic Scope", group: "Cinema", width: 1920, height: 804, fps: 24, aspect: "2.39:1", note: "Widescreen epic · Panavision" },
  { id: "flat", label: "Flat 1.85", group: "Cinema", width: 1998, height: 1080, fps: 24, aspect: "1.85:1", note: "Theatrical flat" },
  { id: "imax", label: "IMAX 1.43", group: "Cinema", width: 1544, height: 1080, fps: 24, aspect: "1.43:1", note: "Large-format immersive" },
  { id: "hd", label: "Full HD", group: "Broadcast", width: 1920, height: 1080, fps: 25, aspect: "16:9", note: "Broadcast / YouTube" },
  { id: "hd60", label: "Full HD 60", group: "Broadcast", width: 1920, height: 1080, fps: 60, aspect: "16:9", note: "Sports · gaming · motion" },
  { id: "hd720", label: "HD 720p", group: "Broadcast", width: 1280, height: 720, fps: 30, aspect: "16:9", note: "Lightweight delivery" },
  { id: "vertical", label: "Vertical 9:16", group: "Social", width: 1080, height: 1920, fps: 30, aspect: "9:16", note: "TikTok · Reels · Shorts" },
  { id: "portrait", label: "Portrait 4:5", group: "Social", width: 1080, height: 1350, fps: 30, aspect: "4:5", note: "Instagram feed" },
  { id: "square", label: "Square 1:1", group: "Social", width: 1080, height: 1080, fps: 30, aspect: "1:1", note: "Feeds & carousels" },
  { id: "academy", label: "Academy 4:3", group: "Vintage", width: 1440, height: 1080, fps: 24, aspect: "4:3", note: "Classic & archival" },
];

export const LETTERBOX_RATIOS = [
  { label: "Off", value: null },
  { label: "1.85", value: 1.85 },
  { label: "2.00", value: 2.0 },
  { label: "2.39", value: 2.39 },
  { label: "2.76", value: 2.76 },
] as const;

export const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: "dissolve", label: "Cross Dissolve" },
  { id: "dip-black", label: "Dip to Black" },
  { id: "dip-white", label: "Dip to White" },
  { id: "wipe-left", label: "Wipe Left" },
  { id: "wipe-right", label: "Wipe Right" },
  { id: "slide-up", label: "Slide Up" },
  { id: "zoom", label: "Zoom Through" },
  { id: "blur", label: "Blur Dissolve" },
  { id: "iris", label: "Iris" },
  { id: "flash", label: "Flash Frame" },
  { id: "glitch", label: "Digital Glitch" },
];

export const MOTIONS: { id: MotionPreset; label: string }[] = [
  { id: "none", label: "Locked-off" },
  { id: "kenburns-in", label: "Ken Burns In" },
  { id: "kenburns-out", label: "Ken Burns Out" },
  { id: "pan-left", label: "Pan Left" },
  { id: "pan-right", label: "Pan Right" },
  { id: "drift-up", label: "Crane Up" },
  { id: "handheld", label: "Handheld" },
  { id: "punch-in", label: "Punch-in" },
];

export const TITLE_PRESETS: { id: TitlePreset; label: string; hint: string }[] = [
  { id: "cinematic", label: "Cinematic", hint: "Tracked serif · opening title" },
  { id: "epic", label: "Epic", hint: "Roman capitals · trailer" },
  { id: "chapter", label: "Chapter", hint: "Italic serif · act break" },
  { id: "lower-third", label: "Lower Third", hint: "Name & role · interviews" },
  { id: "credits", label: "Credits", hint: "Role / name pairing" },
  { id: "documentary", label: "Documentary", hint: "Typewriter slug line" },
  { id: "kinetic", label: "Kinetic", hint: "Bold condensed · promos" },
  { id: "neon", label: "Neon", hint: "Retro glow · music video" },
  { id: "minimal", label: "Minimal", hint: "Ultra-light spaced" },
  { id: "subtitle", label: "Subtitle", hint: "Dialogue caption" },
];

export const TITLE_FONTS = [
  "Cormorant Garamond",
  "Cinzel",
  "Playfair Display",
  "Manrope",
  "Bebas Neue",
  "JetBrains Mono",
  "Monoton",
  "Italiana",
];
