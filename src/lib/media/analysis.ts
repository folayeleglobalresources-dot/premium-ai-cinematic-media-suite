"use client";

import type { Grade } from "../types";
import { clamp } from "../utils";
import { seekTo } from "./media";

/* ───────────────────────── Frame statistics ───────────────────────── */

export interface FrameStats {
  mean: [number, number, number];
  std: [number, number, number];
  p2: number;
  p50: number;
  p98: number;
  saturation: number;
}

let statCanvas: HTMLCanvasElement | null = null;

export function sampleImage(source: CanvasImageSource, w = 128, h = 72): ImageData | null {
  if (!statCanvas) statCanvas = document.createElement("canvas");
  statCanvas.width = w;
  statCanvas.height = h;
  const ctx = statCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

export function frameStats(img: ImageData): FrameStats {
  const d = img.data;
  const n = d.length / 4;
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  const hist = new Uint32Array(256);
  let satSum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    sum[0] += r; sum[1] += g; sum[2] += b;
    sq[0] += r * r; sq[1] += g * g; sq[2] += b * b;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    hist[Math.min(255, Math.round(l * 255))]++;
    satSum += Math.max(r, g, b) - Math.min(r, g, b);
  }
  const mean = sum.map((s) => s / n) as [number, number, number];
  const std = sq.map((s, i) => Math.sqrt(Math.max(1e-6, s / n - mean[i] * mean[i]))) as [number, number, number];
  const pct = (p: number) => {
    const target = n * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i / 255;
    }
    return 1;
  };
  return { mean, std, p2: pct(0.02), p50: pct(0.5), p98: pct(0.98), saturation: satSum / n };
}

/** "AI Colorist": neutralise cast, normalise exposure toward 18% grey, restore contrast. */
export function autoBalance(s: FrameStats): Partial<Grade> {
  const lin = Math.pow(Math.max(0.02, s.p50), 2.2);
  const exposure = clamp(Math.log2(0.18 / lin) * 0.75, -2, 2);
  const [r, g, b] = s.mean;
  const temperature = clamp((b - r) * 2.4, -0.8, 0.8);
  const tint = clamp((g - (r + b) / 2) * 3.2, -0.6, 0.6);
  const range = Math.max(0.05, s.p98 - s.p2);
  const contrast = clamp(0.86 / range, 0.85, 1.45);
  const saturation = s.saturation < 0.12 ? 1.18 : s.saturation > 0.45 ? 0.92 : 1.04;
  return {
    exposure: Math.round(exposure * 100) / 100,
    temperature: Math.round(temperature * 100) / 100,
    tint: Math.round(tint * 100) / 100,
    contrast: Math.round(contrast * 100) / 100,
    saturation,
    pivot: clamp(Math.round(s.p50 * 100) / 100, 0.25, 0.65),
  };
}

/** Shot Match — statistical colour transfer expressed as an ASC CDL (slope/offset). */
export function shotMatch(ref: FrameStats, target: FrameStats): Pick<Grade, "slope" | "offset"> {
  const slope = [0, 1, 2].map((i) => clamp(ref.std[i] / Math.max(0.01, target.std[i]), 0.6, 1.6)) as [number, number, number];
  const offset = [0, 1, 2].map((i) => clamp(ref.mean[i] - slope[i] * target.mean[i], -0.25, 0.25)) as [number, number, number];
  return {
    slope: slope.map((v) => Math.round(v * 1000) / 1000) as [number, number, number],
    offset: offset.map((v) => Math.round(v * 1000) / 1000) as [number, number, number],
  };
}

/** Saliency focal point (edge energy weighted with skin-tone likelihood). Returns 0..1 coords. */
export function saliencyCenter(img: ImageData): { x: number; y: number } {
  const { width: w, height: h, data: d } = img;
  let sx = 0, sy = 0, sw = 0;
  const lum = (i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const gx = lum(i + 4) - lum(i - 4);
      const gy = lum(i + w * 4) - lum(i - w * 4);
      const edge = Math.sqrt(gx * gx + gy * gy) / 255;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const skin = r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 ? 2.2 : 1;
      const center = 1 - Math.hypot(x / w - 0.5, y / h - 0.5) * 0.6;
      const wgt = edge * skin * center;
      sx += x * wgt; sy += y * wgt; sw += wgt;
    }
  }
  if (sw < 1e-3) return { x: 0.5, y: 0.5 };
  return { x: clamp(sx / sw / w, 0.1, 0.9), y: clamp(sy / sw / h, 0.1, 0.9) };
}

/* ───────────────────────── Scene detection ───────────────────────── */

function histogram32(img: ImageData): Float32Array {
  const h = new Float32Array(96);
  const d = img.data;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    h[d[i] >> 3]++;
    h[32 + (d[i + 1] >> 3)]++;
    h[64 + (d[i + 2] >> 3)]++;
  }
  for (let i = 0; i < 96; i++) h[i] /= n;
  return h;
}

export async function detectScenes(
  url: string,
  duration: number,
  opts: { step?: number; sensitivity?: number; onProgress?: (p: number) => void } = {},
): Promise<number[]> {
  const step = opts.step ?? (duration > 240 ? 1 : duration > 60 ? 0.5 : 0.25);
  const sens = opts.sensitivity ?? 0.5;
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await new Promise<void>((r) => {
    v.onloadeddata = () => r();
    v.onerror = () => r();
    setTimeout(r, 6000);
  });
  const cuts: number[] = [];
  let prev: Float32Array | null = null;
  const diffs: number[] = [];
  for (let t = 0; t < duration; t += step) {
    await seekTo(v, t);
    const img = sampleImage(v, 64, 36);
    if (!img) continue;
    const hist = histogram32(img);
    if (prev) {
      let dsum = 0;
      for (let i = 0; i < 96; i++) dsum += Math.abs(hist[i] - prev[i]);
      dsum /= 3;
      const recent = diffs.slice(-8);
      const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
      const threshold = Math.max(0.28 + (0.5 - sens) * 0.3, avg * 3);
      if (dsum > threshold && (cuts.length === 0 || t - cuts[cuts.length - 1] > 0.6)) cuts.push(Math.round(t * 100) / 100);
      diffs.push(dsum);
    }
    prev = hist;
    opts.onProgress?.(Math.min(1, t / duration));
  }
  v.removeAttribute("src");
  v.load();
  return cuts;
}

/* ───────────────────────── Audio intelligence ───────────────────────── */

export function rmsEnvelope(buf: AudioBuffer, hopSec = 0.02): Float32Array {
  const data = buf.getChannelData(0);
  const hop = Math.max(1, Math.floor(buf.sampleRate * hopSec));
  const out = new Float32Array(Math.ceil(data.length / hop));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    const start = i * hop;
    const end = Math.min(data.length, start + hop);
    for (let j = start; j < end; j += 2) s += data[j] * data[j];
    out[i] = Math.sqrt(s / Math.max(1, (end - start) / 2));
  }
  return out;
}

/** Returns silent regions [start, end] in seconds using an adaptive noise floor. */
export function detectSilences(
  buf: AudioBuffer,
  opts: { thresholdDb?: number; minSilence?: number; pad?: number } = {},
): Array<[number, number]> {
  const hop = 0.02;
  const env = rmsEnvelope(buf, hop);
  const sorted = Array.from(env).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0.0005;
  const fixed = Math.pow(10, (opts.thresholdDb ?? -38) / 20);
  const thr = Math.max(fixed, floor * 2.8);
  const minLen = opts.minSilence ?? 0.45;
  const pad = opts.pad ?? 0.12;
  const regions: Array<[number, number]> = [];
  let startIdx = -1;
  for (let i = 0; i <= env.length; i++) {
    const silent = i < env.length && env[i] < thr;
    if (silent && startIdx < 0) startIdx = i;
    if (!silent && startIdx >= 0) {
      const s = startIdx * hop, e = i * hop;
      if (e - s >= minLen) regions.push([s + pad, e - pad]);
      startIdx = -1;
    }
  }
  return regions.filter(([s, e]) => e - s > 0.1);
}

/** Onset + tempo estimation → beat grid. */
export function detectBeats(buf: AudioBuffer): { bpm: number; beats: number[]; onsets: number[] } {
  const hopSec = 512 / buf.sampleRate;
  const data = buf.getChannelData(0);
  const hop = 512;
  const frames = Math.floor(data.length / hop);
  const energy = new Float32Array(frames);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let j = f * hop; j < (f + 1) * hop; j++) {
      lp += 0.15 * (data[j] - lp);
      e += lp * lp + data[j] * data[j] * 0.25;
    }
    energy[f] = e;
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
  const win = Math.round(0.5 / hopSec);
  const onsets: number[] = [];
  const minGap = Math.round(0.22 / hopSec);
  let last = -minGap;
  for (let f = 1; f < frames - 1; f++) {
    let avg = 0;
    const a = Math.max(0, f - win), b = Math.min(frames, f + win);
    for (let k = a; k < b; k++) avg += flux[k];
    avg /= b - a;
    if (flux[f] > avg * 1.6 && flux[f] > flux[f - 1] && flux[f] >= flux[f + 1] && f - last >= minGap) {
      onsets.push(f * hopSec);
      last = f;
    }
  }
  // autocorrelation tempo in 70..180 BPM
  let bestLag = 0, bestVal = 0;
  const minLag = Math.round(60 / 180 / hopSec), maxLag = Math.round(60 / 70 / hopSec);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = 0; f + lag < frames; f += 2) s += flux[f] * flux[f + lag];
    if (s > bestVal) { bestVal = s; bestLag = lag; }
  }
  const period = bestLag ? bestLag * hopSec : 0.5;
  const bpm = Math.round(60 / period);
  // phase: choose the offset that best aligns with onsets
  let bestPhase = 0, bestScore = -1;
  for (let p = 0; p < period; p += 0.01) {
    let score = 0;
    for (const o of onsets) {
      const dd = Math.abs(((o - p) % period + period) % period);
      score += Math.max(0, 1 - Math.min(dd, period - dd) / 0.05);
    }
    if (score > bestScore) { bestScore = score; bestPhase = p; }
  }
  const beats: number[] = [];
  for (let t = bestPhase; t < buf.duration; t += period) beats.push(Math.round(t * 1000) / 1000);
  return { bpm, beats, onsets };
}

/** Energy windows used for automatic "best moment" selection. */
export function bestMoments(buf: AudioBuffer | null, duration: number, count: number, len: number): number[] {
  if (!buf || duration <= len) {
    return Array.from({ length: count }, (_, i) => Math.max(0, ((duration - len) * (i + 0.5)) / count));
  }
  const env = rmsEnvelope(buf, 0.1);
  const winN = Math.max(1, Math.round(len / 0.1));
  const scores: Array<{ t: number; s: number }> = [];
  for (let i = 0; i + winN < env.length; i += Math.max(1, Math.floor(winN / 2))) {
    let s = 0;
    for (let k = i; k < i + winN; k++) s += env[k];
    scores.push({ t: i * 0.1, s });
  }
  scores.sort((a, b) => b.s - a.s);
  const picked: number[] = [];
  for (const c of scores) {
    if (picked.every((p) => Math.abs(p - c.t) > len)) picked.push(c.t);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a - b);
}

/* ───────────────────────── Scopes ───────────────────────── */

export type ScopeMode = "histogram" | "waveform" | "parade" | "vectorscope";

export function drawScope(canvas: HTMLCanvasElement, img: ImageData, mode: ScopeMode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "rgba(6,6,8,0.96)";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(216,181,122,0.10)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (H * i) / 4);
    ctx.lineTo(W, (H * i) / 4);
    ctx.stroke();
  }
  const d = img.data;
  if (mode === "histogram") {
    const bins = 64;
    const hr = new Float32Array(bins), hg = new Float32Array(bins), hb = new Float32Array(bins), hl = new Float32Array(bins);
    for (let i = 0; i < d.length; i += 4) {
      hr[d[i] >> 2]++; hg[d[i + 1] >> 2]++; hb[d[i + 2] >> 2]++;
      hl[Math.min(63, (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) >> 2)]++;
    }
    const max = Math.max(...hl, ...hr, ...hg, ...hb) || 1;
    ctx.globalCompositeOperation = "lighter";
    const draw = (h: Float32Array, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < bins; i++) ctx.lineTo((i / (bins - 1)) * W, H - (Math.sqrt(h[i] / max)) * H * 0.95);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    };
    draw(hr, "rgba(255,70,70,0.45)");
    draw(hg, "rgba(70,255,120,0.38)");
    draw(hb, "rgba(80,140,255,0.45)");
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(244,236,221,0.85)";
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const x = (i / (bins - 1)) * W, y = H - Math.sqrt(hl[i] / max) * H * 0.95;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  const out = ctx.getImageData(0, 0, W, H);
  const o = out.data;
  const plot = (x: number, y: number, r: number, g: number, b: number, a = 0.22) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const k = (yi * W + xi) * 4;
    o[k] = Math.min(255, o[k] + r * a);
    o[k + 1] = Math.min(255, o[k + 1] + g * a);
    o[k + 2] = Math.min(255, o[k + 2] + b * a);
  };
  const iw = img.width;
  if (mode === "waveform") {
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % iw;
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      plot((px / iw) * W, H - 2 - l * (H - 4), 216, 200, 160, 0.35);
    }
  } else if (mode === "parade") {
    const third = W / 3;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % iw;
      const fx = px / iw;
      plot(fx * third, H - 2 - (d[i] / 255) * (H - 4), 255, 60, 60, 0.4);
      plot(third + fx * third, H - 2 - (d[i + 1] / 255) * (H - 4), 60, 255, 100, 0.4);
      plot(2 * third + fx * third, H - 2 - (d[i + 2] / 255) * (H - 4), 80, 140, 255, 0.4);
    }
  } else {
    const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.46;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const cb = -0.1146 * r - 0.3854 * g + 0.5 * b;
      const cr = 0.5 * r - 0.4542 * g - 0.0458 * b;
      plot(cx + cb * rad * 2, cy - cr * rad * 2, 200 + r * 55, 200 + g * 55, 180 + b * 55, 0.5);
    }
  }
  ctx.putImageData(out, 0, 0);
  if (mode === "vectorscope") {
    const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.46;
    ctx.strokeStyle = "rgba(216,181,122,0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,180,140,0.45)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const ang = (-123 * Math.PI) / 180;
    ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    ctx.stroke();
  }
}
