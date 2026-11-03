"use client";

import { GradeRenderer } from "../gl/grade-renderer";
import { resolveGrade, type ResolvedGrade } from "../looks";
import { defaultGrade, type AssetMeta, type Clip, type Grade, type MotionPreset, type ProjectSettings, type Timeline, type TitleSpec } from "../types";
import { objectUrl } from "../media/media";
import { clamp } from "../utils";
import type { CodecOption } from "../camera/engine";

const NEUTRAL_KEY = JSON.stringify(defaultGrade());

interface DrawOpts {
  alpha?: number;
  dx?: number;
  dy?: number;
  scale?: number;
  blur?: number;
}

export interface ExportOptions {
  from: number;
  to: number;
  scale: number;
  mbps: number;
  codec: CodecOption;
  onProgress?: (p: number) => void;
  signal?: { cancelled: boolean };
}

function ease(p: number) {
  return 1 - Math.pow(1 - clamp(p, 0, 1), 3);
}

function motionAt(m: MotionPreset, p: number, local: number) {
  switch (m) {
    case "kenburns-in": return { s: 1 + 0.16 * p, x: -0.015 * p, y: -0.01 * p, r: 0 };
    case "kenburns-out": return { s: 1.16 - 0.16 * p, x: 0.015 * (1 - p), y: 0, r: 0 };
    case "pan-left": return { s: 1.14, x: 0.055 - 0.11 * p, y: 0, r: 0 };
    case "pan-right": return { s: 1.14, x: -0.055 + 0.11 * p, y: 0, r: 0 };
    case "drift-up": return { s: 1.12, x: 0, y: 0.045 - 0.09 * p, r: 0 };
    case "handheld": return { s: 1.07, x: Math.sin(local * 1.3) * 0.006 + Math.sin(local * 3.7) * 0.003, y: Math.cos(local * 1.1) * 0.005 + Math.sin(local * 4.3) * 0.002, r: Math.sin(local * 0.9) * 0.3 };
    case "punch-in": return { s: p > 0.5 ? 1.2 : 1, x: 0, y: 0, r: 0 };
    default: return { s: 1, x: 0, y: 0, r: 0 };
  }
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grader: GradeRenderer;
  private els = new Map<string, HTMLVideoElement>();
  private imgs = new Map<string, HTMLImageElement>();
  private urls = new Map<string, string>();
  private pending = new Set<string>();
  private gains = new Map<string, GainNode>();
  private audioCtx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gradeCache = new WeakMap<Grade, ResolvedGrade | null>();
  private grain: HTMLCanvasElement;
  timeline!: Timeline;
  settings!: ProjectSettings;
  assets = new Map<string, AssetMeta>();
  quality = 1;
  exporting = false;
  onMediaReady?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.grader = new GradeRenderer();
    this.grain = document.createElement("canvas");
    this.grain.width = 256;
    this.grain.height = 256;
    const g = this.grain.getContext("2d")!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctor();
      this.master = this.audioCtx.createGain();
      this.master.connect(this.audioCtx.destination);
    } catch {
      this.audioCtx = null;
    }
  }

  resumeAudio() {
    void this.audioCtx?.resume();
  }

  setProject(timeline: Timeline, settings: ProjectSettings, assets: AssetMeta[]) {
    this.timeline = timeline;
    this.settings = settings;
    this.assets = new Map(assets.map((a) => [a.id, a]));
    const live = new Set(timeline.clips.map((c) => c.id));
    for (const [id, el] of this.els) {
      if (!live.has(id)) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        this.els.delete(id);
        this.gains.get(id)?.disconnect();
        this.gains.delete(id);
      }
    }
  }

  destroy() {
    for (const el of this.els.values()) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    this.els.clear();
    void this.audioCtx?.close().catch(() => null);
  }

  private async loadUrl(assetId: string) {
    if (this.pending.has(assetId) || this.urls.has(assetId)) return;
    this.pending.add(assetId);
    const url = await objectUrl(assetId);
    this.pending.delete(assetId);
    if (url) {
      this.urls.set(assetId, url);
      this.onMediaReady?.();
    }
  }

  isOffline(assetId: string) {
    return !this.urls.has(assetId) && !this.pending.has(assetId);
  }

  private elFor(c: Clip): HTMLVideoElement | null {
    let el = this.els.get(c.id);
    if (el) return el;
    if (!c.assetId) return null;
    const url = this.urls.get(c.assetId);
    if (!url) {
      void this.loadUrl(c.assetId);
      return null;
    }
    el = document.createElement("video");
    el.preload = "auto";
    el.playsInline = true;
    el.src = url;
    el.addEventListener("loadeddata", () => this.onMediaReady?.());
    el.addEventListener("seeked", () => this.onMediaReady?.());
    if (this.audioCtx && this.master) {
      try {
        const src = this.audioCtx.createMediaElementSource(el);
        const g = this.audioCtx.createGain();
        src.connect(g);
        g.connect(this.master);
        this.gains.set(c.id, g);
      } catch {
        /* element already wired */
      }
    }
    this.els.set(c.id, el);
    return el;
  }

  private imgFor(assetId: string): HTMLImageElement | null {
    const hit = this.imgs.get(assetId);
    if (hit) return hit.complete && hit.naturalWidth ? hit : null;
    const url = this.urls.get(assetId);
    if (!url) {
      void this.loadUrl(assetId);
      return null;
    }
    const img = new Image();
    img.onload = () => this.onMediaReady?.();
    img.src = url;
    this.imgs.set(assetId, img);
    return null;
  }

  private outHandle(c: Clip): number {
    const next = this.timeline.clips.find((o) => o.trackId === c.trackId && o.id !== c.id && o.transitionIn && Math.abs(o.start - (c.start + c.duration)) < 0.05);
    return next?.transitionIn?.duration ?? 0;
  }

  private trackAudible(trackId: string): number {
    const tracks = this.timeline.tracks;
    const tr = tracks.find((t) => t.id === trackId);
    if (!tr || tr.muted) return 0;
    const anySolo = tracks.some((t) => t.solo);
    if (anySolo && !tr.solo) return 0;
    return tr.volume;
  }

  /** Bring every media element to the right state for time t. */
  sync(t: number, playing: boolean) {
    if (!this.timeline) return;
    const ac = this.audioCtx;
    for (const c of this.timeline.clips) {
      if (c.kind !== "video" && c.kind !== "audio") continue;
      const local = t - c.start;
      const handle = this.outHandle(c);
      const active = local >= 0 && local < c.duration + handle;
      const near = local > -1.5 && local < 0;
      if (!active && !near && !this.els.has(c.id)) continue;
      const el = this.elFor(c);
      if (!el) continue;
      const asset = c.assetId ? this.assets.get(c.assetId) : undefined;
      const maxSrc = asset?.durationSec ? asset.durationSec - 0.04 : Infinity;
      const desired = Math.min(maxSrc, c.sourceIn + clamp(local, 0, c.duration + handle) * c.speed);
      if (active && playing) {
        const rate = clamp(c.speed, 0.0625, 16);
        if (el.playbackRate !== rate) el.playbackRate = rate;
        if (el.paused) {
          el.currentTime = desired;
          void el.play().catch(() => null);
        } else if (Math.abs(el.currentTime - desired) > 0.3) el.currentTime = desired;
      } else if (active || near) {
        if (!el.paused) el.pause();
        const target = active ? desired : c.sourceIn;
        if (!el.seeking && Math.abs(el.currentTime - target) > 0.5 / (this.settings?.fps || 24)) el.currentTime = target;
      } else if (!el.paused) el.pause();

      const g = this.gains.get(c.id);
      if (g && ac) {
        let v = c.muted ? 0 : c.volume * this.trackAudible(c.trackId);
        if (active) {
          if (c.fadeIn > 0) v *= clamp(local / c.fadeIn, 0, 1);
          if (c.fadeOut > 0) v *= clamp((c.duration - local) / c.fadeOut, 0, 1);
          if (local > c.duration) v *= clamp(1 - (local - c.duration) / Math.max(0.01, handle), 0, 1);
        } else v = 0;
        g.gain.setTargetAtTime(v, ac.currentTime, 0.012);
      }
    }
  }

  pauseAll() {
    for (const el of this.els.values()) if (!el.paused) el.pause();
  }

  private resolved(g: Grade): ResolvedGrade | null {
    if (this.gradeCache.has(g)) return this.gradeCache.get(g) ?? null;
    const neutral = !g.look && JSON.stringify(g) === NEUTRAL_KEY;
    const r = neutral ? null : resolveGrade(g);
    this.gradeCache.set(g, r);
    return r;
  }

  /* ───────────────────────── rendering ───────────────────────── */

  render(t: number) {
    if (!this.timeline || !this.settings) return;
    const W = Math.round(this.settings.width * this.quality);
    const H = Math.round(this.settings.height * this.quality);
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    const ctx = this.ctx;
    const fin = this.timeline.finishing;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.fillStyle = fin.background || "#000";
    ctx.fillRect(0, 0, W, H);

    const visual = this.timeline.tracks.filter((tr) => tr.kind !== "audio" && !tr.hidden).reverse();
    for (const tr of visual) {
      const clips = this.timeline.clips.filter((c) => c.trackId === tr.id && c.kind !== "audio");
      for (const c of clips) {
        if (t < c.start || t >= c.start + c.duration) continue;
        const local = t - c.start;
        const tin = c.transitionIn;
        if (tin && local < tin.duration) {
          const p = local / tin.duration;
          const prev = clips.find((o) => o.id !== c.id && Math.abs(o.start + o.duration - c.start) < 0.05);
          this.drawTransition(prev ?? null, c, p, t, tin.type);
        } else this.drawClip(c, t);
      }
    }

    // finishing
    if (fin.vignette > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${clamp(fin.vignette, 0, 1) * 0.85})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (fin.grain > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = clamp(fin.grain, 0, 1) * 0.55;
      const pat = ctx.createPattern(this.grain, "repeat");
      if (pat) {
        const ox = Math.random() * 256, oy = Math.random() * 256;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W + 256, H + 256);
      }
      ctx.restore();
    }
    let top = 0, bottom = H;
    if (fin.letterbox && W / H < fin.letterbox) {
      const bar = (H - W / fin.letterbox) / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      top = bar;
      bottom = H - bar;
    }
    if (fin.captionsVisible && this.timeline.captions.length) {
      const cap = this.timeline.captions.find((c) => t >= c.start && t < c.end);
      if (cap) this.drawCaption(cap.text, top, bottom, fin.captionStyle);
    }
  }

  private drawCaption(text: string, top: number, bottom: number, style: "cinema" | "social" | "broadcast") {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const ah = bottom - top;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (style === "social") {
      ctx.font = `800 ${Math.round(ah * 0.06)}px Manrope, sans-serif`;
      const txt = text.toUpperCase();
      ctx.lineWidth = ah * 0.012;
      ctx.strokeStyle = "#000";
      ctx.lineJoin = "round";
      ctx.strokeText(txt, W / 2, top + ah * 0.72, W * 0.9);
      ctx.fillStyle = "#FFE27A";
      ctx.fillText(txt, W / 2, top + ah * 0.72, W * 0.9);
    } else if (style === "broadcast") {
      ctx.font = `600 ${Math.round(ah * 0.042)}px Manrope, sans-serif`;
      const tw = Math.min(W * 0.9, ctx.measureText(text).width);
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(W / 2 - tw / 2 - ah * 0.02, bottom - ah * 0.135, tw + ah * 0.04, ah * 0.065);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, W / 2, bottom - ah * 0.088, W * 0.9);
    } else {
      ctx.font = `500 ${Math.round(ah * 0.045)}px Manrope, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = ah * 0.012;
      ctx.fillStyle = "#F7F2E8";
      ctx.fillText(text, W / 2, bottom - ah * 0.075, W * 0.9);
    }
    ctx.restore();
  }

  private sourceFor(c: Clip, t: number): { src: CanvasImageSource; w: number; h: number } | null {
    if (c.kind === "image" && c.assetId) {
      const img = this.imgFor(c.assetId);
      return img ? { src: img, w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    if (c.kind === "video") {
      const el = this.elFor(c);
      if (!el || el.readyState < 2 || !el.videoWidth) return null;
      void t;
      return { src: el, w: el.videoWidth, h: el.videoHeight };
    }
    return null;
  }

  drawClip(c: Clip, t: number, o: DrawOpts = {}) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const local = t - c.start;
    const p = clamp(local / Math.max(0.01, c.duration), 0, 1);
    let alpha = c.opacity * (o.alpha ?? 1);
    if (c.fadeIn > 0) alpha *= clamp(local / c.fadeIn, 0, 1);
    if (c.fadeOut > 0) alpha *= clamp((c.duration - local) / c.fadeOut, 0, 1);
    if (alpha <= 0.001) return;

    if (c.kind === "title" && c.title) {
      this.drawTitle(c.title, local, c.duration, alpha, o);
      return;
    }
    if (c.kind === "solid") {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.color || "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    const s = this.sourceFor(c, t);
    if (!s) {
      if (c.assetId && !this.urls.has(c.assetId) && !this.pending.has(c.assetId)) this.drawOffline(c);
      return;
    }
    const tf = c.transform;
    const sa = s.w / s.h, fa = W / H;
    let dw = W, dh = H;
    if (tf.fit === "contain") {
      if (sa > fa) dh = W / sa;
      else dw = H * sa;
    } else if (tf.fit === "cover") {
      if (sa > fa) dw = H * sa;
      else dh = W / sa;
    }
    const m = motionAt(c.motion, p, local);
    const scale = tf.scale * m.s * (o.scale ?? 1);
    let cx = W / 2 + (tf.x + m.x) * W + (o.dx ?? 0);
    let cy = H / 2 + (tf.y + m.y) * H + (o.dy ?? 0);
    if (c.reframe && tf.fit === "cover") {
      const ox = (0.5 - c.reframe.x) * dw * scale;
      const oy = (0.5 - c.reframe.y) * dh * scale;
      const maxX = Math.max(0, (dw * scale - W) / 2), maxY = Math.max(0, (dh * scale - H) / 2);
      cx += clamp(ox, -maxX, maxX);
      cy += clamp(oy, -maxY, maxY);
    }
    let src: CanvasImageSource = s.src;
    const rg = this.resolved(c.grade);
    if (rg && this.grader.ok) {
      const gw = Math.min(s.w, Math.round(dw * scale), 2560);
      const gh = Math.round(gw / sa);
      src = this.grader.render(s.src as TexImageSource, { width: gw, height: gh, grade: rg, time: t, srcWidth: s.w, srcHeight: s.h });
    }
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.globalCompositeOperation = c.blend || "source-over";
    if (o.blur) ctx.filter = `blur(${o.blur * this.quality}px)`;
    ctx.translate(cx, cy);
    if (tf.rotation || m.r) ctx.rotate(((tf.rotation + m.r) * Math.PI) / 180);
    ctx.scale(tf.flipH ? -scale : scale, scale);
    const ct = clamp(tf.cropTop, 0, 0.45), cb = clamp(tf.cropBottom, 0, 0.45);
    if (ct || cb) {
      const sh = src instanceof HTMLCanvasElement ? src.height : s.h;
      const sw = src instanceof HTMLCanvasElement ? src.width : s.w;
      ctx.drawImage(src, 0, sh * ct, sw, sh * (1 - ct - cb), -dw / 2, -dh / 2 + dh * ct, dw, dh * (1 - ct - cb));
    } else ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  private drawOffline(c: Clip) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.fillStyle = "#120f0c";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(194,38,58,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.3, H * 0.4, W * 0.4, H * 0.2);
    ctx.fillStyle = "#e9dcc6";
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(H * 0.03)}px Manrope, sans-serif`;
    ctx.fillText("MEDIA OFFLINE", W / 2, H * 0.49);
    ctx.fillStyle = "rgba(233,220,198,0.55)";
    ctx.font = `400 ${Math.round(H * 0.02)}px Manrope, sans-serif`;
    ctx.fillText(c.name.slice(0, 48), W / 2, H * 0.54);
    ctx.restore();
  }

  private spacedText(text: string, x: number, y: number, spacing: number, align: "left" | "center" | "right", stroke = false) {
    const ctx = this.ctx;
    if (Math.abs(spacing) < 0.5) {
      ctx.textAlign = align;
      if (stroke) ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      return ctx.measureText(text).width;
    }
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    ctx.textAlign = "left";
    chars.forEach((ch, i) => {
      if (stroke) ctx.strokeText(ch, cx, y);
      ctx.fillText(ch, cx, y);
      cx += widths[i] + spacing;
    });
    return total;
  }

  private drawTitle(ti: TitleSpec, local: number, duration: number, alpha: number, o: DrawOpts) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const pin = ease(local / 0.9);
    const pout = clamp((duration - local) / 0.6, 0, 1);
    const life = clamp(local / duration, 0, 1);
    const size = ti.size * H;
    let text = ti.uppercase ? ti.text.toUpperCase() : ti.text;
    let a = alpha * Math.min(pin, pout);
    let spacingEm = ti.tracking;
    let dy = 0;
    let scale = 1;
    let blur = 0;
    switch (ti.animation) {
      case "tracking": spacingEm = ti.tracking * (0.75 + 0.45 * life); break;
      case "rise": dy = (1 - pin) * H * 0.04; break;
      case "zoom": scale = 1.12 - 0.12 * ease(local / duration); break;
      case "blur": blur = (1 - pin) * 14; break;
      case "typewriter": text = text.slice(0, Math.ceil(text.length * clamp(local / Math.min(2, duration * 0.6), 0, 1))); a = alpha * pout; break;
      case "none": a = alpha; break;
      default: break;
    }
    const x = ti.x * W + (o.dx ?? 0);
    const y = ti.y * H + dy + (o.dy ?? 0);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    if (blur > 0.1) ctx.filter = `blur(${blur * this.quality}px)`;
    ctx.translate(x, y);
    ctx.scale(scale * (o.scale ?? 1), scale * (o.scale ?? 1));
    ctx.textBaseline = "middle";
    ctx.font = `${ti.italic ? "italic " : ""}${ti.weight} ${Math.round(size)}px "${ti.font}", serif`;
    const spacing = spacingEm * size;
    const align = ti.align;
    const measure = () => {
      const chars = [...text];
      return chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
    };
    const tw = measure();
    if (ti.box || ti.preset === "lower-third") {
      const pad = size * 0.55;
      const bx = align === "left" ? -pad * 0.6 : align === "right" ? -tw - pad : -tw / 2 - pad;
      const bw = tw + pad * 2;
      const reveal = ti.animation === "wipe" ? pin : 1;
      ctx.fillStyle = "rgba(8,8,10,0.78)";
      ctx.fillRect(bx, -size * 0.85, bw * reveal, size * (ti.subtitle ? 2.6 : 1.7));
      ctx.fillStyle = ti.accent;
      ctx.fillRect(bx, -size * 0.85, Math.max(2, size * 0.08), size * (ti.subtitle ? 2.6 : 1.7) * reveal);
      if (ti.animation === "wipe") {
        ctx.beginPath();
        ctx.rect(bx, -size * 2, bw * reveal, size * 5);
        ctx.clip();
      }
    }
    if (ti.shadow) {
      ctx.shadowColor = ti.preset === "neon" ? ti.color : "rgba(0,0,0,0.65)";
      ctx.shadowBlur = ti.preset === "neon" ? size * 0.5 : size * 0.18;
    }
    if (ti.preset === "neon") {
      ctx.fillStyle = ti.accent;
      ctx.globalAlpha = clamp(a * (0.85 + Math.sin(local * 23) * 0.08), 0, 1);
    }
    ctx.fillStyle = ti.color;
    const sub = ti.subtitle ? (ti.uppercase ? ti.subtitle.toUpperCase() : ti.subtitle) : "";
    const subAbove = ti.preset === "chapter" || ti.preset === "credits";
    this.spacedText(text, 0, subAbove && sub ? size * 0.35 : 0, spacing, align);
    if (sub) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = ti.accent;
      ctx.font = `600 ${Math.round(size * 0.32)}px Manrope, sans-serif`;
      this.spacedText(sub.toUpperCase(), align === "left" ? size * 0.05 : 0, subAbove ? -size * 0.75 : size * 0.95, size * 0.32 * 0.3, align);
    }
    if (ti.preset === "cinematic" || ti.preset === "epic") {
      ctx.shadowBlur = 0;
      ctx.fillStyle = ti.accent;
      ctx.globalAlpha = clamp(a * 0.8, 0, 1);
      const lw = tw * 0.18 * pin;
      ctx.fillRect(-lw / 2, size * 0.78, lw, Math.max(1, size * 0.02));
    }
    ctx.restore();
  }

  private drawTransition(prev: Clip | null, next: Clip, p: number, t: number, type: string) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const e = ease(p);
    const drawPrev = (o: DrawOpts = {}) => prev && this.drawClip({ ...prev, fadeOut: 0, duration: prev.duration + 10 }, t, o);
    switch (type) {
      case "dip-black":
      case "dip-white": {
        if (p < 0.5) drawPrev();
        else this.drawClip(next, t);
        ctx.save();
        ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 2;
        ctx.fillStyle = type === "dip-black" ? "#000" : "#fff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        return;
      }
      case "flash": {
        if (p < 0.2) drawPrev();
        else this.drawClip(next, t);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - Math.abs(p - 0.2) * 3.2);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        return;
      }
      case "wipe-left":
      case "wipe-right": {
        drawPrev();
        ctx.save();
        ctx.beginPath();
        if (type === "wipe-left") ctx.rect(W * (1 - e), 0, W * e, H);
        else ctx.rect(0, 0, W * e, H);
        ctx.clip();
        this.drawClip(next, t);
        ctx.restore();
        return;
      }
      case "slide-up":
        drawPrev({ dy: -e * H });
        this.drawClip(next, t, { dy: (1 - e) * H });
        return;
      case "zoom":
        drawPrev({ scale: 1 + e * 0.6, alpha: 1 - e });
        this.drawClip(next, t, { scale: 1.3 - 0.3 * e, alpha: e });
        return;
      case "blur":
        drawPrev({ blur: e * 24 });
        this.drawClip(next, t, { blur: (1 - e) * 24, alpha: e });
        return;
      case "iris": {
        drawPrev();
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.5 * e, 0, Math.PI * 2);
        ctx.clip();
        this.drawClip(next, t);
        ctx.restore();
        return;
      }
      case "glitch": {
        if (p < 0.5) drawPrev();
        else this.drawClip(next, t);
        const n = 7;
        for (let i = 0; i < n; i++) {
          const y = Math.random() * H, h = H * (0.01 + Math.random() * 0.06);
          const off = (Math.random() - 0.5) * W * 0.12 * (1 - Math.abs(p - 0.5) * 2);
          ctx.drawImage(this.canvas, 0, y, W, h, off, y, W, h);
        }
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.25 * (1 - Math.abs(p - 0.5) * 2);
        ctx.fillStyle = Math.random() > 0.5 ? "#ff0055" : "#00e5ff";
        ctx.fillRect(0, Math.random() * H, W, H * 0.04);
        ctx.restore();
        return;
      }
      default:
        drawPrev();
        this.drawClip(next, t, { alpha: e });
    }
  }

  /* ───────────────────────── export ───────────────────────── */

  async export(o: ExportOptions): Promise<Blob> {
    this.exporting = true;
    const prevQuality = this.quality;
    this.quality = o.scale;
    const fps = this.settings.fps;
    try {
      this.resumeAudio();
      this.sync(o.from, false);
      this.render(o.from);
      await new Promise((r) => setTimeout(r, 700));
      const video = this.canvas.captureStream(fps);
      const tracks = [...video.getVideoTracks()];
      let dest: MediaStreamAudioDestinationNode | null = null;
      if (this.audioCtx && this.master) {
        dest = this.audioCtx.createMediaStreamDestination();
        this.master.connect(dest);
        tracks.push(...dest.stream.getAudioTracks());
      }
      const rec = new MediaRecorder(new MediaStream(tracks), {
        mimeType: o.codec.mime,
        videoBitsPerSecond: o.mbps * 1_000_000,
        audioBitsPerSecond: 320_000,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || o.codec.mime }));
      });
      rec.start(500);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const t = o.from + (performance.now() - t0) / 1000;
          if (t >= o.to || o.signal?.cancelled) {
            resolve();
            return;
          }
          this.sync(t, true);
          this.render(t);
          o.onProgress?.((t - o.from) / (o.to - o.from));
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      this.pauseAll();
      rec.stop();
      const blob = await done;
      if (dest && this.master) this.master.disconnect(dest);
      video.getTracks().forEach((tr) => tr.stop());
      return blob;
    } finally {
      this.quality = prevQuality;
      this.exporting = false;
    }
  }
}
