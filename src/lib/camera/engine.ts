"use client";

import { GradeRenderer, NEUTRAL_RESOLVED } from "../gl/grade-renderer";
import { resolveGrade, type ResolvedGrade } from "../looks";
import { defaultGrade, type Grade } from "../types";
import { clamp, timecode } from "../utils";

/* ═══════════════════════════ Codecs ═══════════════════════════ */

export interface CodecOption {
  id: string;
  label: string;
  mime: string;
  ext: string;
}

export const RECORDING_CODECS: CodecOption[] = [
  { id: "h264-mp4", label: "H.264 · MP4", mime: "video/mp4;codecs=avc1.640028,mp4a.40.2", ext: "mp4" },
  { id: "mp4", label: "MP4 (auto)", mime: "video/mp4", ext: "mp4" },
  { id: "av1", label: "AV1 · WebM", mime: "video/webm;codecs=av01,opus", ext: "webm" },
  { id: "vp9", label: "VP9 · WebM", mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { id: "h264-webm", label: "H.264 · WebM", mime: "video/webm;codecs=h264,opus", ext: "webm" },
  { id: "vp8", label: "VP8 · WebM", mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { id: "webm", label: "WebM (auto)", mime: "video/webm", ext: "webm" },
];

export function supportedCodecs(): CodecOption[] {
  if (typeof MediaRecorder === "undefined") return [];
  return RECORDING_CODECS.filter((c) => {
    try {
      return MediaRecorder.isTypeSupported(c.mime);
    } catch {
      return false;
    }
  });
}

export const BITRATES = [
  { label: "Proxy", mbps: 4 },
  { label: "Standard", mbps: 8 },
  { label: "High", mbps: 16 },
  { label: "Master", mbps: 40 },
  { label: "Ultra", mbps: 80 },
];

/* ═══════════════════════════ WHIP (RFC 9725) ═══════════════════════════ */

async function waitIce(pc: RTCPeerConnection, ms = 2500) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

export interface StreamStats {
  kbps: number;
  fps: number;
  rttMs: number;
  packetsLost: number;
  state: string;
}

export class WhipSession {
  pc: RTCPeerConnection | null = null;
  resource: string | null = null;
  private lastBytes = 0;
  private lastTs = 0;
  constructor(public destinationId: string, public label: string) {}

  async start(stream: MediaStream, maxKbps: number, fps: number) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    this.pc = pc;
    for (const track of stream.getTracks()) {
      const tr = pc.addTransceiver(track, {
        direction: "sendonly",
        streams: [stream],
        sendEncodings: track.kind === "video" ? [{ maxBitrate: maxKbps * 1000, maxFramerate: fps }] : undefined,
      });
      if (track.kind === "video" && typeof RTCRtpSender !== "undefined" && RTCRtpSender.getCapabilities) {
        const caps = RTCRtpSender.getCapabilities("video");
        if (caps && "setCodecPreferences" in tr) {
          const h264 = caps.codecs.filter((c) => /h264/i.test(c.mimeType));
          const rest = caps.codecs.filter((c) => !/h264/i.test(c.mimeType));
          try {
            tr.setCodecPreferences([...h264, ...rest]);
          } catch {
            /* keep browser default */
          }
        }
      }
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    const res = await fetch(`/api/streams/whip?destination=${encodeURIComponent(this.destinationId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      pc.close();
      throw new Error(`${this.label}: ${msg || `ingest refused (${res.status})`}`);
    }
    this.resource = res.headers.get("x-whip-resource");
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
  }

  async stats(): Promise<StreamStats> {
    const out: StreamStats = { kbps: 0, fps: 0, rttMs: 0, packetsLost: 0, state: this.pc?.connectionState ?? "closed" };
    if (!this.pc) return out;
    const report = await this.pc.getStats();
    report.forEach((s) => {
      const r = s as Record<string, unknown>;
      if (r.type === "outbound-rtp" && r.kind === "video") {
        const bytes = Number(r.bytesSent ?? 0);
        const ts = Number(r.timestamp ?? 0);
        if (this.lastTs) out.kbps = Math.max(0, ((bytes - this.lastBytes) * 8) / Math.max(1, ts - this.lastTs));
        this.lastBytes = bytes;
        this.lastTs = ts;
        out.fps = Number(r.framesPerSecond ?? 0);
      }
      if (r.type === "remote-inbound-rtp") {
        out.rttMs = Math.round(Number(r.roundTripTime ?? 0) * 1000);
        out.packetsLost += Number(r.packetsLost ?? 0);
      }
    });
    return out;
  }

  async stop() {
    this.pc?.close();
    this.pc = null;
    if (this.resource) {
      await fetch(
        `/api/streams/whip?destination=${encodeURIComponent(this.destinationId)}&resource=${encodeURIComponent(this.resource)}`,
        { method: "DELETE" },
      ).catch(() => null);
    }
  }
}

/* ═══════════════════════════ On-device vision (MediaPipe) ═══════════════════════════ */

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const SEG_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

interface BBox { originX: number; originY: number; width: number; height: number }
interface FaceDetectorLike { detectForVideo(v: HTMLVideoElement, ts: number): { detections: { boundingBox?: BBox }[] }; close(): void }
interface MaskLike { width: number; height: number; getAsFloat32Array(): Float32Array }
interface SegmenterLike {
  segmentForVideo(v: HTMLVideoElement, ts: number, cb: (r: { confidenceMasks?: MaskLike[] }) => void): void;
  close(): void;
}
interface VisionModule {
  FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
  FaceDetector: { createFromOptions(fs: unknown, o: unknown): Promise<FaceDetectorLike> };
  ImageSegmenter: { createFromOptions(fs: unknown, o: unknown): Promise<SegmenterLike> };
}

let visionPromise: Promise<{ mod: VisionModule; fileset: unknown }> | null = null;
function loadVision() {
  if (!visionPromise) {
    const importer = new Function("u", "return import(u)") as (u: string) => Promise<VisionModule>;
    visionPromise = importer(`${MP}/vision_bundle.mjs`).then(async (mod) => ({
      mod,
      fileset: await mod.FilesetResolver.forVisionTasks(`${MP}/wasm`),
    }));
    visionPromise.catch(() => (visionPromise = null));
  }
  return visionPromise;
}

async function withDelegate<T>(fn: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
  try {
    return await fn("GPU");
  } catch {
    return fn("CPU");
  }
}

/* ═══════════════════════════ Speech captions ═══════════════════════════ */

interface SpeechAlt { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlt }
interface SpeechEventLike { resultIndex: number; results: { length: number; [i: number]: SpeechResult } }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/* ═══════════════════════════ Engine ═══════════════════════════ */

export type SceneLayout = "camera" | "screen" | "pip" | "split" | "starting" | "brb" | "ending";
export type MonitorMode = 0 | 1 | 2 | 3;

export interface EngineSettings {
  width: number;
  height: number;
  fps: number;
  mirror: boolean;
  zoom: number;
  panX: number;
  panY: number;
  grade: Grade;
  letterbox: number | null;
  layout: SceneLayout;
  pipCorner: "br" | "bl" | "tr" | "tl";
  pipSize: number;
  lowerThird: { visible: boolean; name: string; role: string };
  card: { title: string; subtitle: string };
  ticker: string;
  burnTimecode: boolean;
  burnCaptions: boolean;
  watermark: string;
  autoFrame: boolean;
  portrait: "off" | "blur" | "replace";
  portraitColor: string;
  monitor: MonitorMode;
  studioVoice: boolean;
  micGain: number;
}

export function defaultEngineSettings(): EngineSettings {
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    mirror: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    grade: defaultGrade(),
    letterbox: null,
    layout: "camera",
    pipCorner: "br",
    pipSize: 0.26,
    lowerThird: { visible: false, name: "Your Name", role: "Director · Lumière Studio" },
    card: { title: "The Broadcast", subtitle: "Begins shortly" },
    ticker: "",
    burnTimecode: false,
    burnCaptions: false,
    watermark: "",
    autoFrame: false,
    portrait: "off",
    portraitColor: "#1a1410",
    monitor: 0,
    studioVoice: true,
    micGain: 1,
  };
}

export interface EngineStats {
  fps: number;
  recording: boolean;
  paused: boolean;
  recSeconds: number;
  live: boolean;
  liveSeconds: number;
  levelDb: number;
  peakDb: number;
  stream: StreamStats | null;
  liveCaption: string;
  captions: { start: number; end: number; text: string }[];
  vision: "idle" | "loading" | "ready" | "error";
  faceLocked: boolean;
  camera: boolean;
  screen: boolean;
  mic: boolean;
}

export interface HardwareControl {
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export class CameraEngine {
  settings: EngineSettings = defaultEngineSettings();
  private resolved: ResolvedGrade = resolveGrade(defaultGrade());
  private ctx: CanvasRenderingContext2D;
  private grader: GradeRenderer;
  private monitorGrader: GradeRenderer | null = null;
  camVideo: HTMLVideoElement;
  screenVideo: HTMLVideoElement;
  camStream: MediaStream | null = null;
  micStream: MediaStream | null = null;
  screenStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private mixDest: MediaStreamAudioDestinationNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private screenSource: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private voiceChain: AudioNode[] = [];
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recStart = 0;
  private recPausedAccum = 0;
  private recPauseAt = 0;
  private liveStart = 0;
  private sessions: WhipSession[] = [];
  private outStream: MediaStream | null = null;
  private raf = 0;
  private worker: { stop(): void } | null = null;
  private lastFrame = 0;
  private frameTimes: number[] = [];
  private listeners = new Set<(s: EngineStats) => void>();
  private statTimer: ReturnType<typeof setInterval> | null = null;
  private lastStream: StreamStats | null = null;
  private peakHold = -90;
  private lowerThirdAt = 0;
  private startedAt = performance.now();
  private speech: SpeechRecognitionLike | null = null;
  private speechActive = false;
  private segStart = -1;
  captions: { start: number; end: number; text: string }[] = [];
  private liveCaption = "";
  private face: FaceDetectorLike | null = null;
  private segmenter: SegmenterLike | null = null;
  private visionState: EngineStats["vision"] = "idle";
  private faceTarget = { x: 0.5, y: 0.5, z: 1 };
  private faceSmooth = { x: 0.5, y: 0.5, z: 1 };
  private faceLocked = false;
  private lastVisionTs = 0;
  private maskCanvas: HTMLCanvasElement;
  private personCanvas: HTMLCanvasElement;
  private tinyCanvas: HTMLCanvasElement;
  private hasMask = false;
  private frameIndex = 0;

  constructor(public canvas: HTMLCanvasElement, public monitorCanvas?: HTMLCanvasElement | null) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.grader = new GradeRenderer();
    this.camVideo = Object.assign(document.createElement("video"), { muted: true, playsInline: true, autoplay: true });
    this.screenVideo = Object.assign(document.createElement("video"), { muted: true, playsInline: true, autoplay: true });
    this.maskCanvas = document.createElement("canvas");
    this.personCanvas = document.createElement("canvas");
    this.tinyCanvas = document.createElement("canvas");
    this.resize();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get glOk() {
    return this.grader.ok;
  }

  /* ─────────── lifecycle ─────────── */

  start() {
    cancelAnimationFrame(this.raf);
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const minDelta = 1000 / this.settings.fps - 2;
      if (t - this.lastFrame < minDelta) return;
      this.lastFrame = t;
      this.renderFrame(t);
    };
    this.raf = requestAnimationFrame(loop);
    if (!this.statTimer) this.statTimer = setInterval(() => void this.emit(), 250);
  }

  private onVisibility = () => {
    if (document.hidden) {
      const src = `let t=null;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}`;
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const w = new Worker(url);
      w.onmessage = () => this.renderFrame(performance.now());
      w.postMessage(1000 / this.settings.fps);
      this.worker = { stop: () => { w.terminate(); URL.revokeObjectURL(url); } };
    } else {
      this.worker?.stop();
      this.worker = null;
    }
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.worker?.stop();
    if (this.statTimer) clearInterval(this.statTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stopCaptions();
    void this.endLive();
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    [this.camStream, this.micStream, this.screenStream].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    this.face?.close();
    this.segmenter?.close();
    void this.audioCtx?.close().catch(() => null);
    this.listeners.clear();
  }

  subscribe(fn: (s: EngineStats) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  setSettings(patch: Partial<EngineSettings>) {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    if (patch.grade) this.resolved = resolveGrade(this.settings.grade);
    if (patch.width || patch.height) this.resize();
    if (patch.lowerThird && patch.lowerThird.visible && !prev.lowerThird.visible) this.lowerThirdAt = performance.now();
    if (patch.micGain !== undefined && this.micGainNode) this.micGainNode.gain.value = patch.micGain;
    if (patch.studioVoice !== undefined && patch.studioVoice !== prev.studioVoice) this.rebuildMicChain();
    if ((patch.autoFrame || (patch.portrait && patch.portrait !== "off")) && this.visionState === "idle") void this.initVision();
  }

  private resize() {
    this.canvas.width = this.settings.width;
    this.canvas.height = this.settings.height;
    if (this.monitorCanvas) {
      this.monitorCanvas.width = Math.round(this.settings.width / 2);
      this.monitorCanvas.height = Math.round(this.settings.height / 2);
    }
  }

  /* ─────────── devices ─────────── */

  static async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: devices.filter((d) => d.kind === "videoinput"),
      mics: devices.filter((d) => d.kind === "audioinput"),
    };
  }

  async startCamera(deviceId?: string, res?: { width: number; height: number; fps: number }) {
    this.camStream?.getTracks().forEach((t) => t.stop());
    const r = res ?? { width: this.settings.width, height: this.settings.height, fps: this.settings.fps };
    this.camStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: r.width },
        height: { ideal: r.height },
        frameRate: { ideal: r.fps },
      },
      audio: false,
    });
    this.camVideo.srcObject = this.camStream;
    await this.camVideo.play().catch(() => null);
    return this.camStream.getVideoTracks()[0]?.getSettings();
  }

  stopCamera() {
    this.camStream?.getTracks().forEach((t) => t.stop());
    this.camStream = null;
    this.camVideo.srcObject = null;
  }

  async startMic(deviceId?: string, opts = { echoCancellation: true, noiseSuppression: true, autoGainControl: false }) {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, ...opts, sampleRate: 48000, channelCount: 2 },
      video: false,
    });
    this.ensureAudio();
    this.rebuildMicChain();
  }

  stopMic() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micSource?.disconnect();
    this.micSource = null;
  }

  async startScreen() {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    this.screenVideo.srcObject = this.screenStream;
    await this.screenVideo.play().catch(() => null);
    this.screenStream.getVideoTracks()[0]?.addEventListener("ended", () => this.stopScreen());
    const at = this.screenStream.getAudioTracks()[0];
    if (at) {
      this.ensureAudio();
      this.screenSource = this.audioCtx!.createMediaStreamSource(new MediaStream([at]));
      this.screenSource.connect(this.mixDest!);
    }
  }

  stopScreen() {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.screenVideo.srcObject = null;
    this.screenSource?.disconnect();
    this.screenSource = null;
    if (["screen", "pip", "split"].includes(this.settings.layout) && this.camStream) this.settings.layout = "camera";
  }

  getHardware(): HardwareControl[] {
    const track = this.camStream?.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return [];
    const caps = track.getCapabilities() as unknown as Record<string, { min?: number; max?: number; step?: number }>;
    const settings = track.getSettings() as unknown as Record<string, number>;
    const names = ["zoom", "exposureCompensation", "colorTemperature", "focusDistance", "brightness", "contrast", "saturation", "sharpness"];
    return names
      .filter((n) => caps[n] && typeof caps[n].min === "number" && typeof caps[n].max === "number")
      .map((n) => ({ name: n, min: caps[n].min!, max: caps[n].max!, step: caps[n].step || 0.01, value: settings[n] ?? caps[n].min! }));
  }

  async applyHardware(name: string, value: number) {
    const track = this.camStream?.getVideoTracks()[0];
    if (!track) return;
    const set: Record<string, unknown> = { [name]: value };
    if (name === "colorTemperature") set.whiteBalanceMode = "manual";
    if (name === "exposureCompensation") set.exposureMode = "continuous";
    if (name === "focusDistance") set.focusMode = "manual";
    await track.applyConstraints({ advanced: [set as unknown as MediaTrackConstraintSet] }).catch(() => null);
  }

  /* ─────────── audio ─────────── */

  private ensureAudio() {
    if (this.audioCtx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new Ctor({ sampleRate: 48000 });
    this.mixDest = this.audioCtx.createMediaStreamDestination();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
  }

  private rebuildMicChain() {
    if (!this.micStream || !this.audioCtx || !this.mixDest || !this.analyser) return;
    this.micSource?.disconnect();
    this.voiceChain.forEach((n) => n.disconnect());
    this.micGainNode?.disconnect();
    const ac = this.audioCtx;
    this.micSource = ac.createMediaStreamSource(this.micStream);
    this.micGainNode = ac.createGain();
    this.micGainNode.gain.value = this.settings.micGain;
    const chain: AudioNode[] = [];
    if (this.settings.studioVoice) {
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 85;
      const mud = ac.createBiquadFilter();
      mud.type = "peaking";
      mud.frequency.value = 300;
      mud.Q.value = 1;
      mud.gain.value = -2.5;
      const presence = ac.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3800;
      presence.Q.value = 0.9;
      presence.gain.value = 3;
      const air = ac.createBiquadFilter();
      air.type = "highshelf";
      air.frequency.value = 10000;
      air.gain.value = 2;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 12;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.05;
      chain.push(hp, mud, presence, air, comp, limiter);
    }
    let node: AudioNode = this.micSource;
    node.connect(this.micGainNode);
    node = this.micGainNode;
    for (const n of chain) {
      node.connect(n);
      node = n;
    }
    node.connect(this.analyser);
    node.connect(this.mixDest);
    this.voiceChain = chain;
    void ac.resume();
  }

  private levels(): { level: number; peak: number } {
    if (!this.analyser || !this.micStream) return { level: -90, peak: -90 };
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0, peak = 0;
    for (const v of buf) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    const level = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-5);
    const p = 20 * Math.log10(peak || 1e-5);
    this.peakHold = Math.max(p, this.peakHold - 1.2);
    return { level: clamp(level, -90, 0), peak: clamp(this.peakHold, -90, 0) };
  }

  /* ─────────── vision ─────────── */

  private async initVision() {
    this.visionState = "loading";
    try {
      const { mod, fileset } = await loadVision();
      this.face = await withDelegate((delegate) =>
        mod.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: "VIDEO", minDetectionConfidence: 0.5 }),
      );
      this.segmenter = await withDelegate((delegate) =>
        mod.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: SEG_MODEL, delegate },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        }),
      );
      this.visionState = "ready";
    } catch (e) {
      console.warn("Vision unavailable", e);
      this.visionState = "error";
    }
  }

  private runVision(now: number) {
    const v = this.camVideo;
    if (this.visionState !== "ready" || v.readyState < 2 || !v.videoWidth) return;
    const ts = Math.max(this.lastVisionTs + 1, Math.round(now));
    if (this.settings.autoFrame && this.face && this.frameIndex % 3 === 0) {
      try {
        const res = this.face.detectForVideo(v, ts);
        this.lastVisionTs = ts;
        const box = res.detections[0]?.boundingBox;
        if (box) {
          const cx = (box.originX + box.width / 2) / v.videoWidth;
          const cy = (box.originY + box.height / 2) / v.videoHeight;
          const fh = box.height / v.videoHeight;
          this.faceTarget = { x: cx, y: cy - fh * 0.15, z: clamp(0.34 / Math.max(0.05, fh), 1, 2.4) };
          this.faceLocked = true;
        } else {
          this.faceLocked = false;
          this.faceTarget = { x: 0.5, y: 0.5, z: 1 };
        }
      } catch {
        /* skip frame */
      }
    }
    if (this.settings.portrait !== "off" && this.segmenter && this.frameIndex % 2 === 0) {
      const ts2 = Math.max(this.lastVisionTs + 1, Math.round(now) + 1);
      try {
        this.segmenter.segmentForVideo(v, ts2, (r) => {
          const m = r.confidenceMasks?.[0];
          if (!m) return;
          const data = m.getAsFloat32Array();
          if (this.maskCanvas.width !== m.width) this.maskCanvas.width = m.width;
          if (this.maskCanvas.height !== m.height) this.maskCanvas.height = m.height;
          const mctx = this.maskCanvas.getContext("2d")!;
          const img = mctx.createImageData(m.width, m.height);
          for (let i = 0; i < data.length; i++) {
            const a = clamp((data[i] - 0.25) / 0.5, 0, 1);
            img.data[i * 4 + 3] = a * 255;
          }
          mctx.putImageData(img, 0, 0);
          this.hasMask = true;
        });
        this.lastVisionTs = ts2;
      } catch {
        /* skip */
      }
    }
  }

  /* ─────────── rendering ─────────── */

  private coverUv(srcW: number, srcH: number, dstW: number, dstH: number, zoom: number, cx: number, cy: number): [number, number, number, number] {
    const sa = srcW / srcH, da = dstW / dstH;
    let sx = 1, sy = 1;
    if (sa > da) sx = da / sa;
    else sy = sa / da;
    sx /= zoom;
    sy /= zoom;
    const ox = clamp(cx - sx / 2, 0, 1 - sx);
    const oy = clamp(cy - sy / 2, 0, 1 - sy);
    return [sx, sy, ox, oy];
  }

  private drawCamera(dx: number, dy: number, dw: number, dh: number, time: number) {
    const v = this.camVideo;
    const ctx = this.ctx;
    if (!this.camStream || v.readyState < 2 || !v.videoWidth) {
      this.drawBars(dx, dy, dw, dh);
      return;
    }
    const s = this.settings;
    let zoom = s.zoom, cx = 0.5 + s.panX * 0.5, cy = 0.5 + s.panY * 0.5;
    if (s.autoFrame) {
      const k = 0.06;
      this.faceSmooth.x += (this.faceTarget.x - this.faceSmooth.x) * k;
      this.faceSmooth.y += (this.faceTarget.y - this.faceSmooth.y) * k;
      this.faceSmooth.z += (this.faceTarget.z - this.faceSmooth.z) * k;
      zoom = Math.max(zoom, this.faceSmooth.z);
      cx = this.faceSmooth.x;
      cy = this.faceSmooth.y;
    }
    const uv = this.coverUv(v.videoWidth, v.videoHeight, dw, dh, zoom, cx, cy);
    let src: CanvasImageSource = v;
    if (this.grader.ok) {
      src = this.grader.render(v, { width: dw, height: dh, grade: this.resolved, time, uv, flipX: s.mirror, srcWidth: v.videoWidth, srcHeight: v.videoHeight });
    }
    if (s.portrait !== "off" && this.hasMask) {
      // background
      if (s.portrait === "blur") {
        const tw = Math.max(8, Math.round(dw / 18)), th = Math.max(8, Math.round(dh / 18));
        this.tinyCanvas.width = tw;
        this.tinyCanvas.height = th;
        const tctx = this.tinyCanvas.getContext("2d")!;
        tctx.drawImage(src, 0, 0, tw, th);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.tinyCanvas, dx, dy, dw, dh);
      } else {
        const g = ctx.createRadialGradient(dx + dw / 2, dy + dh * 0.4, dh * 0.1, dx + dw / 2, dy + dh / 2, dw * 0.75);
        g.addColorStop(0, s.portraitColor);
        g.addColorStop(1, "#050505");
        ctx.fillStyle = g;
        ctx.fillRect(dx, dy, dw, dh);
      }
      // person
      this.personCanvas.width = dw;
      this.personCanvas.height = dh;
      const p = this.personCanvas.getContext("2d")!;
      p.globalCompositeOperation = "source-over";
      p.drawImage(src, 0, 0, dw, dh);
      p.globalCompositeOperation = "destination-in";
      const mw = this.maskCanvas.width, mh = this.maskCanvas.height;
      p.save();
      if (s.mirror) {
        p.translate(dw, 0);
        p.scale(-1, 1);
      }
      if (this.grader.ok) p.drawImage(this.maskCanvas, uv[2] * mw, uv[3] * mh, uv[0] * mw, uv[1] * mh, 0, 0, dw, dh);
      else p.drawImage(this.maskCanvas, 0, 0, dw, dh);
      p.restore();
      ctx.drawImage(this.personCanvas, dx, dy);
    } else if (this.grader.ok) {
      ctx.drawImage(src, dx, dy, dw, dh);
    } else {
      ctx.save();
      if (s.mirror) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(v, 0, 0, dw, dh);
      } else ctx.drawImage(v, dx, dy, dw, dh);
      ctx.restore();
    }
  }

  private drawScreen(dx: number, dy: number, dw: number, dh: number) {
    const v = this.screenVideo;
    const ctx = this.ctx;
    ctx.fillStyle = "#050506";
    ctx.fillRect(dx, dy, dw, dh);
    if (!this.screenStream || v.readyState < 2 || !v.videoWidth) {
      ctx.fillStyle = "rgba(216,181,122,0.5)";
      ctx.font = `500 ${Math.round(dh * 0.03)}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("SCREEN SOURCE OFFLINE", dx + dw / 2, dy + dh / 2);
      return;
    }
    const sa = v.videoWidth / v.videoHeight, da = dw / dh;
    let w = dw, h = dh;
    if (sa > da) h = dw / sa;
    else w = dh * sa;
    ctx.drawImage(v, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
  }

  private drawBars(dx: number, dy: number, dw: number, dh: number) {
    const ctx = this.ctx;
    const colors = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
    const bw = dw / 7;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(dx + i * bw, dy, bw + 1, dh * 0.67);
    });
    const low = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];
    low.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(dx + i * bw, dy + dh * 0.67, bw + 1, dh * 0.08);
    });
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(dx, dy + dh * 0.75, dw, dh * 0.25);
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.font = `600 ${Math.round(dh * 0.035)}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("CAMERA STANDBY", dx + dw / 2, dy + dh * 0.87);
  }

  private drawCard(time: number) {
    const { width: W, height: H } = this.canvas;
    const ctx = this.ctx;
    const s = this.settings;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, "#1b1712");
    g.addColorStop(1, "#040404");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const sweep = ((time / 1000) * 0.12) % 1.6 - 0.3;
    const lg = ctx.createLinearGradient(W * sweep - W * 0.3, 0, W * sweep + W * 0.3, H);
    lg.addColorStop(0, "rgba(216,181,122,0)");
    lg.addColorStop(0.5, "rgba(216,181,122,0.07)");
    lg.addColorStop(1, "rgba(216,181,122,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H * 0.36);
    ctx.rotate(time / 2200);
    ctx.strokeStyle = "rgba(216,181,122,0.55)";
    ctx.lineWidth = Math.max(1, H * 0.002);
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.06, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
    const kicker = s.layout === "brb" ? "INTERMISSION" : s.layout === "ending" ? "FIN" : "PREMIERE";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(216,181,122,0.9)";
    ctx.font = `600 ${Math.round(H * 0.022)}px Manrope, sans-serif`;
    this.spaced(kicker, W / 2, H * 0.5, H * 0.012);
    ctx.fillStyle = "#F4ECDD";
    ctx.font = `italic 500 ${Math.round(H * 0.1)}px "Cormorant Garamond", serif`;
    const title = s.layout === "brb" ? s.card.title || "We'll be right back" : s.layout === "ending" ? "Thank you for watching" : s.card.title;
    ctx.fillText(title, W / 2, H * 0.62);
    ctx.fillStyle = "rgba(244,236,221,0.6)";
    ctx.font = `400 ${Math.round(H * 0.026)}px Manrope, sans-serif`;
    ctx.fillText(s.card.subtitle, W / 2, H * 0.69);
    ctx.fillStyle = "rgba(216,181,122,0.7)";
    ctx.fillRect(W / 2 - W * 0.05, H * 0.725, W * 0.1, Math.max(1, H * 0.0015));
  }

  private spaced(text: string, x: number, y: number, spacing: number) {
    const ctx = this.ctx;
    const widths = [...text].map((c) => ctx.measureText(c).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0) - spacing;
    let cx = x - total / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    [...text].forEach((c, i) => {
      ctx.fillText(c, cx, y);
      cx += widths[i];
    });
    ctx.textAlign = prev;
  }

  private renderFrame(now: number) {
    this.frameIndex++;
    const { width: W, height: H } = this.canvas;
    const ctx = this.ctx;
    const s = this.settings;
    const time = now;
    this.frameTimes.push(now);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    this.runVision(now);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    switch (s.layout) {
      case "camera":
        this.drawCamera(0, 0, W, H, time / 1000);
        break;
      case "screen":
        this.drawScreen(0, 0, W, H);
        break;
      case "pip": {
        this.drawScreen(0, 0, W, H);
        const pw = Math.round(W * s.pipSize), ph = Math.round((pw * 9) / 16);
        const m = Math.round(W * 0.025);
        const px = s.pipCorner.includes("r") ? W - pw - m : m;
        const py = s.pipCorner.includes("b") ? H - ph - m : m;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 30;
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, pw, ph);
        ctx.restore();
        this.drawCamera(px, py, pw, ph, time / 1000);
        ctx.strokeStyle = "rgba(216,181,122,0.85)";
        ctx.lineWidth = Math.max(1, W * 0.0012);
        ctx.strokeRect(px, py, pw, ph);
        break;
      }
      case "split": {
        const half = Math.round(W * 0.42);
        this.drawCamera(0, 0, half, H, time / 1000);
        this.drawScreen(half, 0, W - half, H);
        ctx.fillStyle = "rgba(216,181,122,0.8)";
        ctx.fillRect(half - 1, 0, 2, H);
        break;
      }
      default:
        this.drawCard(time);
    }

    // letterbox
    let top = 0, bottom = H;
    if (s.letterbox && W / H < s.letterbox + 0.001) {
      const ih = W / s.letterbox;
      const bar = (H - ih) / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      top = bar;
      bottom = H - bar;
    }
    const activeH = bottom - top;

    // lower third
    if (s.lowerThird.visible && !["starting", "brb", "ending"].includes(s.layout)) {
      const p = clamp((now - this.lowerThirdAt) / 700, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const x = W * 0.06, y = top + activeH * 0.74;
      const plateW = W * 0.34 * e, plateH = activeH * 0.13;
      const lg = ctx.createLinearGradient(x, 0, x + W * 0.34, 0);
      lg.addColorStop(0, "rgba(8,8,10,0.86)");
      lg.addColorStop(1, "rgba(8,8,10,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(x, y, plateW, plateH);
      ctx.fillStyle = "#D8B57A";
      ctx.fillRect(x, y, Math.max(2, W * 0.003), plateH * e);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, plateW, plateH);
      ctx.clip();
      ctx.globalAlpha = e;
      ctx.textAlign = "left";
      ctx.fillStyle = "#F4ECDD";
      ctx.font = `500 ${Math.round(plateH * 0.42)}px "Cormorant Garamond", serif`;
      ctx.fillText(s.lowerThird.name, x + W * 0.018, y + plateH * 0.5);
      ctx.fillStyle = "#D8B57A";
      ctx.font = `600 ${Math.round(plateH * 0.17)}px Manrope, sans-serif`;
      ctx.fillText(s.lowerThird.role.toUpperCase(), x + W * 0.019, y + plateH * 0.8);
      ctx.restore();
    }

    // ticker
    if (s.ticker) {
      const th = activeH * 0.055, ty = bottom - th;
      ctx.fillStyle = "rgba(6,6,8,0.88)";
      ctx.fillRect(0, ty, W, th);
      ctx.fillStyle = "#C2263A";
      ctx.fillRect(0, ty, th * 2.4, th);
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.round(th * 0.42)}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("LIVE", th * 1.2, ty + th * 0.66);
      ctx.save();
      ctx.beginPath();
      ctx.rect(th * 2.6, ty, W, th);
      ctx.clip();
      ctx.textAlign = "left";
      ctx.fillStyle = "#F4ECDD";
      ctx.font = `500 ${Math.round(th * 0.44)}px Manrope, sans-serif`;
      const text = `${s.ticker}     ◆     `;
      const tw = ctx.measureText(text).width;
      const off = ((now / 1000) * W * 0.06) % tw;
      for (let x = th * 2.6 - off; x < W; x += tw) ctx.fillText(text, x, ty + th * 0.66);
      ctx.restore();
    }

    // captions
    if (s.burnCaptions && this.liveCaption) {
      ctx.textAlign = "center";
      ctx.font = `600 ${Math.round(activeH * 0.042)}px Manrope, sans-serif`;
      const text = this.liveCaption.slice(-90);
      const tw = ctx.measureText(text).width;
      const cy = bottom - activeH * (s.ticker ? 0.12 : 0.08);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - tw / 2 - 16, cy - activeH * 0.045, tw + 32, activeH * 0.065);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, W / 2, cy);
    }

    if (s.watermark) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,236,221,0.55)";
      ctx.font = `italic 500 ${Math.round(activeH * 0.034)}px "Cormorant Garamond", serif`;
      ctx.fillText(s.watermark, W - W * 0.03, top + activeH * 0.08);
    }

    if (s.burnTimecode) {
      const t = this.recorder && this.recorder.state !== "inactive" ? this.recSeconds() : (now - this.startedAt) / 1000;
      ctx.textAlign = "left";
      ctx.font = `500 ${Math.round(activeH * 0.03)}px "JetBrains Mono", monospace`;
      const tc = timecode(t, s.fps);
      const tw = ctx.measureText(tc).width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(W * 0.03 - 8, top + activeH * 0.04, tw + 16, activeH * 0.05);
      ctx.fillStyle = "#F4ECDD";
      ctx.fillText(tc, W * 0.03, top + activeH * 0.077);
    }

    // monitoring pass (never recorded)
    if (this.monitorCanvas) {
      if (s.monitor) {
        if (!this.monitorGrader) this.monitorGrader = new GradeRenderer(this.monitorCanvas);
        this.monitorGrader.render(this.canvas, {
          width: this.monitorCanvas.width,
          height: this.monitorCanvas.height,
          grade: NEUTRAL_RESOLVED,
          monitor: s.monitor,
          time: time / 1000,
          srcWidth: W / 2,
          srcHeight: H / 2,
        });
      }
    }
  }

  /* ─────────── output / recording ─────────── */

  outputStream(): MediaStream {
    if (this.outStream) return this.outStream;
    const v = this.canvas.captureStream(this.settings.fps);
    this.ensureAudio();
    const tracks = [...v.getVideoTracks(), ...(this.mixDest ? this.mixDest.stream.getAudioTracks() : [])];
    this.outStream = new MediaStream(tracks);
    return this.outStream;
  }

  startRecording(codec: CodecOption, mbps: number) {
    const stream = this.outputStream();
    void this.audioCtx?.resume();
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      mimeType: codec.mime,
      videoBitsPerSecond: mbps * 1_000_000,
      audioBitsPerSecond: 256_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.recStart = performance.now();
    this.recPausedAccum = 0;
    this.captions = [];
  }

  pauseRecording() {
    if (this.recorder?.state === "recording") {
      this.recorder.pause();
      this.recPauseAt = performance.now();
    } else if (this.recorder?.state === "paused") {
      this.recorder.resume();
      this.recPausedAccum += performance.now() - this.recPauseAt;
    }
  }

  recSeconds(): number {
    if (!this.recorder || this.recorder.state === "inactive") return 0;
    const pausedNow = this.recorder.state === "paused" ? performance.now() - this.recPauseAt : 0;
    return (performance.now() - this.recStart - this.recPausedAccum - pausedNow) / 1000;
  }

  stopRecording(): Promise<{ blob: Blob; duration: number; captions: { start: number; end: number; text: string }[] } | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    const duration = this.recSeconds();
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || "video/webm" });
        this.recorder = null;
        resolve({ blob, duration, captions: [...this.captions] });
      };
      rec.stop();
    });
  }

  takePhoto(type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob((b) => resolve(b), type, 0.95));
  }

  /* ─────────── captions ─────────── */

  startCaptions(lang = "en-US") {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return false;
    this.stopCaptions();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    const clock = () => (this.recorder && this.recorder.state !== "inactive" ? this.recSeconds() : (performance.now() - this.startedAt) / 1000);
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (this.segStart < 0) this.segStart = Math.max(0, clock() - 0.4);
        if (r.isFinal) {
          if (text) this.captions.push({ start: Math.round(this.segStart * 100) / 100, end: Math.round(clock() * 100) / 100, text });
          this.segStart = -1;
          this.liveCaption = text;
        } else this.liveCaption = text;
      }
    };
    rec.onend = () => {
      if (this.speechActive) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    rec.onerror = () => null;
    this.speech = rec;
    this.speechActive = true;
    try {
      rec.start();
    } catch {
      return false;
    }
    return true;
  }

  stopCaptions() {
    this.speechActive = false;
    this.speech?.stop();
    this.speech = null;
    this.liveCaption = "";
  }

  /* ─────────── live ─────────── */

  async goLive(destinations: { id: string; name: string }[], maxKbps: number) {
    const stream = this.outputStream();
    void this.audioCtx?.resume();
    const sessions = destinations.map((d) => new WhipSession(d.id, d.name));
    const results = await Promise.allSettled(sessions.map((s) => s.start(stream, maxKbps, this.settings.fps)));
    this.sessions = sessions.filter((_, i) => results[i].status === "fulfilled");
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
    if (this.sessions.length) this.liveStart = performance.now();
    return { connected: this.sessions.length, errors };
  }

  async endLive() {
    const s = this.sessions;
    this.sessions = [];
    this.liveStart = 0;
    this.lastStream = null;
    await Promise.all(s.map((x) => x.stop()));
  }

  get isLive() {
    return this.sessions.length > 0;
  }

  private async emit() {
    if (this.sessions.length) {
      const all = await Promise.all(this.sessions.map((s) => s.stats().catch(() => null)));
      const valid = all.filter(Boolean) as StreamStats[];
      this.lastStream = valid.length
        ? {
            kbps: valid.reduce((a, b) => a + b.kbps, 0),
            fps: valid.reduce((a, b) => Math.max(a, b.fps), 0),
            rttMs: Math.max(...valid.map((v) => v.rttMs)),
            packetsLost: valid.reduce((a, b) => a + b.packetsLost, 0),
            state: valid.map((v) => v.state).includes("connected") ? "connected" : valid[0].state,
          }
        : null;
    }
    const ft = this.frameTimes;
    const fps = ft.length > 1 ? ((ft.length - 1) * 1000) / (ft[ft.length - 1] - ft[0]) : 0;
    const { level, peak } = this.levels();
    const stats: EngineStats = {
      fps: Math.round(fps * 10) / 10,
      recording: Boolean(this.recorder && this.recorder.state !== "inactive"),
      paused: this.recorder?.state === "paused",
      recSeconds: this.recSeconds(),
      live: this.sessions.length > 0,
      liveSeconds: this.liveStart ? (performance.now() - this.liveStart) / 1000 : 0,
      levelDb: level,
      peakDb: peak,
      stream: this.lastStream,
      liveCaption: this.liveCaption,
      captions: this.captions,
      vision: this.visionState,
      faceLocked: this.faceLocked,
      camera: Boolean(this.camStream),
      screen: Boolean(this.screenStream),
      mic: Boolean(this.micStream),
    };
    this.listeners.forEach((l) => l(stats));
  }
}
