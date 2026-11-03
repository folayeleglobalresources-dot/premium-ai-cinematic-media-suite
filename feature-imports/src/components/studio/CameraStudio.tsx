"use client";

import { AnalysisPanel } from "@/components/ai/AnalysisPanel";
import { AudioMeter, Kbd, LookStrip, Section, Slider, Spinner, Toggle } from "@/components/ui/Controls";
import { Dial } from "@/components/ui/Dial";
import { Scopes, type ScopeMode } from "@/components/ui/Scopes";
import { codecOptions, downloadBlob, fetchJSON, finalizeRecording, formatBytes, formatTimecode, pickCodec, stamp, thumbFromSource, uploadAsset } from "@/lib/api";
import { parseCube, type Lut3D } from "@/lib/cube";
import { CinePipeline, sampleCanvas } from "@/lib/gl-pipeline";
import { useLooks, useSettings } from "@/lib/hooks";
import { addGrade, DEFAULT_GRADE, DEFAULT_MONITOR, GRADE_CONTROLS, lerpGrade, type AssetDTO, type Grade, type MonitorOptions } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ----------------------------- constants ----------------------------- */

const RESOLUTIONS: Record<string, [number, number]> = {
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "4k": [3840, 2160],
  "8k": [7680, 4320],
};
const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
const BITRATES = [8, 12, 16, 25, 35, 50, 80, 120, 200];
const GUIDES: { id: string; label: string; ratio: number | null }[] = [
  { id: "none", label: "Off", ratio: null },
  { id: "2.39", label: "2.39 Scope", ratio: 2.39 },
  { id: "2.0", label: "2.00 Univisium", ratio: 2 },
  { id: "1.85", label: "1.85 Flat", ratio: 1.85 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "9:16", label: "9:16 Vertical", ratio: 9 / 16 },
];
const DESQUEEZE = [1, 1.33, 1.5, 1.8, 2];

type RangeCap = { min: number; max: number; step?: number };
type CamControlDef = { key: string; label: string; modeKey?: string; manualMode?: string; fmt?: (v: number) => string; step?: number };
const CAM_CONTROLS: CamControlDef[] = [
  { key: "zoom", label: "Zoom", fmt: (v) => `${v.toFixed(1)}×`, step: 0.1 },
  { key: "focusDistance", label: "Focus", modeKey: "focusMode", manualMode: "manual", fmt: (v) => v.toFixed(2) },
  { key: "exposureCompensation", label: "EV", fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)), step: 0.1 },
  { key: "exposureTime", label: "Shutter", modeKey: "exposureMode", manualMode: "manual", fmt: (v) => `1/${Math.max(1, Math.round(10000 / Math.max(1, v)))}` },
  { key: "iso", label: "ISO", modeKey: "exposureMode", manualMode: "manual", fmt: (v) => `${Math.round(v)}`, step: 1 },
  { key: "colorTemperature", label: "WB", modeKey: "whiteBalanceMode", manualMode: "manual", fmt: (v) => `${Math.round(v)}K`, step: 50 },
  { key: "brightness", label: "Bright", step: 1 },
  { key: "contrast", label: "Contrast", step: 1 },
  { key: "saturation", label: "Sat", step: 1 },
  { key: "sharpness", label: "Sharp", step: 1 },
];

type Tab = "camera" | "look" | "monitor" | "record" | "live" | "director";
type Toast = { id: number; text: string; kind?: "ok" | "err"; href?: string };

type SRLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/* ----------------------------- component ----------------------------- */

export function CameraStudio() {
  const { settings, update: updateSettings, loaded: settingsLoaded } = useSettings();
  const startedKeyRef = useRef<string>("");
  const { custom, resolve, lutFor, saveLook } = useLooks();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const analysisScratchRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<CinePipeline | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);

  const [supported, setSupported] = useState<{ media: boolean; gl: boolean } | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [streamInfo, setStreamInfo] = useState<{ width: number; height: number; fps: number; label: string } | null>(null);
  const [caps, setCaps] = useState<Record<string, unknown>>({});
  const [camValues, setCamValues] = useState<Record<string, number>>({});
  const [camErr, setCamErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [tab, setTab] = useState<Tab>("camera");
  const [lookId, setLookId] = useState<string>(settings.defaultLook || "natural");
  const [lookIntensity, setLookIntensity] = useState(1);
  const [adjust, setAdjust] = useState<Partial<Grade>>({});
  const [lut, setLut] = useState<Lut3D | null>(null);
  const [lutName, setLutName] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<MonitorOptions>({ ...DEFAULT_MONITOR, zebra: settings.zebra, zebraLevel: settings.zebraLevel, peaking: settings.peaking, falseColor: settings.falseColor });
  const [grid, setGrid] = useState<string>(settings.grid);
  const [guide, setGuide] = useState<string>(settings.frameGuide);
  const [safeArea, setSafeArea] = useState(false);
  const [mirror, setMirror] = useState(settings.mirrorPreview);
  const [desqueeze, setDesqueeze] = useState(1);
  const [scopesOn, setScopesOn] = useState(settings.scopes);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("waveform");
  const [scopeData, setScopeData] = useState<Uint8ClampedArray | null>(null);

  const [recState, setRecState] = useState<"idle" | "rec" | "saving">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState(1);
  const [prefix, setPrefix] = useState("OBS");
  const [autoDownload, setAutoDownload] = useState(false);
  const [recentTakes, setRecentTakes] = useState<AssetDTO[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const recMetaRef = useRef<{ mime: string; ext: string; width: number; height: number; mode: string; codecLabel: string } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analysersRef = useRef<AnalyserNode[]>([]);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorNodeRef = useRef<GainNode | null>(null);
  const [levels, setLevels] = useState<{ rms: number; peak: number }[]>([{ rms: 0, peak: 0 }, { rms: 0, peak: 0 }]);
  const [micGain, setMicGain] = useState(1);
  const [headphones, setHeadphones] = useState(false);

  const [liveState, setLiveState] = useState<"off" | "connecting" | "live">("off");
  const [liveTitle, setLiveTitle] = useState("Obsidian Live Session");
  const [liveBitrate, setLiveBitrate] = useState(6);
  const [liveStats, setLiveStats] = useState<{ kbps: number; fps: number; rtt: number; lost: number; sent: number; since: number } | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: number; title: string; status: string; startedAt: string; endedAt: string | null; stats: Record<string, unknown>; endpoint: string }[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pcLoopRef = useRef<RTCPeerConnection | null>(null);
  const liveResourceRef = useRef<string>("");
  const liveIdRef = useRef<number | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBytesRef = useRef({ bytes: 0, t: 0 });

  const [captionsOn, setCaptionsOn] = useState(false);
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const srRef = useRef<SRLike | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [clock, setClock] = useState("00:00:00:00");
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok", href?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind, href }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  /* --------------------------- derived grade --------------------------- */
  const lookGrade = useMemo(() => {
    const l = resolve(lookId);
    const base = { ...DEFAULT_GRADE, ...(l?.grade ?? {}) } as Grade;
    return lerpGrade(DEFAULT_GRADE, base, lookIntensity);
  }, [lookId, lookIntensity, resolve]);
  const grade = useMemo(() => addGrade(lookGrade, adjust), [lookGrade, adjust]);
  const gradeRef = useRef(grade);
  const monitorRef = useRef(monitor);
  const mirrorRef = useRef(mirror);
  const scopesRef = useRef(scopesOn);
  useEffect(() => {
    gradeRef.current = grade;
  }, [grade]);
  useEffect(() => {
    monitorRef.current = monitor;
  }, [monitor]);
  useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);
  useEffect(() => {
    scopesRef.current = scopesOn;
  }, [scopesOn]);

  const setGradeValue = (key: keyof Grade, v: number) => {
    setAdjust((a) => {
      const replace = key.endsWith("Hue") || key === "lutIntensity" || key === "vignetteSoft";
      return { ...a, [key]: replace ? v : v - lookGrade[key] };
    });
  };

  /* --------------------------- LUT handling ---------------------------- */
  useEffect(() => {
    let alive = true;
    lutFor(lookId).then((l) => {
      if (!alive) return;
      setLut(l);
      setLutName(l ? resolve(lookId)?.name ?? "LUT" : null);
    });
    return () => {
      alive = false;
    };
  }, [lookId, lutFor, resolve]);
  useEffect(() => {
    pipelineRef.current?.setLUT(lut);
  }, [lut]);

  /* ------------------------------ setup -------------------------------- */
  useEffect(() => {
    const media = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    const c = document.createElement("canvas");
    const gl = !!c.getContext("webgl2");
    setSupported({ media, gl });
    scratchRef.current = document.createElement("canvas");
    analysisScratchRef.current = document.createElement("canvas");
    fetchJSON<{ id: number; name: string }[]>("/api/projects").then(setProjects).catch(() => null);
    fetchJSON<typeof history>("/api/broadcasts").then(setHistory).catch(() => null);
    const t = setInterval(() => {
      const d = new Date();
      const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
      setClock(formatTimecode(secs, settings.fps));
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.classList.remove("grain");
    return () => document.body.classList.add("grain");
  }, []);

  useEffect(() => {
    if (!canvasRef.current || pipelineRef.current) return;
    const p = new CinePipeline(canvasRef.current);
    pipelineRef.current = p;
    return () => {
      p.dispose();
      pipelineRef.current = null;
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      setCamId((c) => c || list.find((d) => d.kind === "videoinput")?.deviceId || "");
      setMicId((m) => m || list.find((d) => d.kind === "audioinput")?.deviceId || "");
    } catch {
      /* ignore */
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamInfo(null);
  }, []);

  const setupAudio = useCallback(
    (stream: MediaStream) => {
      const ctx = audioCtxRef.current ?? new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume().catch(() => null);
      if (!stream.getAudioTracks().length) {
        analysersRef.current = [];
        return;
      }
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = micGain;
      const dest = ctx.createMediaStreamDestination();
      const splitter = ctx.createChannelSplitter(2);
      const aL = ctx.createAnalyser();
      const aR = ctx.createAnalyser();
      aL.fftSize = 1024;
      aR.fftSize = 1024;
      const mon = ctx.createGain();
      mon.gain.value = headphones ? 1 : 0;
      src.connect(gain);
      gain.connect(dest);
      gain.connect(splitter);
      splitter.connect(aL, 0);
      splitter.connect(aR, 1);
      gain.connect(mon);
      mon.connect(ctx.destination);
      gainRef.current = gain;
      audioDestRef.current = dest;
      analysersRef.current = [aL, aR];
      monitorNodeRef.current = mon;
    },
    [micGain, headphones],
  );

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = micGain;
  }, [micGain]);
  useEffect(() => {
    if (monitorNodeRef.current) monitorNodeRef.current.gain.value = headphones ? 1 : 0;
  }, [headphones]);

  const startStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    setStarting(true);
    setCamErr(null);
    stopStream();
    const [w, h] = RESOLUTIONS[settings.resolution] ?? RESOLUTIONS["1080p"];
    const constraints: MediaStreamConstraints = {
      video: {
        ...(camId ? { deviceId: { exact: camId } } : {}),
        width: { ideal: w },
        height: { ideal: h },
        frameRate: { ideal: settings.fps },
      },
      audio: {
        ...(micId ? { deviceId: { exact: micId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      },
    };
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: constraints.video, audio: false });
        toast("Microphone unavailable — recording video only", "err");
      }
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => null);
      const track = stream.getVideoTracks()[0];
      const s = track.getSettings();
      const actualCam = s.deviceId ?? camId;
      const actualMic = stream.getAudioTracks()[0]?.getSettings().deviceId ?? micId;
      startedKeyRef.current = `${actualCam}|${actualMic}|${settings.resolution}|${settings.fps}`;
      if (actualCam && actualCam !== camId) setCamId(actualCam);
      if (actualMic && actualMic !== micId) setMicId(actualMic);
      setStreamInfo({ width: s.width ?? 0, height: s.height ?? 0, fps: s.frameRate ?? settings.fps, label: track.label });
      const c = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<string, unknown>;
      setCaps(c);
      const vals: Record<string, number> = {};
      const sRec = s as unknown as Record<string, unknown>;
      for (const def of CAM_CONTROLS) {
        const cap = c[def.key] as RangeCap | undefined;
        if (cap && typeof cap.min === "number") vals[def.key] = typeof sRec[def.key] === "number" ? (sRec[def.key] as number) : cap.min;
      }
      setCamValues(vals);
      setupAudio(stream);
      await refreshDevices();
    } catch (e) {
      setCamErr(e instanceof Error ? e.message : "Camera access denied");
    } finally {
      setStarting(false);
    }
  }, [camId, micId, settings.resolution, settings.fps, stopStream, setupAudio, refreshDevices, toast]);

  // start on mount / when device or format changes (skip if the running stream already matches)
  useEffect(() => {
    if (!supported?.media) return;
    const key = `${camId}|${micId}|${settings.resolution}|${settings.fps}`;
    if (streamRef.current && key === startedKeyRef.current) return;
    startStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported?.media, camId, micId, settings.resolution, settings.fps]);

  // apply persisted preferences once they arrive
  useEffect(() => {
    if (!settingsLoaded) return;
    setMonitor((m) => ({ ...m, zebra: settings.zebra, zebraLevel: settings.zebraLevel, peaking: settings.peaking, falseColor: settings.falseColor }));
    setGrid(settings.grid);
    setGuide(settings.frameGuide);
    setMirror(settings.mirrorPreview);
    setScopesOn(settings.scopes);
    if (settings.defaultLook) setLookId(settings.defaultLook);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  useEffect(() => {
    return () => {
      stopStream();
      audioCtxRef.current?.close().catch(() => null);
      cancelAnimationFrame(rafRef.current);
    };
  }, [stopStream]);

  /* --------------------------- render loop ----------------------------- */
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      const p = pipelineRef.current;
      if (!v || !p || !p.ok || v.readyState < 2 || v.videoWidth === 0) return;
      if (p.setSource(v)) {
        p.render({ grade: gradeRef.current, monitor: monitorRef.current, mirror: mirrorRef.current });
      }
      frameRef.current++;
      if (frameRef.current % 3 === 0 && scopesRef.current && scratchRef.current && canvasRef.current) {
        const d = sampleCanvas(canvasRef.current, scratchRef.current, 192, 108);
        if (d) setScopeData(d);
      }
      if (frameRef.current % 4 === 0 && analysersRef.current.length) {
        const out = analysersRef.current.map((a) => {
          const buf = new Float32Array(a.fftSize);
          a.getFloatTimeDomainData(buf);
          let sum = 0;
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const x = Math.abs(buf[i]);
            sum += x * x;
            if (x > peak) peak = x;
          }
          return { rms: Math.sqrt(sum / buf.length), peak };
        });
        setLevels(out);
      }
      if (recState === "rec") setElapsed((performance.now() - recStartRef.current) / 1000);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [recState]);

  /* --------------------------- camera control -------------------------- */
  const applyCam = useCallback(async (def: CamControlDef, value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setCamValues((v) => ({ ...v, [def.key]: value }));
    const set: Record<string, unknown> = { [def.key]: value };
    if (def.modeKey && def.manualMode) set[def.modeKey] = def.manualMode;
    try {
      await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] });
    } catch {
      /* unsupported value — ignore */
    }
  }, []);

  const setMode = useCallback(async (modeKey: string, mode: string) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ [modeKey]: mode } as MediaTrackConstraintSet] });
      const s = track.getSettings() as unknown as Record<string, unknown>;
      setCamValues((v) => {
        const n = { ...v };
        for (const def of CAM_CONTROLS) if (typeof s[def.key] === "number") n[def.key] = s[def.key] as number;
        return n;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const torchCap = Array.isArray(caps.torch) ? (caps.torch as boolean[]).includes(true) : caps.torch === true;
  const [torch, setTorch] = useState(false);
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      toast("Torch not controllable on this device", "err");
    }
  };

  /* ----------------------------- recording ----------------------------- */
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    const codec = pickCodec(settings.codec);
    if (!codec) {
      toast("MediaRecorder is not supported in this browser", "err");
      return;
    }
    const fps = streamInfo?.fps || settings.fps;
    const videoTracks = settings.recordMode === "look" ? canvas.captureStream(fps).getVideoTracks() : [stream.getVideoTracks()[0]];
    const audioTracks = audioDestRef.current?.stream.getAudioTracks() ?? stream.getAudioTracks();
    const combined = new MediaStream([...videoTracks, ...audioTracks]);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(combined, {
        mimeType: codec.mime,
        videoBitsPerSecond: settings.bitrateMbps * 1_000_000,
        audioBitsPerSecond: 320_000,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Recorder failed to start", "err");
      return;
    }
    chunksRef.current = [];
    recMetaRef.current = {
      mime: codec.mime.split(";")[0],
      ext: codec.ext,
      width: settings.recordMode === "look" ? canvas.width : streamInfo?.width ?? canvas.width,
      height: settings.recordMode === "look" ? canvas.height : streamInfo?.height ?? canvas.height,
      mode: settings.recordMode,
      codecLabel: codec.label,
    };
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      setRecState("saving");
      const meta = recMetaRef.current!;
      const durationMs = Math.round(performance.now() - recStartRef.current);
      const raw = new Blob(chunksRef.current, { type: meta.mime });
      const blob = await finalizeRecording(raw, durationMs, meta.mime);
      const name = `${prefix}_T${String(take).padStart(2, "0")}_${stamp()}`;
      const thumb = canvasRef.current ? thumbFromSource(canvasRef.current, canvasRef.current.width, canvasRef.current.height) : null;
      try {
        const asset = await uploadAsset({
          blob,
          name,
          kind: "video",
          mime: meta.mime,
          durationMs,
          width: meta.width,
          height: meta.height,
          fps,
          lookId: meta.mode === "look" ? lookId : null,
          source: "studio",
          projectId,
          thumbDataUrl: thumb,
          metadata: {
            codec: meta.codecLabel,
            bitrateMbps: settings.bitrateMbps,
            recordMode: meta.mode,
            camera: streamInfo?.label,
            grade: meta.mode === "look" ? grade : null,
            lut: lutName,
            take,
          },
        });
        setRecentTakes((r) => [asset, ...r].slice(0, 8));
        setTake((t) => t + 1);
        toast(`Take ${take} saved to the Vault · ${formatBytes(blob.size)}`, "ok", `/editor?asset=${asset.id}`);
        if (autoDownload) downloadBlob(blob, `${name}.${meta.ext}`);
      } catch (e) {
        toast(`Upload failed: ${e instanceof Error ? e.message : "unknown"} — downloading locally`, "err");
        downloadBlob(blob, `${name}.${meta.ext}`);
      } finally {
        setRecState("idle");
        setElapsed(0);
      }
    };
    recorderRef.current = rec;
    recStartRef.current = performance.now();
    rec.start(1000);
    setRecState("rec");
  }, [settings.codec, settings.recordMode, settings.bitrateMbps, settings.fps, streamInfo, prefix, take, lookId, projectId, grade, lutName, autoDownload, toast]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const toggleRecording = useCallback(() => {
    if (recState === "rec") stopRecording();
    else if (recState === "idle") startRecording();
  }, [recState, startRecording, stopRecording]);

  const capturePhoto = useCallback(async () => {
    const canvas = canvasRef.current;
    const p = pipelineRef.current;
    const v = videoRef.current;
    if (!canvas || !p || !v) return;
    p.setSource(v);
    p.render({ grade: gradeRef.current, monitor: { ...DEFAULT_MONITOR, digitalGain: monitorRef.current.digitalGain }, mirror: mirrorRef.current });
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    const name = `${prefix}_STILL_${stamp()}`;
    const thumb = thumbFromSource(canvas, canvas.width, canvas.height);
    try {
      const asset = await uploadAsset({ blob, name, kind: "image", mime: "image/png", width: canvas.width, height: canvas.height, lookId, source: "still", projectId, thumbDataUrl: thumb, metadata: { grade, camera: streamInfo?.label } });
      setRecentTakes((r) => [asset, ...r].slice(0, 8));
      toast(`Still captured · ${canvas.width}×${canvas.height}`, "ok", "/library");
      if (autoDownload) downloadBlob(blob, `${name}.png`);
    } catch {
      downloadBlob(blob, `${name}.png`);
    }
  }, [prefix, lookId, projectId, grade, streamInfo, autoDownload, toast]);

  /* -------------------------------- live -------------------------------- */
  const stopLive = useCallback(async () => {
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    liveTimerRef.current = null;
    pcRef.current?.close();
    pcLoopRef.current?.close();
    pcRef.current = null;
    pcLoopRef.current = null;
    const loc = liveResourceRef.current;
    liveResourceRef.current = "";
    if (loc) fetchJSON("/api/live/whip", { method: "DELETE", body: JSON.stringify({ location: loc, token: settings.whipToken }) }).catch(() => null);
    if (liveIdRef.current) {
      await fetchJSON("/api/broadcasts", { method: "PATCH", body: JSON.stringify({ id: liveIdRef.current, status: "ended", stats: liveStats ?? {} }) }).catch(() => null);
      liveIdRef.current = null;
      fetchJSON<typeof history>("/api/broadcasts").then(setHistory).catch(() => null);
    }
    setLiveState("off");
    setLiveStats(null);
  }, [settings.whipToken, liveStats]);

  const goLive = useCallback(async () => {
    const stream = streamRef.current;
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    setLiveErr(null);
    setLiveState("connecting");
    try {
      const fps = streamInfo?.fps || settings.fps;
      const vTrack = canvas.captureStream(fps).getVideoTracks()[0];
      const aTrack = audioDestRef.current?.stream.getAudioTracks()[0] ?? stream.getAudioTracks()[0];
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }], bundlePolicy: "max-bundle" });
      pcRef.current = pc;
      pc.addTransceiver(vTrack, { direction: "sendonly", sendEncodings: [{ maxBitrate: liveBitrate * 1_000_000 }] });
      if (aTrack) pc.addTransceiver(aTrack, { direction: "sendonly" });
      const endpoint = settings.whipEndpoint.trim();
      if (endpoint) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === "complete") return resolve();
          const t = setTimeout(resolve, 2500);
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(t);
              resolve();
            }
          };
        });
        const res = await fetchJSON<{ sdp: string; location: string }>("/api/live/whip", {
          method: "POST",
          body: JSON.stringify({ endpoint, token: settings.whipToken, sdp: pc.localDescription?.sdp }),
        });
        await pc.setRemoteDescription({ type: "answer", sdp: res.sdp });
        liveResourceRef.current = res.location;
      } else {
        // Rehearsal: loopback peer so the encoder, bitrate and stats are real.
        const loop = new RTCPeerConnection();
        pcLoopRef.current = loop;
        pc.onicecandidate = (e) => e.candidate && loop.addIceCandidate(e.candidate).catch(() => null);
        loop.onicecandidate = (e) => e.candidate && pc.addIceCandidate(e.candidate).catch(() => null);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await loop.setRemoteDescription(offer);
        const answer = await loop.createAnswer();
        await loop.setLocalDescription(answer);
        await pc.setRemoteDescription(answer);
      }
      const row = await fetchJSON<{ id: number }>("/api/broadcasts", {
        method: "POST",
        body: JSON.stringify({ title: liveTitle, protocol: endpoint ? "whip" : "rehearsal", endpoint, settings: { bitrateMbps: liveBitrate, fps, width: canvas.width, height: canvas.height, look: lookId } }),
      });
      liveIdRef.current = row.id;
      lastBytesRef.current = { bytes: 0, t: performance.now() };
      const since = Date.now();
      setLiveState("live");
      liveTimerRef.current = setInterval(async () => {
        if (!pcRef.current) return;
        const stats = await pcRef.current.getStats();
        let bytes = 0;
        let fpsOut = 0;
        let rtt = 0;
        let lost = 0;
        stats.forEach((r) => {
          if (r.type === "outbound-rtp" && r.kind === "video") {
            bytes = r.bytesSent ?? 0;
            fpsOut = r.framesPerSecond ?? 0;
          }
          if (r.type === "candidate-pair" && r.state === "succeeded" && typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime * 1000;
          if (r.type === "remote-inbound-rtp" && r.kind === "video") lost = r.packetsLost ?? 0;
        });
        const now = performance.now();
        const dt = (now - lastBytesRef.current.t) / 1000;
        const kbps = dt > 0 ? ((bytes - lastBytesRef.current.bytes) * 8) / 1000 / dt : 0;
        lastBytesRef.current = { bytes, t: now };
        setLiveStats({ kbps: Math.max(0, Math.round(kbps)), fps: Math.round(fpsOut), rtt: Math.round(rtt), lost, sent: bytes, since });
      }, 1000);
      toast(endpoint ? "You are live." : "Rehearsal broadcast running (no endpoint configured).");
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : "Failed to go live");
      setLiveState("off");
      pcRef.current?.close();
      pcRef.current = null;
    }
  }, [streamInfo, settings.fps, settings.whipEndpoint, settings.whipToken, liveBitrate, liveTitle, lookId, toast]);

  useEffect(() => () => {
    pcRef.current?.close();
    pcLoopRef.current?.close();
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
  }, []);

  /* ------------------------------ captions ------------------------------ */
  useEffect(() => {
    if (!captionsOn) {
      srRef.current?.stop();
      srRef.current = null;
      setCaption("");
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SRLike; webkitSpeechRecognition?: new () => SRLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast("Live transcription needs a Chromium-based browser", "err");
      setCaptionsOn(false);
      return;
    }
    const sr = new Ctor();
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = navigator.language || "en-US";
    sr.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) setTranscript((t) => [...t, r[0].transcript.trim()].slice(-200));
        else interim += r[0].transcript;
      }
      setCaption(interim);
    };
    sr.onend = () => {
      if (srRef.current === sr) {
        try {
          sr.start();
        } catch {
          /* ignore */
        }
      }
    };
    sr.onerror = () => null;
    try {
      sr.start();
    } catch {
      /* ignore */
    }
    srRef.current = sr;
    return () => {
      sr.onend = null;
      sr.stop();
    };
  }, [captionsOn, toast]);

  /* ----------------------------- shortcuts ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "r") toggleRecording();
      else if (k === "p") capturePhoto();
      else if (k === "z") setMonitor((m) => ({ ...m, zebra: !m.zebra }));
      else if (k === "f") setMonitor((m) => ({ ...m, peaking: !m.peaking }));
      else if (k === "c") setMonitor((m) => ({ ...m, falseColor: !m.falseColor }));
      else if (k === "s") setScopesOn((s) => !s);
      else if (k === "g") setGrid((g) => (g === "none" ? "thirds" : g === "thirds" ? "golden" : g === "golden" ? "center" : "none"));
      else if (k === "m") setMirror((m) => !m);
      else if (/^[1-6]$/.test(k)) setTab((["camera", "look", "monitor", "record", "live", "director"] as Tab[])[Number(k) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleRecording, capturePhoto]);

  /* ------------------------------ helpers ------------------------------- */
  const importCube = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCube(text);
      setLut(parsed);
      setLutName(parsed.title || file.name);
      pipelineRef.current?.setLUT(parsed);
      await saveLook({ name: file.name.replace(/\.cube$/i, ""), category: "Imported LUT", description: `${parsed.size}³ 3D LUT imported from ${file.name}`, grade: {}, cubeText: text, lutSize: parsed.size, swatch: ["#1b1b22", "#6a5e4a", "#e8d7b2"] });
      toast(`LUT "${parsed.title || file.name}" loaded (${parsed.size}-point) and saved to your looks`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not parse LUT", "err");
    }
  };

  const savePreset = async () => {
    const name = window.prompt("Name this look preset", `${resolve(lookId)?.name ?? "Look"} — custom`);
    if (!name) return;
    const l = resolve(lookId);
    await saveLook({ name, category: "Custom", description: `Derived from ${l?.name ?? "Natural"}`, grade: grade, swatch: l?.swatch ?? ["#222", "#888", "#eee"] });
    toast(`Preset "${name}" saved`);
  };

  const getAnalysisSample = () => {
    const v = videoRef.current;
    const s = analysisScratchRef.current;
    if (!v || !s || v.readyState < 2) return null;
    const d = sampleCanvas(v, s, 192, 108);
    return d ? { data: d, w: 192, h: 108 } : null;
  };

  const shutterAngle = useMemo(() => {
    const et = camValues.exposureTime;
    const fps = streamInfo?.fps || settings.fps;
    if (!et) return null;
    return Math.round(((et / 10000) * fps * 360) % 360 || 360);
  }, [camValues.exposureTime, streamInfo, settings.fps]);

  const activeCodec = pickCodec(settings.codec);
  const estSize = recState === "rec" ? formatBytes((elapsed * settings.bitrateMbps * 1_000_000) / 8) : null;
  const videoAspect = streamInfo && streamInfo.height ? (streamInfo.width * desqueeze) / streamInfo.height : 16 / 9;
  const guideRatio = GUIDES.find((g) => g.id === guide)?.ratio ?? null;

  const tc = recState === "rec" ? formatTimecode(elapsed, Math.round(streamInfo?.fps || settings.fps)) : settings.timecodeMode === "clock" ? clock : "00:00:00:00";

  /* ------------------------------- render ------------------------------- */
  if (supported && (!supported.media || !supported.gl)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="glass-strong p-10 max-w-lg text-center">
          <div className="eyebrow mb-3">Compatibility</div>
          <h1 className="display text-4xl mb-4">This device needs a modern browser</h1>
          <p className="text-muted text-sm leading-relaxed">
            Obsidian Studio uses the live camera API and WebGL2 for its imaging pipeline. Please open the studio in a current version of Chrome, Edge, Firefox or Safari on your Windows, macOS, Linux or ChromeOS machine.
            {!supported.media ? " (Camera API unavailable — the page must be served over HTTPS or localhost.)" : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] md:h-screen flex flex-col lg:flex-row bg-obsidian overflow-hidden">
      {/* -------------------------- Viewfinder -------------------------- */}
      <div className="relative flex-1 min-h-[45vh] lg:min-h-0 flex flex-col">
        {/* HUD top */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pointer-events-none bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-4 readout text-[10px] text-ivory/80">
            <span className="flex items-center gap-2 pointer-events-auto">
              {recState === "rec" ? <span className="rec-dot" /> : <span className="w-2.5 h-2.5 rounded-full border border-ivory/40" />}
              <span className={`text-[15px] tracking-[0.12em] ${recState === "rec" ? "text-[#ff6b73]" : "text-ivory"}`}>{tc}</span>
            </span>
            {streamInfo ? (
              <>
                <span className="hidden sm:inline text-gold-bright">
                  {streamInfo.width}×{streamInfo.height}
                </span>
                <span className="hidden sm:inline">{Number(streamInfo.fps).toFixed(2).replace(/\.?0+$/, "")} fps</span>
                {shutterAngle ? <span className="hidden md:inline">{shutterAngle}°</span> : null}
                {camValues.iso ? <span className="hidden md:inline">ISO {Math.round(camValues.iso)}</span> : null}
                {camValues.colorTemperature ? <span className="hidden md:inline">{Math.round(camValues.colorTemperature)}K</span> : null}
                {camValues.zoom && camValues.zoom !== 1 ? <span className="hidden md:inline">{camValues.zoom.toFixed(1)}×</span> : null}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-3 readout text-[10px] text-ivory/70">
            {liveState === "live" ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-crimson/80 text-white tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE {liveStats ? `${(liveStats.kbps / 1000).toFixed(1)} Mb/s` : ""}
              </span>
            ) : null}
            {estSize ? <span className="text-[#ff9aa0]">{estSize}</span> : null}
            <span className="hidden sm:inline text-gold">{resolve(lookId)?.name ?? "Natural"}</span>
            {lut ? <span className="hidden sm:inline">LUT</span> : null}
            <span className="hidden md:inline">{activeCodec?.id.toUpperCase().replace("-", " ") ?? "—"}</span>
            <span className="hidden md:inline">{settings.bitrateMbps} Mb/s</span>
          </div>
        </div>

        {/* Canvas */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          <video ref={videoRef} className="absolute w-px h-px opacity-0 pointer-events-none" muted playsInline autoPlay />
          <div className="relative bracket max-w-full max-h-full" style={{ aspectRatio: `${videoAspect}`, width: "100%", maxHeight: "100%" }}>
            <span className="bracket-b" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" style={{ transform: mirror ? "scaleX(1)" : undefined }} />
            {/* Frame guide */}
            {guideRatio ? <FrameGuide containerRatio={videoAspect} ratio={guideRatio} /> : null}
            {safeArea ? (
              <>
                <div className="absolute inset-[5%] border border-dashed border-ivory/25 pointer-events-none" />
                <div className="absolute inset-[10%] border border-dashed border-gold/35 pointer-events-none" />
              </>
            ) : null}
            {grid !== "none" ? <GridOverlay kind={grid} /> : null}
            {/* Captions */}
            {captionsOn && (caption || transcript.length) ? (
              <div className="absolute left-[8%] right-[8%] bottom-[8%] text-center pointer-events-none">
                <span className="inline-block px-4 py-2 bg-black/60 backdrop-blur text-ivory text-[clamp(12px,1.6vw,20px)] font-sans leading-snug">
                  {caption || transcript[transcript.length - 1]}
                </span>
              </div>
            ) : null}
            {!streamInfo ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
                {starting ? <Spinner /> : null}
                <div className="eyebrow">{starting ? "Opening lens" : camErr ? "Camera unavailable" : "Awaiting camera"}</div>
                {camErr ? <div className="text-sm text-muted max-w-sm">{camErr}</div> : null}
                {!starting ? (
                  <button className="btn" onClick={startStream}>
                    Open camera
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Scopes overlay */}
          {scopesOn && scopeData ? (
            <div className="absolute left-3 bottom-3 z-20 w-[240px] glass-strong p-2 hidden sm:block">
              <Scopes data={scopeData} width={192} height={108} mode={scopeMode} onModeChange={setScopeMode} compact />
            </div>
          ) : null}

          {/* Audio meters */}
          <div className="absolute right-3 top-14 bottom-16 z-20 flex items-stretch gap-2">
            <div className="h-full py-1">
              <AudioMeter levels={levels} />
            </div>
            <div className="hidden md:flex flex-col justify-between readout text-[8px] text-ivory/40 py-1">
              <span>0</span>
              <span>-12</span>
              <span>-24</span>
              <span>-48</span>
            </div>
          </div>
        </div>

        {/* Command deck */}
        <div className="relative z-20 border-t border-white/[0.06] bg-[#0a0a0e]/95 backdrop-blur-xl px-3 sm:px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { k: "zebra", l: "Zebra", on: monitor.zebra, f: () => setMonitor((m) => ({ ...m, zebra: !m.zebra })) },
                { k: "peak", l: "Peak", on: monitor.peaking, f: () => setMonitor((m) => ({ ...m, peaking: !m.peaking })) },
                { k: "false", l: "False", on: monitor.falseColor, f: () => setMonitor((m) => ({ ...m, falseColor: !m.falseColor })) },
                { k: "scopes", l: "Scopes", on: scopesOn, f: () => setScopesOn((s) => !s) },
                { k: "grid", l: grid === "none" ? "Grid" : grid, on: grid !== "none", f: () => setGrid((g) => (g === "none" ? "thirds" : g === "thirds" ? "golden" : g === "golden" ? "center" : "none")) },
                { k: "guide", l: guide === "none" ? "Guide" : guide, on: guide !== "none", f: () => setTab("monitor") },
              ].map((b) => (
                <button key={b.k} className={`chip ${b.on ? "active" : ""}`} onClick={b.f}>
                  {b.l}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button className="btn btn-ghost btn-sm" onClick={capturePhoto} disabled={!streamInfo} title="Capture still (P)">
              Still
            </button>
            <button
              onClick={toggleRecording}
              disabled={!streamInfo || recState === "saving"}
              title="Record (R)"
              className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${recState === "rec" ? "border-[#ff3b47] shadow-[0_0_30px_rgba(255,59,71,0.6)]" : "border-ivory/60 hover:border-gold"} disabled:opacity-40`}
            >
              {recState === "saving" ? <Spinner /> : <span className={`transition-all ${recState === "rec" ? "w-5 h-5 bg-[#ff3b47]" : "w-10 h-10 rounded-full bg-[#ff3b47]"}`} />}
            </button>
            <button className={`btn btn-sm ${liveState === "live" ? "btn-danger" : ""}`} onClick={() => (liveState === "live" ? stopLive() : setTab("live"))} disabled={!streamInfo || liveState === "connecting"}>
              {liveState === "live" ? "End live" : liveState === "connecting" ? "Connecting" : "Live"}
            </button>
          </div>
          <LookStrip active={lookId} onPick={(id) => { setLookId(id ?? "natural"); setAdjust({}); }} extra={custom} compact />
        </div>
      </div>

      {/* --------------------------- Side panel --------------------------- */}
      <aside className="w-full lg:w-[360px] xl:w-[400px] flex-none border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-[#0b0b10] flex flex-col max-h-[55vh] lg:max-h-none">
        <div className="flex items-stretch border-b border-white/[0.06] overflow-x-auto">
          {(["camera", "look", "monitor", "record", "live", "director"] as Tab[]).map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[64px] py-3 text-[9px] tracking-[0.22em] uppercase font-mono transition-colors relative ${tab === t ? "text-gold-bright" : "text-muted hover:text-ivory"}`}
            >
              {t}
              <span className="absolute top-1 right-1 text-[7px] text-white/20">{i + 1}</span>
              {tab === t ? <span className="absolute bottom-0 left-3 right-3 h-px bg-gold shadow-[0_0_8px_rgba(var(--accent-rgb),0.9)]" /> : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          {tab === "camera" ? (
            <>
              <Section title="Sources">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Camera</span>
                  <select className="field" value={camId} onChange={(e) => setCamId(e.target.value)}>
                    {devices.filter((d) => d.kind === "videoinput").map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Microphone</span>
                  <select className="field" value={micId} onChange={(e) => setMicId(e.target.value)}>
                    {devices.filter((d) => d.kind === "audioinput").map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              </Section>

              <Section title="Format" right={<span className="readout text-[10px] text-muted">{streamInfo ? `${streamInfo.width}×${streamInfo.height}` : "—"}</span>}>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(RESOLUTIONS).map((r) => (
                    <button key={r} className={`chip ${settings.resolution === r ? "active" : ""}`} onClick={() => updateSettings({ resolution: r as typeof settings.resolution })}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FPS_OPTIONS.map((f) => (
                    <button key={f} className={`chip ${settings.fps === f ? "active" : ""}`} onClick={() => updateSettings({ fps: f })}>
                      {f}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted">The camera negotiates the closest supported mode. Actual: {streamInfo ? `${streamInfo.width}×${streamInfo.height} @ ${Number(streamInfo.fps).toFixed(2).replace(/\.?0+$/, "")}` : "—"}</p>
              </Section>

              <Section title="Optics & exposure">
                <div className="grid grid-cols-3 gap-3 justify-items-center">
                  <Dial
                    label="Gain (dig.)"
                    value={monitor.digitalGain}
                    min={-3}
                    max={3}
                    step={0.05}
                    display={`${monitor.digitalGain >= 0 ? "+" : ""}${monitor.digitalGain.toFixed(1)}`}
                    onChange={(v) => setMonitor((m) => ({ ...m, digitalGain: v }))}
                    onReset={() => setMonitor((m) => ({ ...m, digitalGain: 0 }))}
                  />
                  {CAM_CONTROLS.map((def) => {
                    const cap = caps[def.key] as RangeCap | undefined;
                    if (!cap || typeof cap.min !== "number") return null;
                    const val = camValues[def.key] ?? cap.min;
                    return (
                      <Dial
                        key={def.key}
                        label={def.label}
                        value={val}
                        min={cap.min}
                        max={cap.max}
                        step={def.step ?? cap.step ?? (cap.max - cap.min) / 100}
                        display={def.fmt ? def.fmt(val) : undefined}
                        onChange={(v) => applyCam(def, v)}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["focusMode", "exposureMode", "whiteBalanceMode"] as const).map((mk) => {
                    const modes = caps[mk] as string[] | undefined;
                    if (!Array.isArray(modes) || !modes.length) return null;
                    const label = mk === "focusMode" ? "AF" : mk === "exposureMode" ? "AE" : "AWB";
                    return modes.map((m) => (
                      <button key={mk + m} className="chip" onClick={() => setMode(mk, m)}>
                        {label}: {m}
                      </button>
                    ));
                  })}
                  {torchCap ? (
                    <button className={`chip ${torch ? "active" : ""}`} onClick={toggleTorch}>
                      Torch
                    </button>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Dials appear for every control your camera exposes to the browser (zoom, focus, shutter, ISO, white balance…). Webcams expose few; phone cameras and UVC cinema devices expose many. Digital gain and the full colour pipeline are always available. Drag vertically; hold <Kbd>Shift</Kbd> for fine control; double-click to reset.
                </p>
              </Section>

              <Section title="Audio">
                <Slider label="Input gain" value={micGain} min={0} max={4} step={0.05} onChange={setMicGain} format={(v) => `${(20 * Math.log10(Math.max(0.001, v))).toFixed(1)} dB`} />
                <Toggle label="Headphone monitoring" hint="Route input to speakers (use headphones to avoid feedback)" on={headphones} onChange={setHeadphones} />
              </Section>
            </>
          ) : null}

          {tab === "look" ? (
            <>
              <Section
                title="Look"
                right={
                  <div className="flex gap-1">
                    <button className="btn btn-xs btn-ghost" onClick={() => setAdjust({})}>
                      Reset
                    </button>
                    <button className="btn btn-xs" onClick={savePreset}>
                      Save preset
                    </button>
                  </div>
                }
              >
                <LookStrip active={lookId} onPick={(id) => { setLookId(id ?? "natural"); setAdjust({}); }} extra={custom} />
                <Slider label="Look intensity" value={lookIntensity} min={0} max={1} step={0.01} onChange={setLookIntensity} format={(v) => `${Math.round(v * 100)}%`} />
                <p className="text-[11px] text-muted">{resolve(lookId)?.description}</p>
              </Section>

              <Section
                title="3D LUT"
                right={
                  <label className="btn btn-xs cursor-pointer">
                    Import .cube
                    <input type="file" accept=".cube,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && importCube(e.target.files[0])} />
                  </label>
                }
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ivory/80">{lut ? `${lutName} · ${lut.size}³` : "No LUT loaded"}</span>
                  {lut ? (
                    <button className="btn btn-xs btn-ghost" onClick={() => { setLut(null); setLutName(null); }}>
                      Unload
                    </button>
                  ) : null}
                </div>
                {lut ? <Slider label="LUT intensity" value={grade.lutIntensity} min={0} max={1} step={0.01} onChange={(v) => setGradeValue("lutIntensity", v)} format={(v) => `${Math.round(v * 100)}%`} /> : null}
                <p className="text-[10px] text-muted">Industry-standard 17/33/65-point .cube LUTs from Resolve, Premiere or your colourist are applied in real time on the GPU and can be baked into the recording.</p>
              </Section>

              {(["Light", "Color", "Tone", "Film", "Texture"] as const).map((group) => (
                <Section key={group} title={group}>
                  {group === "Light" ? (
                    <div className="grid grid-cols-3 gap-3 justify-items-center">
                      {GRADE_CONTROLS.filter((c) => c.group === group).map((c) => (
                        <Dial key={c.key} label={c.label} value={grade[c.key]} min={c.min} max={c.max} step={c.step} onChange={(v) => setGradeValue(c.key, v)} onReset={() => setGradeValue(c.key, lookGrade[c.key])} size={68} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {GRADE_CONTROLS.filter((c) => c.group === group).map((c) => (
                        <Slider key={c.key} label={c.label} value={grade[c.key]} min={c.min} max={c.max} step={c.step} onChange={(v) => setGradeValue(c.key, v)} onReset={() => setGradeValue(c.key, lookGrade[c.key])} />
                      ))}
                    </div>
                  )}
                </Section>
              ))}
            </>
          ) : null}

          {tab === "monitor" ? (
            <>
              <Section title="Exposure tools">
                <Toggle label="Zebra stripes" hint="Marks pixels above threshold" on={monitor.zebra} onChange={(v) => setMonitor((m) => ({ ...m, zebra: v }))} />
                <Slider label="Zebra threshold" value={monitor.zebraLevel} min={0.5} max={1} step={0.01} onChange={(v) => setMonitor((m) => ({ ...m, zebraLevel: v }))} format={(v) => `${Math.round(v * 100)} IRE`} />
                <Toggle label="False colour" hint="ARRI-style exposure map: pink = skin, green = 18% grey" on={monitor.falseColor} onChange={(v) => setMonitor((m) => ({ ...m, falseColor: v }))} />
              </Section>
              <Section title="Focus tools">
                <Toggle label="Focus peaking" hint="Highlights in-focus edges in gold" on={monitor.peaking} onChange={(v) => setMonitor((m) => ({ ...m, peaking: v }))} />
                <Slider label="Peaking sensitivity" value={1.05 - monitor.peakLevel} min={0.05} max={1} step={0.01} onChange={(v) => setMonitor((m) => ({ ...m, peakLevel: 1.05 - v }))} format={(v) => `${Math.round(v * 100)}%`} />
              </Section>
              <Section title="Framing">
                <div className="flex flex-wrap gap-1.5">
                  {GUIDES.map((g) => (
                    <button key={g.id} className={`chip ${guide === g.id ? "active" : ""}`} onClick={() => { setGuide(g.id); updateSettings({ frameGuide: g.id }); }}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["none", "thirds", "golden", "center"].map((g) => (
                    <button key={g} className={`chip ${grid === g ? "active" : ""}`} onClick={() => { setGrid(g); updateSettings({ grid: g as typeof settings.grid }); }}>
                      {g === "none" ? "No grid" : g}
                    </button>
                  ))}
                </div>
                <Toggle label="Title & action safe" on={safeArea} onChange={setSafeArea} />
                <Toggle label="Mirror preview" hint="Flip horizontally (also baked into look recordings)" on={mirror} onChange={(v) => { setMirror(v); updateSettings({ mirrorPreview: v }); }} />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] tracking-[0.12em] uppercase text-ivory/85">Anamorphic desqueeze</span>
                  <div className="flex gap-1">
                    {DESQUEEZE.map((d) => (
                      <button key={d} className={`chip ${desqueeze === d ? "active" : ""}`} onClick={() => setDesqueeze(d)}>
                        {d}×
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
              <Section title="Scopes">
                <Toggle label="Show scopes" on={scopesOn} onChange={(v) => { setScopesOn(v); updateSettings({ scopes: v }); }} />
                {scopesOn && scopeData ? <Scopes data={scopeData} width={192} height={108} mode={scopeMode} onModeChange={setScopeMode} /> : null}
              </Section>
              <Section title="Timecode">
                <div className="flex gap-1.5">
                  {(["record", "clock"] as const).map((m) => (
                    <button key={m} className={`chip ${settings.timecodeMode === m ? "active" : ""}`} onClick={() => updateSettings({ timecodeMode: m })}>
                      {m === "record" ? "Record run" : "Time of day"}
                    </button>
                  ))}
                </div>
              </Section>
            </>
          ) : null}

          {tab === "record" ? (
            <>
              <Section title="Codec">
                <select className="field" value={settings.codec} onChange={(e) => updateSettings({ codec: e.target.value })}>
                  <option value="auto">Auto (best available)</option>
                  {codecOptions().map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.supported}>
                      {c.label}
                      {c.supported ? "" : " — unavailable here"}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-muted">Active: {activeCodec?.label ?? "none"}</div>
              </Section>
              <Section title="Bitrate">
                <div className="flex flex-wrap gap-1.5">
                  {BITRATES.map((b) => (
                    <button key={b} className={`chip ${settings.bitrateMbps === b ? "active" : ""}`} onClick={() => updateSettings({ bitrateMbps: b })}>
                      {b} Mb/s
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted">≈ {formatBytes((settings.bitrateMbps * 1_000_000 * 60) / 8)} per minute. 50–120 Mb/s approaches mezzanine quality for grading.</p>
              </Section>
              <Section title="Pipeline">
                <div className="flex gap-1.5">
                  <button className={`chip ${settings.recordMode === "look" ? "active" : ""}`} onClick={() => updateSettings({ recordMode: "look" })}>
                    Bake look
                  </button>
                  <button className={`chip ${settings.recordMode === "clean" ? "active" : ""}`} onClick={() => updateSettings({ recordMode: "clean" })}>
                    Clean sensor feed
                  </button>
                </div>
                <p className="text-[10px] text-muted">Bake renders the full GPU pipeline (look, LUT, grain, mirror) into the file. Clean records the untouched camera feed for maximum flexibility in the Cutting Room.</p>
              </Section>
              <Section title="Slate">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Prefix</span>
                    <input className="field" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12) || "OBS")} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Take</span>
                    <input className="field" type="number" min={1} value={take} onChange={(e) => setTake(Math.max(1, Number(e.target.value)))} />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Project</span>
                  <select className="field" value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Unassigned</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Toggle label="Also download locally" on={autoDownload} onChange={setAutoDownload} />
              </Section>
              {recentTakes.length ? (
                <Section title="This session">
                  <div className="flex flex-col gap-2">
                    {recentTakes.map((a) => (
                      <Link key={a.id} href={a.kind === "video" ? `/editor?asset=${a.id}` : "/library"} className="flex items-center gap-3 panel p-2 hover:border-gold/40 transition-colors">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/assets/${a.id}/thumb`} alt="" className="w-16 h-9 object-cover bg-black" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] truncate">{a.name}</div>
                          <div className="text-[10px] text-muted readout">
                            {a.width}×{a.height} · {formatBytes(a.size)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Section>
              ) : null}
            </>
          ) : null}

          {tab === "live" ? (
            <>
              <Section title="Broadcast">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Title</span>
                  <input className="field" value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">WHIP ingest URL</span>
                  <input className="field" placeholder="https://…/webrtc/publish (Cloudflare Stream, Twitch, MediaMTX…)" value={settings.whipEndpoint} onChange={(e) => updateSettings({ whipEndpoint: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Bearer token / stream key</span>
                  <input className="field" type="password" value={settings.whipToken} onChange={(e) => updateSettings({ whipToken: e.target.value })} />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[2.5, 4, 6, 8, 12, 20].map((b) => (
                    <button key={b} className={`chip ${liveBitrate === b ? "active" : ""}`} onClick={() => setLiveBitrate(b)}>
                      {b} Mb/s
                    </button>
                  ))}
                </div>
                {liveErr ? <div className="text-[11px] text-crimson">{liveErr}</div> : null}
                <div className="flex gap-2">
                  {liveState === "live" ? (
                    <button className="btn btn-danger flex-1" onClick={stopLive}>
                      End broadcast
                    </button>
                  ) : (
                    <button className="btn btn-solid flex-1" onClick={goLive} disabled={!streamInfo || liveState === "connecting"}>
                      {liveState === "connecting" ? <Spinner /> : null} {settings.whipEndpoint.trim() ? "Go live" : "Start rehearsal"}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Streams the graded programme feed over WebRTC using the WHIP standard — sub-second latency to Cloudflare Stream, Twitch, Dolby.io, MediaMTX or any WHIP-compatible origin. Without an endpoint the studio runs a local loopback rehearsal with real encoder statistics.
                </p>
              </Section>
              {liveStats ? (
                <Section title="Telemetry">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Bitrate", `${(liveStats.kbps / 1000).toFixed(2)} Mb/s`],
                      ["Encoder fps", `${liveStats.fps}`],
                      ["Round trip", `${liveStats.rtt} ms`],
                      ["Packets lost", `${liveStats.lost}`],
                      ["Sent", formatBytes(liveStats.sent)],
                      ["On air", formatTimecode((Date.now() - liveStats.since) / 1000, 1).slice(0, 8)],
                    ].map(([k, v]) => (
                      <div key={k} className="panel p-2">
                        <div className="eyebrow !text-[7px]">{k}</div>
                        <div className="readout text-[13px] text-gold-bright">{v}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}
              {history.length ? (
                <Section title="History">
                  <div className="flex flex-col gap-1.5">
                    {history.slice(0, 8).map((h) => (
                      <div key={h.id} className="flex items-center justify-between panel p-2 text-[11px]">
                        <div className="min-w-0">
                          <div className="truncate">{h.title}</div>
                          <div className="text-[10px] text-muted readout">{new Date(h.startedAt).toLocaleString()}</div>
                        </div>
                        <span className={`chip ${h.status === "live" ? "active" : ""}`}>{h.status}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}
            </>
          ) : null}

          {tab === "director" ? (
            <>
              <Section title="Director · frame intelligence">
                <AnalysisPanel
                  getSample={getAnalysisSample}
                  fps={streamInfo?.fps || settings.fps}
                  source="studio"
                  onApplyGrade={(g) => {
                    setAdjust((a) => {
                      const n = { ...a };
                      for (const [k, v] of Object.entries(g)) if (typeof v === "number") n[k as keyof Grade] = (n[k as keyof Grade] ?? 0) + v;
                      return n;
                    });
                    toast("Corrective grade applied on top of your look");
                  }}
                  onApplyLook={(id) => {
                    setLookId(id);
                    setTab("look");
                  }}
                />
              </Section>
              <Section title="Live transcription" right={<Toggle on={captionsOn} onChange={setCaptionsOn} />}>
                <p className="text-[10px] text-muted">On-device speech recognition renders lower-third captions in the viewfinder and keeps a running transcript for subtitles.</p>
                {transcript.length ? (
                  <div className="panel p-2 max-h-40 overflow-y-auto text-[11px] text-ivory/80 flex flex-col gap-1">
                    {transcript.slice(-12).map((t, i) => (
                      <div key={i}>{t}</div>
                    ))}
                  </div>
                ) : null}
                {transcript.length ? (
                  <button className="btn btn-xs btn-ghost self-start" onClick={() => downloadBlob(new Blob([transcript.join("\n")], { type: "text/plain" }), `transcript_${stamp()}.txt`)}>
                    Download transcript
                  </button>
                ) : null}
              </Section>
              <Section title="Shortcuts">
                <div className="grid grid-cols-2 gap-y-1.5 text-[11px] text-muted">
                  <span><Kbd>R</Kbd> Record</span>
                  <span><Kbd>P</Kbd> Still</span>
                  <span><Kbd>Z</Kbd> Zebra</span>
                  <span><Kbd>F</Kbd> Peaking</span>
                  <span><Kbd>C</Kbd> False colour</span>
                  <span><Kbd>S</Kbd> Scopes</span>
                  <span><Kbd>G</Kbd> Grid</span>
                  <span><Kbd>M</Kbd> Mirror</span>
                  <span><Kbd>1</Kbd>–<Kbd>6</Kbd> Panels</span>
                </div>
              </Section>
            </>
          ) : null}
        </div>
      </aside>

      {/* Toasts */}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto glass-strong px-4 py-2.5 text-[12px] flex items-center gap-3 ${t.kind === "err" ? "border-crimson/50 text-[#ffb5ba]" : "text-ivory"}`}>
            <span>{t.text}</span>
            {t.href ? (
              <Link href={t.href} className="text-gold-bright underline underline-offset-4">
                Open
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- overlays -------------------------------- */

function FrameGuide({ containerRatio, ratio }: { containerRatio: number; ratio: number }) {
  if (ratio > containerRatio) {
    const h = (containerRatio / ratio) * 100;
    const bar = (100 - h) / 2;
    return (
      <>
        <div className="absolute left-0 right-0 top-0 bg-black/55 pointer-events-none" style={{ height: `${bar}%` }} />
        <div className="absolute left-0 right-0 bottom-0 bg-black/55 pointer-events-none" style={{ height: `${bar}%` }} />
        <div className="absolute left-0 right-0 border-y border-gold/50 pointer-events-none" style={{ top: `${bar}%`, height: `${h}%` }} />
      </>
    );
  }
  const w = (ratio / containerRatio) * 100;
  const bar = (100 - w) / 2;
  return (
    <>
      <div className="absolute top-0 bottom-0 left-0 bg-black/55 pointer-events-none" style={{ width: `${bar}%` }} />
      <div className="absolute top-0 bottom-0 right-0 bg-black/55 pointer-events-none" style={{ width: `${bar}%` }} />
      <div className="absolute top-0 bottom-0 border-x border-gold/50 pointer-events-none" style={{ left: `${bar}%`, width: `${w}%` }} />
    </>
  );
}

function GridOverlay({ kind }: { kind: string }) {
  const lines = kind === "thirds" ? [33.333, 66.666] : kind === "golden" ? [38.2, 61.8] : [];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      {lines.map((p) => (
        <g key={p}>
          <line x1={p} y1={0} x2={p} y2={100} stroke="rgba(255,255,255,0.35)" strokeWidth={0.15} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={p} x2={100} y2={p} stroke="rgba(255,255,255,0.35)" strokeWidth={0.15} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {kind === "center" ? (
        <>
          <line x1={50} y1={44} x2={50} y2={56} stroke="rgba(var(--accent-rgb),0.9)" strokeWidth={0.2} vectorEffect="non-scaling-stroke" />
          <line x1={46} y1={50} x2={54} y2={50} stroke="rgba(var(--accent-rgb),0.9)" strokeWidth={0.2} vectorEffect="non-scaling-stroke" />
        </>
      ) : null}
    </svg>
  );
}
