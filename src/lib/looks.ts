import type { Look } from "./types";

export const BUILTIN_LOOKS: Look[] = [
  {
    id: "natural",
    name: "Natural 709",
    category: "Foundation",
    description: "Clean Rec.709 reference. Faithful color, neutral tone — the honest starting point.",
    grade: {},
    swatch: ["#5b6b7a", "#b7a98f", "#e9e2d3"],
  },
  {
    id: "obsidian-noir",
    name: "Obsidian Noir",
    category: "Signature",
    description: "Deep, polished blacks, restrained saturation and a whisper of champagne in the highlights.",
    grade: {
      contrast: 0.22,
      blacks: -0.25,
      shadows: -0.1,
      saturation: -0.35,
      highlightTintHue: 42,
      highlightTintSat: 0.22,
      shadowTintHue: 220,
      shadowTintSat: 0.12,
      vignette: 0.35,
      vignetteSoft: 0.6,
      grain: 0.08,
      filmic: 0.5,
    },
    swatch: ["#0b0b0f", "#4a4542", "#d9c29a"],
  },
  {
    id: "golden-vision",
    name: "Golden Vision",
    category: "Film Emulation",
    description: "Warm motion-picture negative character — creamy skin, amber mids, soft toe.",
    grade: {
      temperature: 0.22,
      tint: 0.04,
      contrast: 0.1,
      highlights: -0.12,
      shadows: 0.1,
      saturation: 0.08,
      fade: 0.08,
      filmic: 0.7,
      grain: 0.14,
      highlightTintHue: 38,
      highlightTintSat: 0.18,
      shadowTintHue: 200,
      shadowTintSat: 0.08,
      bloom: 0.15,
    },
    swatch: ["#3a2a1c", "#c48b4a", "#f6dcae"],
  },
  {
    id: "teal-amber",
    name: "Blockbuster",
    category: "Commercial",
    description: "The modern tentpole look — teal shadows set against amber skin tones.",
    grade: {
      contrast: 0.18,
      saturation: 0.05,
      vibrance: 0.2,
      shadowTintHue: 190,
      shadowTintSat: 0.42,
      highlightTintHue: 35,
      highlightTintSat: 0.28,
      blacks: -0.1,
      filmic: 0.6,
      sharpen: 0.15,
    },
    swatch: ["#0f3a44", "#1e7f8c", "#f0a64a"],
  },
  {
    id: "bleach",
    name: "Silver Bypass",
    category: "Film Emulation",
    description: "Skip-bleach process: gritty desaturation with punchy contrast and metallic highlights.",
    grade: {
      bleach: 0.75,
      contrast: 0.25,
      saturation: -0.3,
      blacks: -0.15,
      grain: 0.22,
      sharpen: 0.2,
      highlightTintHue: 50,
      highlightTintSat: 0.08,
    },
    swatch: ["#1a1b1b", "#6e6c66", "#d7d2c6"],
  },
  {
    id: "vintage-16",
    name: "Vintage 16mm",
    category: "Film Emulation",
    description: "Faded reversal stock — lifted blacks, warm cast, heavy grain, soft halation.",
    grade: {
      fade: 0.35,
      temperature: 0.18,
      tint: 0.08,
      contrast: -0.08,
      saturation: -0.12,
      grain: 0.5,
      bloom: 0.35,
      sharpen: -0.0,
      vignette: 0.45,
      vignetteSoft: 0.8,
      highlightTintHue: 45,
      highlightTintSat: 0.25,
      shadowTintHue: 150,
      shadowTintSat: 0.1,
    },
    swatch: ["#4b4036", "#a98466", "#e6cfa4"],
  },
  {
    id: "nordic",
    name: "Nordic Pastel",
    category: "Editorial",
    description: "Cool, airy, low-contrast — the Scandinavian fashion editorial palette.",
    grade: {
      temperature: -0.18,
      tint: -0.03,
      contrast: -0.15,
      fade: 0.22,
      saturation: -0.2,
      highlights: -0.15,
      shadows: 0.18,
      shadowTintHue: 215,
      shadowTintSat: 0.18,
      highlightTintHue: 25,
      highlightTintSat: 0.06,
    },
    swatch: ["#6c7f93", "#b9c3cc", "#eef0f1"],
  },
  {
    id: "neon-night",
    name: "Neon Nocturne",
    category: "Stylised",
    description: "Night-city electric — magenta shadows, cyan highlights, saturated and crisp.",
    grade: {
      contrast: 0.2,
      saturation: 0.3,
      vibrance: 0.25,
      shadowTintHue: 300,
      shadowTintSat: 0.4,
      highlightTintHue: 185,
      highlightTintSat: 0.3,
      blacks: -0.12,
      bloom: 0.3,
      sharpen: 0.2,
    },
    swatch: ["#2a0a3a", "#c0268f", "#5ce6ff"],
  },
  {
    id: "monochrome",
    name: "Bergman Mono",
    category: "Monochrome",
    description: "Silver-gelatin monochrome. Rich midtones, deep shadows, no sentimentality.",
    grade: {
      saturation: -1,
      contrast: 0.28,
      blacks: -0.2,
      highlights: -0.05,
      grain: 0.25,
      filmic: 0.5,
      vignette: 0.3,
    },
    swatch: ["#000000", "#6f6f6f", "#f2f2f2"],
  },
  {
    id: "velvet-rose",
    name: "Velvet Rose",
    category: "Signature",
    description: "Romantic diffusion with blush highlights and plum shadows. Luxurious, soft, intimate.",
    grade: {
      bloom: 0.45,
      contrast: -0.05,
      fade: 0.12,
      temperature: 0.1,
      tint: 0.12,
      highlightTintHue: 350,
      highlightTintSat: 0.22,
      shadowTintHue: 280,
      shadowTintSat: 0.2,
      saturation: -0.05,
      vignette: 0.25,
      vignetteSoft: 0.9,
    },
    swatch: ["#3b1f36", "#b96b86", "#f6d6d4"],
  },
  {
    id: "wes-pastel",
    name: "Symmetry Pastel",
    category: "Stylised",
    description: "Candy-box pastels, warm yellows, and storybook flatness.",
    grade: {
      temperature: 0.2,
      tint: -0.05,
      contrast: -0.1,
      saturation: 0.2,
      vibrance: 0.1,
      fade: 0.15,
      highlightTintHue: 52,
      highlightTintSat: 0.25,
      shadowTintHue: 170,
      shadowTintSat: 0.12,
    },
    swatch: ["#7fb3a5", "#f1c15a", "#f8e4c2"],
  },
  {
    id: "desert-heat",
    name: "Desert Heat",
    category: "Narrative",
    description: "Sun-bleached ochre, crushed warm shadows, searing highlights.",
    grade: {
      temperature: 0.35,
      tint: 0.05,
      contrast: 0.2,
      highlights: 0.1,
      whites: 0.08,
      blacks: -0.2,
      saturation: -0.08,
      vibrance: 0.15,
      shadowTintHue: 25,
      shadowTintSat: 0.25,
      highlightTintHue: 48,
      highlightTintSat: 0.2,
      grain: 0.12,
      filmic: 0.6,
    },
    swatch: ["#4a2b16", "#c67a35", "#f5d9a0"],
  },
  {
    id: "arctic-steel",
    name: "Arctic Steel",
    category: "Narrative",
    description: "Clinical thriller palette — steel blue, desaturated flesh, hard edges.",
    grade: {
      temperature: -0.3,
      tint: -0.05,
      contrast: 0.22,
      saturation: -0.3,
      blacks: -0.15,
      shadowTintHue: 210,
      shadowTintSat: 0.35,
      highlightTintHue: 200,
      highlightTintSat: 0.12,
      sharpen: 0.25,
      filmic: 0.4,
    },
    swatch: ["#0f1a26", "#4c6a85", "#c9d6e2"],
  },
  {
    id: "sepia-archive",
    name: "Archive Sepia",
    category: "Monochrome",
    description: "Toned archival print — warm monochrome with gentle fade and dust-era grain.",
    grade: {
      saturation: -1,
      highlightTintHue: 38,
      highlightTintSat: 0.45,
      shadowTintHue: 30,
      shadowTintSat: 0.3,
      fade: 0.18,
      contrast: 0.08,
      grain: 0.35,
      vignette: 0.4,
      vignetteSoft: 0.7,
    },
    swatch: ["#2b1f12", "#8a6a44", "#e2cfa8"],
  },
  {
    id: "moonlit",
    name: "Moonlit Blue",
    category: "Narrative",
    description: "Day-for-night moonlight — cold cyan-blue wash with preserved skin luminance.",
    grade: {
      exposure: -0.6,
      temperature: -0.45,
      tint: -0.02,
      contrast: 0.15,
      saturation: -0.25,
      shadowTintHue: 225,
      shadowTintSat: 0.4,
      highlightTintHue: 205,
      highlightTintSat: 0.2,
      blacks: -0.1,
      vignette: 0.3,
    },
    swatch: ["#070d1c", "#2a4a7a", "#a8c4e4"],
  },
  {
    id: "hdr-pop",
    name: "Luminous HDR",
    category: "Commercial",
    description: "Open shadows, controlled highlights, vibrant yet clean — product and lifestyle ready.",
    grade: {
      shadows: 0.35,
      highlights: -0.3,
      whites: 0.05,
      blacks: -0.05,
      vibrance: 0.3,
      saturation: 0.05,
      sharpen: 0.3,
      contrast: 0.05,
    },
    swatch: ["#2e3f4f", "#4fa3b8", "#ffe7a8"],
  },
  {
    id: "anamorphic",
    name: "Anamorphic Dream",
    category: "Signature",
    description: "Wide-screen romance: soft bloom, blue-leaning blacks, golden skin, gentle grain.",
    grade: {
      bloom: 0.3,
      contrast: 0.1,
      fade: 0.06,
      saturation: 0.05,
      shadowTintHue: 230,
      shadowTintSat: 0.22,
      highlightTintHue: 40,
      highlightTintSat: 0.2,
      grain: 0.1,
      vignette: 0.25,
      vignetteSoft: 0.7,
      filmic: 0.6,
    },
    swatch: ["#131a2e", "#5a6c9c", "#f2d4a0"],
  },
  {
    id: "overcast-film",
    name: "Overcast Film",
    category: "Documentary",
    description: "Muted, truthful documentary tone with gentle warmth to lift grey days.",
    grade: {
      temperature: 0.08,
      contrast: 0.05,
      saturation: -0.1,
      shadows: 0.12,
      highlights: -0.1,
      filmic: 0.5,
      grain: 0.1,
      highlightTintHue: 40,
      highlightTintSat: 0.08,
    },
    swatch: ["#3d4044", "#8b8f8e", "#e0dcd2"],
  },
];

export const LOOK_CATEGORIES = Array.from(new Set(BUILTIN_LOOKS.map((l) => l.category)));

export function findLook(id: string | null | undefined, extra: Look[] = []): Look | undefined {
  if (!id) return undefined;
  return BUILTIN_LOOKS.find((l) => l.id === id) ?? extra.find((l) => l.id === id);
}


/** Compatibility exports used by the capture and monitor interfaces. */
export const LOOKS = BUILTIN_LOOKS;

export function getLook(id: string | null | undefined): Look | undefined {
  return findLook(id);
}

export type ResolvedGrade = {
  exposure: number; contrast: number; pivot: number; saturation: number; vibrance: number;
  temperature: number; tint: number; highlights: number; shadows: number; hue: number;
  lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number];
  slope: [number, number, number]; offset: [number, number, number]; power: [number, number, number];
  splitShadow: [number, number, number]; splitHigh: [number, number, number];
  fade: number; vignette: number; grain: number; sharpen: number; halation: number;
  bloom: number; chromatic: number; mono: boolean;
};

function tintVector(hue: number, amount: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const c = 1;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return rgb.map((v) => (v - luma) * amount) as [number, number, number];
}

/** Convert the capture/editor grade model into the uniforms consumed by GradeRenderer. */
export function resolveGrade(input: Partial<Grade> | null | undefined): ResolvedGrade {
  const g = { ...DEFAULT_GRADE, ...(input ?? {}) };
  const shadow = tintVector(g.shadowTintHue, g.shadowTintSat);
  const high = tintVector(g.highlightTintHue, g.highlightTintSat);
  const exposure = Number.isFinite(g.exposure) ? g.exposure : 0;
  const contrast = Math.max(0.05, 1 + g.contrast);
  const saturation = Math.max(0, 1 + g.saturation);
  const lift = [g.blacks * 0.12, g.blacks * 0.12, g.blacks * 0.12] as [number, number, number];
  const gain = [1 + g.whites * 0.12, 1 + g.whites * 0.12, 1 + g.whites * 0.12] as [number, number, number];
  const gammaValue = Math.max(0.05, 1 - g.shadows * 0.12);
  return {
    exposure, contrast, pivot: 0.45, saturation, vibrance: g.vibrance,
    temperature: g.temperature, tint: g.tint, highlights: g.highlights, shadows: g.shadows,
    hue: g.hue, lift, gamma: [gammaValue, gammaValue, gammaValue], gain,
    slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1],
    splitShadow: shadow, splitHigh: high, fade: g.fade, vignette: g.vignette,
    grain: g.grain, sharpen: g.sharpen, halation: g.bloom, bloom: g.bloom,
    chromatic: 0, mono: g.saturation <= -1,
  };
}

/** Wheel coordinates are normalized around neutral and weighted by the master amount. */
export function wheelToRgb(wheel: { x: number; y: number; m: number }, _exposure = 1, _saturation = 1): [number, number, number] {
  const radius = Math.min(1, Math.hypot(wheel.x, wheel.y));
  if (!radius || !Number.isFinite(radius)) return [0, 0, 0];
  const hue = (Math.atan2(wheel.y, wheel.x) * 180 / Math.PI + 360) % 360;
  const rgb = tintVector(hue, radius * Math.max(-1, Math.min(1, wheel.m)));
  return rgb;
}
