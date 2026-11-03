import { CinePipeline } from "./gl-pipeline";
import { BUILTIN_LOOKS } from "./looks";
import { DEFAULT_GRADE, GRADE_KEYS, mergeGrade, timelineDuration, type Clip, type Grade, type Look, type TimelineData } from "./types";
import type { Lut3D } from "./cube";

type MediaEntry = {
  el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement;
  kind: "video" | "image" | "audio";
  ready: boolean;
  src: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
  url: string;
};

const FONTS = {
  serif: '"Cormorant Garamond", "Playfair Display", Georgia, serif',
  sans: '"Manrope", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

function isDefaultGrade(g: Grade) {
  for (const k of GRADE_KEYS) if (Math.abs(g[k] - DEFAULT_GRADE[k]) > 1e-4) return false;
  return true;
}

export class EditorEngine {
  readonly display: HTMLCanvasElement;
  private comp: HTMLCanvasElement;
  private compCtx: CanvasRenderingContext2D;
  private clipGL: CinePipeline | null = null;
  private masterGL: CinePipeline | null = null;
  private media = new Map<string, MediaEntry>();
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private monitorGain: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private lutCache = new Map<string, Lut3D | null>();
  private lutLoader: ((id: string) => Promise<Lut3D | null>) | null = null;
  private lastMasterLut: string | null = null;
  private lastClipLut: string | null = null;
  looks: Look[] = BUILTIN_LOOKS;
  dirty = true;
  playing = false;
  onFrame: ((t: number) => void) | null = null;
  onEnd: (() => void) | null = null;
  private playStart = 0;
  private playhead = 0;
  private raf = 0;
  private tl: TimelineData;
  private assetUrl: (id: number) => string;

  constructor(display: HTMLCanvasElement, tl: TimelineData, assetUrl: (id: number) => string) {
    this.display = display;
    this.tl = tl;
    this.assetUrl = assetUrl;
    this.comp = document.createElement("canvas");
    this.comp.width = tl.width;
    this.comp.height = tl.height;
    this.compCtx = this.comp.getContext("2d")!;
    display.width = tl.width;
    display.height = tl.height;
    const c1 = document.createElement("canvas");
    const c2 = document.createElement("canvas");
    const p1 = new CinePipeline(c1);
    const p2 = new CinePipeline(c2);
    this.clipGL = p1.ok ? p1 : null;
    this.masterGL = p2.ok ? p2 : null;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setLutLoader(fn: (id: string) => Promise<Lut3D | null>) {
    this.lutLoader = fn;
  }

  setTimeline(tl: TimelineData) {
    this.tl = tl;
    if (this.comp.width !== tl.width || this.comp.height !== tl.height) {
      this.comp.width = tl.width;
      this.comp.height = tl.height;
      this.display.width = tl.width;
      this.display.height = tl.height;
    }
    this.syncMedia();
    this.dirty = true;
  }

  setOutputSize(w: number, h: number) {
    this.display.width = w;
    this.display.height = h;
    this.dirty = true;
  }

  get time() {
    return this.playhead;
  }

  private ensureAudio() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.monitorGain = ctx.createGain();
    this.dest = ctx.createMediaStreamDestination();
    this.masterGain.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);
    this.masterGain.connect(this.dest);
  }

  resumeAudio() {
    this.ensureAudio();
    this.ctx?.resume().catch(() => null);
  }

  setMonitorMuted(m: boolean) {
    this.ensureAudio();
    if (this.monitorGain) this.monitorGain.gain.value = m ? 0 : 1;
  }

  audioTracks(): MediaStreamTrack[] {
    this.ensureAudio();
    return this.dest?.stream.getAudioTracks() ?? [];
  }

  private syncMedia() {
    const wanted = new Set<string>();
    for (const c of this.tl.clips) {
      if (c.kind === "title" || c.assetId == null) continue;
      wanted.add(c.id);
      if (this.media.has(c.id)) continue;
      const url = this.assetUrl(c.assetId);
      if (c.kind === "image") {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const entry: MediaEntry = { el: img, kind: "image", ready: false, src: null, gain: null, url };
        img.onload = () => {
          entry.ready = true;
          this.dirty = true;
        };
        img.src = url;
        this.media.set(c.id, entry);
      } else {
        const el = c.kind === "audio" ? document.createElement("audio") : document.createElement("video");
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        if (el instanceof HTMLVideoElement) {
          el.playsInline = true;
          el.muted = false;
        }
        const entry: MediaEntry = { el, kind: c.kind, ready: false, src: null, gain: null, url };
        el.onloadeddata = () => {
          entry.ready = true;
          this.dirty = true;
        };
        el.onseeked = () => {
          this.dirty = true;
        };
        el.src = url;
        this.media.set(c.id, entry);
      }
    }
    for (const [id, m] of this.media) {
      if (!wanted.has(id)) {
        if (m.el instanceof HTMLMediaElement) {
          m.el.pause();
          m.el.removeAttribute("src");
          m.el.load();
        }
        m.src?.disconnect();
        m.gain?.disconnect();
        this.media.delete(id);
      }
    }
  }

  private connectAudio(entry: MediaEntry) {
    if (!(entry.el instanceof HTMLMediaElement)) return;
    this.ensureAudio();
    if (!this.ctx || !this.masterGain || entry.src) return;
    try {
      entry.src = this.ctx.createMediaElementSource(entry.el);
      entry.gain = this.ctx.createGain();
      entry.gain.gain.value = 0;
      entry.src.connect(entry.gain);
      entry.gain.connect(this.masterGain);
    } catch {
      /* already connected elsewhere */
    }
  }

  /* ------------------------------ transport ------------------------------ */
  play() {
    this.resumeAudio();
    const dur = timelineDuration(this.tl);
    if (this.playhead >= dur - 0.01) this.playhead = 0;
    this.playing = true;
    this.playStart = performance.now() - this.playhead * 1000;
    this.dirty = true;
  }

  pause() {
    this.playing = false;
    for (const m of this.media.values()) if (m.el instanceof HTMLMediaElement) m.el.pause();
    this.dirty = true;
  }

  seek(t: number) {
    const dur = timelineDuration(this.tl);
    this.playhead = Math.max(0, Math.min(Math.max(dur, 0), t));
    if (this.playing) this.playStart = performance.now() - this.playhead * 1000;
    // force media to the exact frame
    for (const c of this.activeClips(this.playhead, true)) {
      const m = this.media.get(c.id);
      if (!m || !(m.el instanceof HTMLMediaElement)) continue;
      const st = this.sourceTime(c, this.playhead);
      if (Math.abs(m.el.currentTime - st) > 0.03) {
        try {
          m.el.currentTime = st;
        } catch {
          /* ignore */
        }
      }
    }
    this.dirty = true;
    this.onFrame?.(this.playhead);
  }

  private sourceTime(c: Clip, t: number) {
    return Math.max(0, c.inPoint + (t - c.start) * c.speed);
  }

  private activeClips(t: number, includeAudio = false) {
    return this.tl.clips.filter((c) => (includeAudio || c.kind !== "audio") && t >= c.start && t < c.start + c.duration);
  }

  /* ------------------------------ grading -------------------------------- */
  private gradeFor(lookId: string | null, g: Grade): Grade {
    const look = lookId ? this.looks.find((l) => l.id === lookId) : undefined;
    const base = mergeGrade(DEFAULT_GRADE, look?.grade);
    const out: Grade = { ...base };
    for (const k of GRADE_KEYS) {
      if (k.endsWith("Hue") || k === "lutIntensity" || k === "vignetteSoft") out[k] = g[k] !== DEFAULT_GRADE[k] ? g[k] : base[k];
      else out[k] = base[k] + g[k];
    }
    return out;
  }

  private applyLut(p: CinePipeline, lookId: string | null, slot: "clip" | "master") {
    const key = lookId ?? "";
    const last = slot === "clip" ? this.lastClipLut : this.lastMasterLut;
    if (last === key) return;
    if (slot === "clip") this.lastClipLut = key;
    else this.lastMasterLut = key;
    const look = lookId ? this.looks.find((l) => l.id === lookId) : undefined;
    if (!look?.cubeText) {
      p.setLUT(null);
      return;
    }
    if (this.lutCache.has(look.id)) {
      p.setLUT(this.lutCache.get(look.id) ?? null);
      return;
    }
    p.setLUT(null);
    this.lutLoader?.(look.id).then((lut) => {
      this.lutCache.set(look.id, lut);
      const cur = slot === "clip" ? this.lastClipLut : this.lastMasterLut;
      if (cur === key) {
        p.setLUT(lut);
        this.dirty = true;
      }
    });
  }

  /* ------------------------------ rendering ------------------------------ */
  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    if (this.playing) {
      this.playhead = (now - this.playStart) / 1000;
      const dur = timelineDuration(this.tl);
      if (this.playhead >= dur) {
        this.playhead = dur;
        this.pause();
        this.onEnd?.();
      }
      this.onFrame?.(this.playhead);
      this.render(this.playhead);
    } else if (this.dirty) {
      this.dirty = false;
      this.render(this.playhead);
    }
  }

  private syncMediaForPlayback(t: number) {
    const active = new Set(this.activeClips(t, true).map((c) => c.id));
    for (const [id, m] of this.media) {
      if (!(m.el instanceof HTMLMediaElement)) continue;
      const clip = this.tl.clips.find((c) => c.id === id);
      if (!clip) continue;
      if (active.has(id)) {
        const st = this.sourceTime(clip, t);
        if (this.playing) {
          if (Math.abs(m.el.currentTime - st) > 0.25) {
            try {
              m.el.currentTime = st;
            } catch {
              /* ignore */
            }
          }
          if (m.el.playbackRate !== clip.speed) m.el.playbackRate = Math.max(0.0625, Math.min(16, clip.speed));
          if (m.el.paused) m.el.play().catch(() => null);
        }
        // audio gain with fades
        this.connectAudio(m);
        if (m.gain && this.ctx) {
          const local = t - clip.start;
          let fade = 1;
          if (clip.fadeIn > 0) fade *= Math.min(1, local / clip.fadeIn);
          if (clip.fadeOut > 0) fade *= Math.min(1, (clip.duration - local) / clip.fadeOut);
          const vol = clip.muted ? 0 : clip.volume * Math.max(0, fade) * this.tl.masterVolume;
          m.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
        }
      } else {
        if (!m.el.paused) m.el.pause();
        if (m.gain && this.ctx) m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      }
    }
  }

  private motionTransform(c: Clip, p: number) {
    let s = 1;
    let dx = 0;
    let dy = 0;
    switch (c.motion) {
      case "zoomIn":
        s = 1 + 0.12 * p;
        break;
      case "zoomOut":
        s = 1.12 - 0.12 * p;
        break;
      case "panLeft":
        s = 1.1;
        dx = (0.04 - 0.08 * p) * this.comp.width;
        break;
      case "panRight":
        s = 1.1;
        dx = (-0.04 + 0.08 * p) * this.comp.width;
        break;
      case "drift":
        s = 1.06;
        dx = Math.sin(p * Math.PI) * 0.015 * this.comp.width;
        dy = -p * 0.02 * this.comp.height;
        break;
    }
    return { s: s * c.scale, dx: dx + (c.x / 100) * this.comp.width, dy: dy + (c.y / 100) * this.comp.height };
  }

  private drawClip(ctx: CanvasRenderingContext2D, c: Clip, t: number, alpha: number, clipRegion?: number) {
    const m = this.media.get(c.id);
    if (!m || !m.ready) return;
    const el = m.el;
    if (el instanceof HTMLAudioElement) return;
    const W = this.comp.width;
    const H = this.comp.height;
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : (el as HTMLImageElement).naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : (el as HTMLImageElement).naturalHeight;
    if (!sw || !sh) return;
    let source: CanvasImageSource = el;
    const g = this.gradeFor(c.lookId, c.grade);
    const needsGrade = !isDefaultGrade(g) || !!(c.lookId && this.looks.find((l) => l.id === c.lookId)?.cubeText);
    if (needsGrade && this.clipGL) {
      this.applyLut(this.clipGL, c.lookId, "clip");
      if (this.clipGL.setSource(el, sw, sh)) {
        this.clipGL.render({ grade: g, time: t });
        source = this.clipGL.canvas;
      }
    }
    const p = Math.max(0, Math.min(1, (t - c.start) / Math.max(0.001, c.duration)));
    const { s, dx, dy } = this.motionTransform(c, p);
    const fit = Math.max(W / sw, H / sh); // cover
    const dw = sw * fit * s;
    const dh = sh * fit * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipRegion !== undefined) {
      ctx.beginPath();
      ctx.rect(0, 0, W * clipRegion, H);
      ctx.clip();
    }
    ctx.translate(W / 2 + dx, H / 2 + dy);
    if (c.rotation) ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  private drawTitle(ctx: CanvasRenderingContext2D, c: Clip, t: number, W: number, H: number) {
    const st = c.title;
    if (!st) return;
    const p = Math.max(0, Math.min(1, (t - c.start) / Math.max(0.001, c.duration)));
    let alpha = c.opacity;
    let dy = 0;
    let tracking = 0.08;
    let text = st.text;
    const inP = Math.min(1, p / 0.18);
    const outP = Math.min(1, (1 - p) / 0.18);
    switch (st.animation) {
      case "fade":
        alpha *= Math.min(inP, outP);
        break;
      case "rise":
        alpha *= Math.min(inP, outP);
        dy = (1 - inP) * H * 0.04;
        break;
      case "tracking":
        alpha *= Math.min(inP, outP);
        tracking = 0.08 + (1 - Math.min(1, p / 0.35)) * 0.5;
        break;
      case "typewriter": {
        const n = Math.ceil(text.length * Math.min(1, p / 0.6));
        text = text.slice(0, n);
        alpha *= outP;
        break;
      }
    }
    const fontPx = Math.round((st.size / 10) * H * 0.16);
    const subPx = Math.round(fontPx * 0.38);
    const x = st.align === "left" ? W * 0.08 : st.align === "right" ? W * 0.92 : W / 2;
    const y = (st.position === "upper" ? 0.24 : st.position === "lower" ? 0.8 : 0.5) * H + dy;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = st.align;
    ctx.textBaseline = "middle";
    const family = FONTS[st.font];
    ctx.font = `${st.font === "serif" ? 400 : 500} ${fontPx}px ${family}`;
    const measure = ctx.measureText(text).width + fontPx * tracking * Math.max(0, text.length - 1);
    if (st.background === "bar") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, y - fontPx * 0.9, W, fontPx * 1.8 + (st.subtitle ? subPx * 1.6 : 0));
    } else if (st.background === "box") {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const bx = st.align === "left" ? x - fontPx * 0.4 : st.align === "right" ? x - measure - fontPx * 0.4 : x - measure / 2 - fontPx * 0.4;
      ctx.fillRect(bx, y - fontPx * 0.8, measure + fontPx * 0.8, fontPx * 1.6 + (st.subtitle ? subPx * 1.6 : 0));
    } else if (st.background === "gradient") {
      const gr = ctx.createLinearGradient(0, H * 0.5, 0, H);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);
    }
    ctx.fillStyle = st.color;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = fontPx * 0.12;
    const letterSpacing = `${(tracking * fontPx).toFixed(1)}px`;
    try {
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = letterSpacing;
    } catch {
      /* unsupported */
    }
    ctx.fillText(text, x, y);
    if (st.subtitle) {
      ctx.font = `400 ${subPx}px ${FONTS.sans}`;
      try {
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(0.3 * subPx).toFixed(1)}px`;
      } catch {
        /* unsupported */
      }
      ctx.fillStyle = "rgba(243,239,230,0.85)";
      ctx.fillText(st.subtitle.toUpperCase(), x, y + fontPx * 0.95);
    }
    ctx.restore();
  }

  render(t: number) {
    this.syncMediaForPlayback(t);
    const ctx = this.compCtx;
    const W = this.comp.width;
    const H = this.comp.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    for (const track of [0, 1]) {
      const clips = this.tl.clips.filter((c) => c.track === track && c.kind !== "title" && c.kind !== "audio").sort((a, b) => a.start - b.start);
      const cur = clips.find((c) => t >= c.start && t < c.start + c.duration);
      if (!cur) continue;
      const local = t - cur.start;
      let alpha = cur.opacity;
      if (cur.fadeIn > 0) alpha *= Math.min(1, local / cur.fadeIn);
      if (cur.fadeOut > 0) alpha *= Math.min(1, (cur.duration - local) / cur.fadeOut);
      const tr = cur.transitionIn;
      if (tr && tr.type !== "none" && tr.duration > 0 && local < tr.duration) {
        const prev = clips.filter((c) => c !== cur && c.start < cur.start && c.start + c.duration > cur.start).sort((a, b) => b.start - a.start)[0];
        const p = local / tr.duration;
        if (tr.type === "dissolve") {
          if (prev) this.drawClip(ctx, prev, t, 1);
          this.drawClip(ctx, cur, t, alpha * p);
        } else if (tr.type === "dipBlack" || tr.type === "dipWhite") {
          if (p < 0.5) {
            if (prev) this.drawClip(ctx, prev, t, 1);
            ctx.fillStyle = tr.type === "dipBlack" ? `rgba(0,0,0,${p * 2})` : `rgba(255,255,255,${p * 2})`;
            ctx.fillRect(0, 0, W, H);
          } else {
            this.drawClip(ctx, cur, t, alpha);
            ctx.fillStyle = tr.type === "dipBlack" ? `rgba(0,0,0,${(1 - p) * 2})` : `rgba(255,255,255,${(1 - p) * 2})`;
            ctx.fillRect(0, 0, W, H);
          }
        } else if (tr.type === "wipe") {
          if (prev) this.drawClip(ctx, prev, t, 1);
          this.drawClip(ctx, cur, t, alpha, p);
        } else if (tr.type === "slide") {
          if (prev) this.drawClip(ctx, prev, t, 1);
          ctx.save();
          ctx.translate((1 - p) * W, 0);
          this.drawClip(ctx, cur, t, alpha);
          ctx.restore();
        }
      } else {
        this.drawClip(ctx, cur, t, alpha);
      }
    }
    ctx.restore();

    // master grade
    const d = this.display;
    const dctx = d.getContext("2d")!;
    let out: CanvasImageSource = this.comp;
    const mg = this.gradeFor(this.tl.masterLookId, this.tl.masterGrade);
    if (this.masterGL && (!isDefaultGrade(mg) || this.tl.masterLookId)) {
      this.applyLut(this.masterGL, this.tl.masterLookId, "master");
      if (this.masterGL.setSource(this.comp, W, H)) {
        this.masterGL.render({ grade: mg, time: t });
        out = this.masterGL.canvas;
      }
    }
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.fillStyle = "#000";
    dctx.fillRect(0, 0, d.width, d.height);
    dctx.drawImage(out, 0, 0, d.width, d.height);
    // titles (post-grade)
    for (const c of this.tl.clips) {
      if (c.kind === "title" && t >= c.start && t < c.start + c.duration) this.drawTitle(dctx, c, t, d.width, d.height);
    }
    // letterbox
    if (this.tl.letterbox !== "none") {
      const ratio = this.tl.letterbox === "2.39" ? 2.39 : this.tl.letterbox === "1.85" ? 1.85 : 4 / 3;
      const cur = d.width / d.height;
      dctx.fillStyle = "#000";
      if (ratio > cur) {
        const h = d.width / ratio;
        const bar = (d.height - h) / 2;
        dctx.fillRect(0, 0, d.width, bar);
        dctx.fillRect(0, d.height - bar, d.width, bar);
      } else if (ratio < cur) {
        const w = d.height * ratio;
        const bar = (d.width - w) / 2;
        dctx.fillRect(0, 0, bar, d.height);
        dctx.fillRect(d.width - bar, 0, bar, d.height);
      }
    }
  }

  /** Sample the pre-master composite (for analysis & shot matching). */
  sampleComposite(w = 192, h = 108): Uint8ClampedArray | null {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(this.comp, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.pause();
    for (const m of this.media.values()) {
      if (m.el instanceof HTMLMediaElement) {
        m.el.removeAttribute("src");
        m.el.load();
      }
    }
    this.media.clear();
    this.clipGL?.dispose();
    this.masterGL?.dispose();
    this.ctx?.close().catch(() => null);
  }
}

/** Sample motion/detail energy across a video asset (for auto-edit). */
export async function sampleEnergy(url: string, samples = 12, onProgress?: (p: number) => void): Promise<{ energy: number[]; duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 54;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    const energy: number[] = [];
    let i = 0;
    let duration = 0;
    const finish = () => {
      v.src = "";
      resolve({ energy: energy.length ? energy : [0.5], duration, width: v.videoWidth, height: v.videoHeight });
    };
    const timeout = setTimeout(finish, 45000);
    const step = () => {
      if (i >= samples) {
        clearTimeout(timeout);
        finish();
        return;
      }
      const t = (i / Math.max(1, samples - 1)) * Math.max(0, duration - 0.1);
      v.currentTime = t;
    };
    v.onloadedmetadata = () => {
      duration = Number.isFinite(v.duration) ? v.duration : 0;
      if (!duration) {
        v.currentTime = 1e101;
        v.ontimeupdate = () => {
          v.ontimeupdate = null;
          duration = v.duration;
          step();
        };
      } else step();
    };
    v.onseeked = () => {
      try {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let diff = 0;
        let edges = 0;
        for (let p = 0; p < d.length; p += 4) {
          const l = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
          if (prev) diff += Math.abs(l - (0.2126 * prev[p] + 0.7152 * prev[p + 1] + 0.0722 * prev[p + 2]));
          if (p % (c.width * 4) < (c.width - 1) * 4) edges += Math.abs(l - (0.2126 * d[p + 4] + 0.7152 * d[p + 5] + 0.0722 * d[p + 6]));
        }
        const n = d.length / 4;
        const motion = prev ? Math.min(1, diff / n / 40) : 0.4;
        const detail = Math.min(1, edges / n / 25);
        energy.push(Math.min(1, motion * 0.65 + detail * 0.35));
        prev = new Uint8ClampedArray(d);
      } catch {
        energy.push(0.5);
      }
      i++;
      onProgress?.(i / samples);
      step();
    };
    v.onerror = () => {
      clearTimeout(timeout);
      finish();
    };
    v.src = url;
  });
}
