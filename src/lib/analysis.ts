import type { Grade } from "./types";

export type FrameStats = {
  w: number;
  h: number;
  meanLuma: number;
  std: number;
  p1: number;
  p5: number;
  p50: number;
  p95: number;
  p99: number;
  clipLow: number;
  clipHigh: number;
  meanR: number;
  meanG: number;
  meanB: number;
  satMean: number;
  colorfulness: number;
  castTemp: number;
  castTint: number;
  edgeDensity: number;
  hueHist: number[];
  hist: number[];
  skinRatio: number;
  darkRatio: number;
  brightRatio: number;
  dynamicRange: number;
  thirds: { left: number; center: number; right: number; top: number; middle: number; bottom: number };
  motion?: number;
};

export const HUE_NAMES = [
  "red", "orange", "yellow", "lime", "green", "mint", "cyan", "azure", "blue", "violet", "magenta", "rose",
];

export function computeStats(data: Uint8ClampedArray, w: number, h: number): FrameStats {
  const n = w * h;
  const lum = new Float32Array(n);
  let sumL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;
  let skin = 0;
  const hist = new Array(32).fill(0);
  const hueHist = new Array(12).fill(0);
  const thirds = { left: 0, center: 0, right: 0, top: 0, middle: 0, bottom: 0 };
  const tc = { left: 0, center: 0, right: 0, top: 0, middle: 0, bottom: 0 };
  let rgSum = 0;
  let ybSum = 0;
  let rgSq = 0;
  let ybSq = 0;

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = L;
    sumL += L;
    sumR += r;
    sumG += g;
    sumB += b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    sumSat += sat;
    hist[Math.min(31, Math.floor(L * 32))]++;
    if (sat > 0.18 && mx > 0.08) {
      let hue = 0;
      const d = mx - mn;
      if (d > 0) {
        if (mx === r) hue = ((g - b) / d) % 6;
        else if (mx === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        hue = (hue * 60 + 360) % 360;
      }
      hueHist[Math.floor(hue / 30) % 12] += sat;
    }
    const R = data[i * 4];
    const G = data[i * 4 + 1];
    const B = data[i * 4 + 2];
    if (R > 95 && G > 40 && B > 20 && R - Math.min(G, B) > 15 && Math.abs(R - G) > 15 && R > G && R > B) skin++;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg;
    ybSum += yb;
    rgSq += rg * rg;
    ybSq += yb * yb;
    const x = i % w;
    const y = Math.floor(i / w);
    if (x < w / 3) {
      thirds.left += L;
      tc.left++;
    } else if (x < (2 * w) / 3) {
      thirds.center += L;
      tc.center++;
    } else {
      thirds.right += L;
      tc.right++;
    }
    if (y < h / 3) {
      thirds.top += L;
      tc.top++;
    } else if (y < (2 * h) / 3) {
      thirds.middle += L;
      tc.middle++;
    } else {
      thirds.bottom += L;
      tc.bottom++;
    }
  }
  const meanLuma = sumL / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (lum[i] - meanLuma) ** 2;
  const std = Math.sqrt(varSum / n);
  const sorted = Float32Array.from(lum).sort();
  const pct = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))];
  let clipLow = 0;
  let clipHigh = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < n; i++) {
    if (lum[i] < 0.02) clipLow++;
    if (lum[i] > 0.98) clipHigh++;
    if (lum[i] < 0.2) dark++;
    if (lum[i] > 0.8) bright++;
  }
  let edges = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + w] - lum[i - w];
      if (Math.sqrt(gx * gx + gy * gy) > 0.12) edges++;
    }
  }
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  const rgStd = Math.sqrt(Math.max(0, rgSq / n - (rgSum / n) ** 2));
  const ybStd = Math.sqrt(Math.max(0, ybSq / n - (ybSum / n) ** 2));
  const colorfulness = Math.sqrt(rgStd ** 2 + ybStd ** 2) + 0.3 * Math.sqrt((rgSum / n) ** 2 + (ybSum / n) ** 2);
  const hueTotal = hueHist.reduce((a, b) => a + b, 0) || 1;
  return {
    w,
    h,
    meanLuma,
    std,
    p1: pct(0.01),
    p5: pct(0.05),
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    clipLow: clipLow / n,
    clipHigh: clipHigh / n,
    meanR,
    meanG,
    meanB,
    satMean: sumSat / n,
    colorfulness,
    castTemp: (meanR - meanB) / (meanR + meanB + 1e-6),
    castTint: (meanG - (meanR + meanB) / 2) / (meanR + meanG + meanB + 1e-6) * 3,
    edgeDensity: edges / Math.max(1, (w - 2) * (h - 2)),
    hueHist: hueHist.map((v) => v / hueTotal),
    hist: hist.map((v) => v / n),
    skinRatio: skin / n,
    darkRatio: dark / n,
    brightRatio: bright / n,
    dynamicRange: pct(0.99) - pct(0.01),
    thirds: {
      left: thirds.left / Math.max(1, tc.left),
      center: thirds.center / Math.max(1, tc.center),
      right: thirds.right / Math.max(1, tc.right),
      top: thirds.top / Math.max(1, tc.top),
      middle: thirds.middle / Math.max(1, tc.middle),
      bottom: thirds.bottom / Math.max(1, tc.bottom),
    },
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Data-driven automatic correction derived from the measured frame. */
export function suggestGrade(s: FrameStats): { grade: Partial<Grade>; reasons: string[] } {
  const g: Partial<Grade> = {};
  const reasons: string[] = [];
  let ev = Math.log2(0.4 / Math.max(0.02, s.meanLuma));
  if (s.clipHigh > 0.02) ev = Math.min(ev, -0.2 - s.clipHigh * 4);
  if (s.darkRatio > 0.6 && s.clipHigh < 0.005) ev = Math.max(ev, 0.2);
  ev = clamp(ev * 0.7, -1.6, 1.6);
  if (Math.abs(ev) > 0.12) {
    g.exposure = +ev.toFixed(2);
    reasons.push(`${ev > 0 ? "Lift" : "Pull"} exposure ${Math.abs(ev).toFixed(2)} stops — mean luminance sits at ${(s.meanLuma * 100).toFixed(0)}% against a 40% reference.`);
  }
  if (Math.abs(s.castTemp) > 0.035) {
    const t = clamp(-s.castTemp * 1.6, -0.6, 0.6);
    g.temperature = +t.toFixed(2);
    reasons.push(`Neutralise a ${s.castTemp > 0 ? "warm" : "cool"} cast (R/B imbalance ${(s.castTemp * 100).toFixed(1)}%) with a ${t > 0 ? "warmer" : "cooler"} balance.`);
  }
  if (Math.abs(s.castTint) > 0.03) {
    const t = clamp(-s.castTint * 1.4, -0.4, 0.4);
    g.tint = +t.toFixed(2);
    reasons.push(`Offset a ${s.castTint > 0 ? "green" : "magenta"} tint bias common to ${s.castTint > 0 ? "fluorescent and LED" : "mixed tungsten"} sources.`);
  }
  if (s.std < 0.13) {
    g.contrast = +clamp((0.16 - s.std) * 2.2, 0.08, 0.35).toFixed(2);
    reasons.push(`The image is flat (σ = ${(s.std * 100).toFixed(1)}): add contrast to restore depth and separation.`);
  } else if (s.std > 0.3) {
    g.contrast = -0.1;
    reasons.push(`Contrast is already aggressive (σ = ${(s.std * 100).toFixed(1)}): soften slightly to protect tonal roll-off.`);
  }
  if (s.clipHigh > 0.015) {
    g.highlights = -clamp(0.2 + s.clipHigh * 6, 0.2, 0.6);
    g.whites = -0.08;
    reasons.push(`${(s.clipHigh * 100).toFixed(1)}% of pixels are clipped — recover highlights and lower the white point.`);
  }
  if (s.clipLow > 0.08 || (s.darkRatio > 0.4 && s.p5 < 0.03)) {
    g.shadows = +clamp(0.15 + s.clipLow * 2, 0.15, 0.4).toFixed(2);
    g.blacks = 0.06;
    reasons.push(`Shadows are crushed (${(s.clipLow * 100).toFixed(1)}% near black): open them gently to retain texture.`);
  }
  if (s.satMean < 0.12 && s.colorfulness < 0.12) {
    g.vibrance = 0.22;
    reasons.push("Colour is anaemic — vibrance rebuilds chroma in the muted tones without pushing skin.");
  } else if (s.satMean > 0.45) {
    g.saturation = -0.15;
    reasons.push("Saturation runs hot — ease it so skin and broadcast-safe limits hold.");
  }
  if (s.edgeDensity < 0.04) {
    g.sharpen = 0.2;
    reasons.push("Low micro-contrast detected — a touch of sharpening restores perceived focus.");
  }
  if (s.skinRatio > 0.06 && g.saturation === undefined) {
    g.vibrance = (g.vibrance ?? 0) + 0.05;
  }
  return { grade: g, reasons };
}

/** Derive a grade that moves `src` statistics toward `ref` statistics (shot matching). */
export function matchGrade(src: FrameStats, ref: FrameStats): { grade: Partial<Grade>; summary: string[] } {
  const g: Partial<Grade> = {};
  const summary: string[] = [];
  const ev = clamp(Math.log2(Math.max(0.02, ref.meanLuma) / Math.max(0.02, src.meanLuma)), -2, 2);
  if (Math.abs(ev) > 0.05) {
    g.exposure = +ev.toFixed(2);
    summary.push(`Exposure ${ev > 0 ? "+" : ""}${ev.toFixed(2)} EV to match mean luminance`);
  }
  const c = clamp(ref.std / Math.max(0.02, src.std) - 1, -0.6, 0.6);
  if (Math.abs(c) > 0.05) {
    g.contrast = +c.toFixed(2);
    summary.push(`Contrast ${c > 0 ? "+" : ""}${(c * 100).toFixed(0)}% to match tonal spread`);
  }
  const t = clamp((ref.castTemp - src.castTemp) * 1.8, -0.8, 0.8);
  if (Math.abs(t) > 0.03) {
    g.temperature = +t.toFixed(2);
    summary.push(`Temperature ${t > 0 ? "warmer" : "cooler"} by ${Math.abs(t).toFixed(2)}`);
  }
  const ti = clamp((ref.castTint - src.castTint) * 1.4, -0.5, 0.5);
  if (Math.abs(ti) > 0.03) {
    g.tint = +ti.toFixed(2);
    summary.push(`Tint ${ti > 0 ? "toward magenta" : "toward green"} by ${Math.abs(ti).toFixed(2)}`);
  }
  const s = clamp(ref.satMean / Math.max(0.03, src.satMean) - 1, -0.7, 0.7);
  if (Math.abs(s) > 0.05) {
    g.saturation = +s.toFixed(2);
    summary.push(`Saturation ${s > 0 ? "+" : ""}${(s * 100).toFixed(0)}%`);
  }
  const sh = clamp((ref.p5 - src.p5) * 3, -0.4, 0.4);
  if (Math.abs(sh) > 0.04) {
    g.shadows = +sh.toFixed(2);
    summary.push(`Shadows ${sh > 0 ? "lifted" : "deepened"} to match the toe`);
  }
  const hi = clamp((ref.p95 - src.p95) * 2, -0.4, 0.4);
  if (Math.abs(hi) > 0.04) {
    g.highlights = +hi.toFixed(2);
    summary.push(`Highlights ${hi > 0 ? "raised" : "rolled off"} to match the shoulder`);
  }
  if (!summary.length) summary.push("Shots already match within tolerance — no correction applied.");
  return { grade: g, summary };
}

export function dominantHues(s: FrameStats, count = 3) {
  return s.hueHist
    .map((v, i) => ({ name: HUE_NAMES[i], weight: v }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .filter((h) => h.weight > 0.08);
}
