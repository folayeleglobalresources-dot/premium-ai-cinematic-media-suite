export type Grade = {
  exposure: number; // -3..3 stops
  contrast: number; // -1..1
  highlights: number; // -1..1
  shadows: number; // -1..1
  whites: number; // -1..1
  blacks: number; // -1..1
  saturation: number; // -1..1
  vibrance: number; // -1..1
  temperature: number; // -1 (cool) .. 1 (warm)
  tint: number; // -1 (green) .. 1 (magenta)
  hue: number; // -180..180 degrees
  fade: number; // 0..1 lifted blacks
  vignette: number; // 0..1
  vignetteSoft: number; // 0..1
  grain: number; // 0..1
  sharpen: number; // 0..1
  bloom: number; // 0..1 (halation / diffusion)
  filmic: number; // 0..1 filmic tone curve blend
  bleach: number; // 0..1 bleach bypass
  shadowTintHue: number; // 0..360
  shadowTintSat: number; // 0..1
  highlightTintHue: number; // 0..360
  highlightTintSat: number; // 0..1
  lutIntensity: number; // 0..1
  look?: string | null; // selected creative look preset, stored alongside numeric grade controls
};

export const DEFAULT_GRADE: Grade = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  fade: 0,
  vignette: 0,
  vignetteSoft: 0.5,
  grain: 0,
  sharpen: 0,
  bloom: 0,
  filmic: 0,
  bleach: 0,
  shadowTintHue: 210,
  shadowTintSat: 0,
  highlightTintHue: 40,
  highlightTintSat: 0,
  lutIntensity: 1,
};

export type NumericGradeKey = Exclude<keyof Grade, "look">;
export const GRADE_KEYS = Object.keys(DEFAULT_GRADE) as NumericGradeKey[];

export type GradeControl = {
  key: NumericGradeKey;
  label: string;
  min: number;
  max: number;
  step: number;
  group: "Light" | "Color" | "Texture" | "Film" | "Tone";
};

export const GRADE_CONTROLS: GradeControl[] = [
  { key: "exposure", label: "Exposure", min: -3, max: 3, step: 0.01, group: "Light" },
  { key: "contrast", label: "Contrast", min: -1, max: 1, step: 0.01, group: "Light" },
  { key: "highlights", label: "Highlights", min: -1, max: 1, step: 0.01, group: "Light" },
  { key: "shadows", label: "Shadows", min: -1, max: 1, step: 0.01, group: "Light" },
  { key: "whites", label: "Whites", min: -1, max: 1, step: 0.01, group: "Light" },
  { key: "blacks", label: "Blacks", min: -1, max: 1, step: 0.01, group: "Light" },
  { key: "temperature", label: "Temperature", min: -1, max: 1, step: 0.01, group: "Color" },
  { key: "tint", label: "Tint", min: -1, max: 1, step: 0.01, group: "Color" },
  { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01, group: "Color" },
  { key: "vibrance", label: "Vibrance", min: -1, max: 1, step: 0.01, group: "Color" },
  { key: "hue", label: "Hue Rotate", min: -180, max: 180, step: 1, group: "Color" },
  { key: "shadowTintHue", label: "Shadow Tone Hue", min: 0, max: 360, step: 1, group: "Tone" },
  { key: "shadowTintSat", label: "Shadow Tone Amount", min: 0, max: 1, step: 0.01, group: "Tone" },
  { key: "highlightTintHue", label: "Highlight Tone Hue", min: 0, max: 360, step: 1, group: "Tone" },
  { key: "highlightTintSat", label: "Highlight Tone Amount", min: 0, max: 1, step: 0.01, group: "Tone" },
  { key: "filmic", label: "Filmic Curve", min: 0, max: 1, step: 0.01, group: "Film" },
  { key: "fade", label: "Fade", min: 0, max: 1, step: 0.01, group: "Film" },
  { key: "bleach", label: "Bleach Bypass", min: 0, max: 1, step: 0.01, group: "Film" },
  { key: "bloom", label: "Halation", min: 0, max: 1, step: 0.01, group: "Film" },
  { key: "grain", label: "Film Grain", min: 0, max: 1, step: 0.01, group: "Texture" },
  { key: "sharpen", label: "Sharpen", min: 0, max: 1, step: 0.01, group: "Texture" },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.01, group: "Texture" },
  { key: "vignetteSoft", label: "Vignette Feather", min: 0, max: 1, step: 0.01, group: "Texture" },
];

export type Look = {
  id: string;
  name: string;
  category: string;
  description: string;
  grade: Partial<Grade>;
  swatch: [string, string, string];
  cubeText?: string | null;
};

export function mergeGrade(base: Grade, partial?: Partial<Grade> | null): Grade {
  if (!partial) return { ...base };
  const out: Grade = { ...base };
  for (const k of GRADE_KEYS) {
    const v = partial[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function lerpGrade(a: Grade, b: Grade, t: number): Grade {
  const out: Grade = { ...a };
  for (const k of GRADE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function addGrade(a: Grade, b: Partial<Grade>): Grade {
  const out: Grade = { ...a };
  for (const k of GRADE_KEYS) {
    const v = b[k];
    if (typeof v !== "number") continue;
    if (k === "lutIntensity" || k === "vignetteSoft" || k.endsWith("Hue")) out[k] = v;
    else out[k] = a[k] + v;
  }
  return out;
}

export type MonitorOptions = {
  zebra: boolean;
  zebraLevel: number; // 0..1
  falseColor: boolean;
  peaking: boolean;
  peakLevel: number; // 0..1
  digitalGain: number; // stops (digital ISO)
};

export const DEFAULT_MONITOR: MonitorOptions = {
  zebra: false,
  zebraLevel: 0.95,
  falseColor: false,
  peaking: false,
  peakLevel: 0.25,
  digitalGain: 0,
};

export type TransitionType = "none" | "dissolve" | "dipBlack" | "dipWhite" | "wipe" | "slide";
export type MotionPreset = "none" | "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "drift";

export type TitleStyle = {
  text: string;
  subtitle: string;
  font: "serif" | "sans" | "mono";
  size: number; // relative 1..10
  color: string;
  align: "left" | "center" | "right";
  position: "upper" | "center" | "lower";
  animation: "none" | "fade" | "rise" | "tracking" | "typewriter";
  background: "none" | "bar" | "box" | "gradient";
};

export type Clip = {
  id: string;
  assetId: number | null;
  kind: "video" | "image" | "audio" | "title";
  name: string;
  track: number; // 0 = V1, 1 = V2 (overlay), 2 = A1
  start: number; // seconds on timeline
  inPoint: number; // seconds into source
  duration: number; // seconds on timeline
  sourceDuration: number; // seconds, 0 if unknown
  speed: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  opacity: number;
  transitionIn: { type: TransitionType; duration: number };
  grade: Grade;
  lookId: string | null;
  motion: MotionPreset;
  scale: number;
  x: number;
  y: number;
  rotation: number;
  title?: TitleStyle;
  width?: number;
  height?: number;
};

export type TimelineData = {
  version: 1;
  fps: number;
  width: number;
  height: number;
  clips: Clip[];
  masterVolume: number;
  masterGrade: Grade;
  masterLookId: string | null;
  letterbox: "none" | "2.39" | "1.85" | "4:3";
};

export function emptyTimeline(width = 1920, height = 1080, fps = 24): TimelineData {
  return {
    version: 1,
    fps,
    width,
    height,
    clips: [],
    masterVolume: 1,
    masterGrade: { ...DEFAULT_GRADE },
    masterLookId: null,
    letterbox: "none",
  };
}

export function newClipId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function timelineDuration(t: TimelineData) {
  return t.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export type AssetDTO = {
  id: number;
  projectId: number | null;
  name: string;
  kind: "video" | "image" | "audio";
  mime: string;
  size: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  lookId: string | null;
  tags: string[];
  favorite: boolean;
  source: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  hasThumb: boolean;
};

export type AppSettings = {
  resolution: "720p" | "1080p" | "1440p" | "4k" | "8k";
  fps: number;
  codec: string;
  bitrateMbps: number;
  recordMode: "look" | "clean";
  frameGuide: string;
  grid: "none" | "thirds" | "golden" | "center";
  zebra: boolean;
  zebraLevel: number;
  peaking: boolean;
  falseColor: boolean;
  scopes: boolean;
  timecodeMode: "record" | "clock";
  accent: "gold" | "platinum" | "rose";
  whipEndpoint: string;
  whipToken: string;
  defaultLook: string;
  autoSave: boolean;
  mirrorPreview: boolean;
  projectFps: number;
  projectResolution: "1080p" | "4k";
  reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  resolution: "1080p",
  fps: 30,
  codec: "auto",
  bitrateMbps: 25,
  recordMode: "look",
  frameGuide: "none",
  grid: "none",
  zebra: false,
  zebraLevel: 0.95,
  peaking: false,
  falseColor: false,
  scopes: true,
  timecodeMode: "record",
  accent: "gold",
  whipEndpoint: "",
  whipToken: "",
  defaultLook: "natural",
  autoSave: true,
  mirrorPreview: false,
  projectFps: 24,
  projectResolution: "1080p",
  reduceMotion: false,
};


/** Color-wheel control used by the capture UI. */
export type Wheel = { x: number; y: number; m: number };

/** Legacy factory retained for camera-engine callers. */
export function defaultGrade(): Grade {
  return { ...DEFAULT_GRADE };
}


/** Browser-local media record synchronized with the server asset registry. */
export type AssetMeta = {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
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
};
