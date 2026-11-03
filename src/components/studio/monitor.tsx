"use client";

import { Activity, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CameraEngine, defaultEngineSettings, type EngineSettings, type EngineStats, type HardwareControl } from "@/lib/camera/engine";
import { getLook, LOOK_CATEGORIES, LOOKS } from "@/lib/looks";
import { drawScope, sampleImage, type ScopeMode } from "@/lib/media/analysis";
import { defaultGrade, type Grade } from "@/lib/types";
import { clamp, cn, timecode } from "@/lib/utils";
import { Knob, Meter, Section, Segmented, Slider, Toggle } from "../ui";

/* ───────────────────────── engine hook ───────────────────────── */

export const CAPTURE_FORMATS = [
  { id: "720", label: "720p", w: 1280, h: 720 },
  { id: "1080", label: "1080p", w: 1920, h: 1080 },
  { id: "1440", label: "1440p", w: 2560, h: 1440 },
  { id: "2160", label: "4K UHD", w: 3840, h: 2160 },
  { id: "v1080", label: "9:16", w: 1080, h: 1920 },
  { id: "sq", label: "1:1", w: 1080, h: 1080 },
];

export function useCameraEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const monitorRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<CameraEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [settings, setLocal] = useState<EngineSettings>(defaultEngineSettings);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [camId, setCamId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [hardware, setHardware] = useState<HardwareControl[]>([]);
  const [powered, setPowered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const eng = new CameraEngine(canvasRef.current, monitorRef.current);
    eng.start();
    setEngine(eng);
    const off = eng.subscribe(setStats);
    return () => {
      off();
      eng.destroy();
    };
  }, []);

  const update = useCallback(
    (patch: Partial<EngineSettings>) => {
      engine?.setSettings(patch);
      setLocal((s) => ({ ...s, ...patch }));
    },
    [engine],
  );

  const camRes = (s: EngineSettings) => {
    const long = Math.max(s.width, s.height);
    return long >= 3840 ? { width: 3840, height: 2160 } : long >= 2560 ? { width: 2560, height: 1440 } : long >= 1920 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  };

  const powerOn = useCallback(
    async (opts: { camera?: boolean; mic?: boolean } = { camera: true, mic: true }) => {
      if (!engine) return;
      setError(null);
      try {
        if (opts.camera !== false) {
          const r = camRes(engine.settings);
          await engine.startCamera(camId || undefined, { ...r, fps: engine.settings.fps });
        }
        if (opts.mic !== false) await engine.startMic(micId || undefined).catch((e: Error) => setError(`Microphone: ${e.message}`));
        const d = await CameraEngine.listDevices();
        setDevices(d);
        if (!camId && d.cameras[0]) setCamId(engine.camStream?.getVideoTracks()[0]?.getSettings().deviceId ?? d.cameras[0].deviceId);
        if (!micId && d.mics[0]) setMicId(engine.micStream?.getAudioTracks()[0]?.getSettings().deviceId ?? d.mics[0].deviceId);
        setHardware(engine.getHardware());
        setPowered(true);
      } catch (e) {
        const err = e as Error;
        setError(err.name === "NotAllowedError" ? "Camera permission was declined — allow access in your browser's site settings." : err.message || "Camera unavailable");
      }
    },
    [engine, camId, micId],
  );

  const switchCamera = useCallback(
    async (id: string) => {
      setCamId(id);
      if (!engine) return;
      await engine.startCamera(id, { ...camRes(engine.settings), fps: engine.settings.fps }).catch((e: Error) => setError(e.message));
      setHardware(engine.getHardware());
    },
    [engine],
  );

  const switchMic = useCallback(
    async (id: string, opts?: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean }) => {
      setMicId(id);
      await engine?.startMic(id, opts).catch((e: Error) => setError(e.message));
    },
    [engine],
  );

  const setFormat = useCallback(
    async (w: number, h: number, fps: number) => {
      if (!engine) return;
      const changedRes = Math.max(w, h) !== Math.max(engine.settings.width, engine.settings.height) || fps !== engine.settings.fps;
      update({ width: w, height: h, fps });
      if (powered && changedRes && engine.camStream) await engine.startCamera(camId || undefined, { ...camRes({ ...engine.settings, width: w, height: h }), fps }).catch(() => null);
    },
    [engine, powered, camId, update],
  );

  return { canvasRef, monitorRef, engine, stats, settings, update, devices, camId, micId, switchCamera, switchMic, hardware, powerOn, powered, error, setError, setFormat };
}

export type EngineHook = ReturnType<typeof useCameraEngine>;

/* ───────────────────────── fitted monitor ───────────────────────── */

function useFit(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      let w = r.width, h = r.width / aspect;
      if (h > r.height) {
        h = r.height;
        w = h * aspect;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return { ref, box };
}

export interface OverlayState {
  grid: "off" | "thirds" | "golden" | "center";
  safe: boolean;
  guide: "off" | "2.39" | "1.85" | "9:16" | "4:5" | "1:1";
  prompter: boolean;
  prompterText: string;
  prompterSpeed: number;
}

export const defaultOverlay: OverlayState = { grid: "thirds", safe: false, guide: "off", prompter: false, prompterText: "", prompterSpeed: 40 };

export function MonitorView({ hook, overlay, children, hud }: { hook: EngineHook; overlay: OverlayState; children?: ReactNode; hud?: ReactNode }) {
  const { settings: s, canvasRef, monitorRef } = hook;
  const aspect = s.width / s.height;
  const { ref, box } = useFit(aspect);
  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center">
      <div className="relative overflow-hidden rounded-lg bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] ring-1 ring-line" style={{ width: box.w, height: box.h }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={monitorRef} className={cn("absolute inset-0 h-full w-full", s.monitor ? "opacity-100" : "opacity-0")} />
        <Overlays overlay={overlay} aspect={aspect} />
        {overlay.prompter && overlay.prompterText && <Prompter text={overlay.prompterText} speed={overlay.prompterSpeed} />}
        {hud}
        {children}
      </div>
    </div>
  );
}

function Overlays({ overlay, aspect }: { overlay: OverlayState; aspect: number }) {
  const W = 1000, H = 1000 / aspect;
  const guideRatio = overlay.guide === "off" ? null : overlay.guide === "9:16" ? 9 / 16 : overlay.guide === "4:5" ? 0.8 : overlay.guide === "1:1" ? 1 : Number(overlay.guide);
  let g: { x: number; y: number; w: number; h: number } | null = null;
  if (guideRatio) {
    if (guideRatio > aspect) {
      const h = W / guideRatio;
      g = { x: 0, y: (H - h) / 2, w: W, h };
    } else {
      const w = H * guideRatio;
      g = { x: (W - w) / 2, y: 0, w, h: H };
    }
  }
  const line = "rgba(243,223,177,0.35)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {g && (
        <>
          <path d={`M0 0H${W}V${H}H0Z M${g.x} ${g.y}V${g.y + g.h}H${g.x + g.w}V${g.y}Z`} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
          <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="none" stroke="rgba(216,181,122,0.8)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {overlay.grid === "thirds" &&
        [1 / 3, 2 / 3].map((f) => (
          <g key={f}>
            <line x1={W * f} y1={0} x2={W * f} y2={H} stroke={line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={H * f} x2={W} y2={H * f} stroke={line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      {overlay.grid === "golden" &&
        [0.382, 0.618].map((f) => (
          <g key={f}>
            <line x1={W * f} y1={0} x2={W * f} y2={H} stroke={line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={H * f} x2={W} y2={H * f} stroke={line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      {overlay.grid !== "off" && (
        <g stroke="rgba(243,223,177,0.7)" strokeWidth={1} vectorEffect="non-scaling-stroke">
          <line x1={W / 2 - 14} y1={H / 2} x2={W / 2 + 14} y2={H / 2} vectorEffect="non-scaling-stroke" />
          <line x1={W / 2} y1={H / 2 - 14} x2={W / 2} y2={H / 2 + 14} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {overlay.safe && (
        <>
          <rect x={W * 0.035} y={H * 0.035} width={W * 0.93} height={H * 0.93} fill="none" stroke="rgba(99,195,148,0.55)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
          <rect x={W * 0.05} y={H * 0.05} width={W * 0.9} height={H * 0.9} fill="none" stroke="rgba(111,168,220,0.6)" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

function Prompter({ text, speed }: { text: string; speed: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let y = 0, last = performance.now(), raf = 0;
    const tick = (t: number) => {
      y += ((t - last) / 1000) * speed;
      last = t;
      const el = ref.current;
      if (el) {
        if (y > el.scrollHeight) y = -el.parentElement!.clientHeight * 0.6;
        el.style.transform = `translateY(${-y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, text]);
  return (
    <div className="pointer-events-none absolute inset-x-[12%] top-[8%] bottom-[30%] overflow-hidden" style={{ maskImage: "linear-gradient(transparent, black 25%, black 75%, transparent)" }}>
      <div ref={ref} className="pt-[30%] text-center font-display text-[clamp(18px,2.4vw,38px)] leading-snug text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
        {text.split("\n").map((l, i) => (
          <p key={i} className="mb-3">{l}</p>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── HUD ───────────────────────── */

export function Hud({ hook, codec, label }: { hook: EngineHook; codec: string; label?: string }) {
  const { stats, settings: s } = hook;
  const rec = stats?.recording;
  const live = stats?.live;
  const look = getLook(s.grade.look);
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-[10.5px] text-ivory/85">
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded bg-black/55 px-2 py-1 backdrop-blur">
        {rec ? <span className="rec-dot !h-2 !w-2" /> : <span className="h-2 w-2 rounded-full border border-ivory/50" />}
        <span className={rec ? "text-[#ff8b9b]" : ""}>{rec ? (stats?.paused ? "PAUSE" : "REC") : "STBY"}</span>
        <span className="tc text-ivory">{timecode(stats?.recSeconds ?? 0, s.fps)}</span>
      </div>
      {live && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded bg-ruby/90 px-2.5 py-1 font-sans text-[10px] font-bold tracking-[0.25em] text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> ON AIR {timecode(stats?.liveSeconds ?? 0, s.fps).slice(0, 8)}
        </div>
      )}
      <div className="absolute right-3 top-3 flex items-center gap-2 rounded bg-black/55 px-2 py-1 backdrop-blur">
        {s.autoFrame && <span className={stats?.faceLocked ? "text-jade" : "text-smoke"}>◉ AI FRAME</span>}
        <span>{s.width}×{s.height}</span>
        <span className="text-gold">{stats?.fps.toFixed(0) ?? "--"}/{s.fps}p</span>
      </div>
      <div className="absolute bottom-3 left-3 flex w-40 flex-col gap-1 rounded bg-black/55 px-2 py-1.5 backdrop-blur">
        <div className="flex justify-between text-[9.5px] text-mist">
          <span>{stats?.mic ? "MIC" : "NO MIC"}</span>
          <span>{stats ? `${stats.peakDb.toFixed(0)} dB` : ""}</span>
        </div>
        <Meter db={stats?.levelDb ?? -90} peak={stats?.peakDb} />
      </div>
      <div className="absolute bottom-3 right-3 rounded bg-black/55 px-2 py-1 text-right backdrop-blur">
        <div>{codec}</div>
        {(look || label) && <div className="font-display text-[12px] italic text-gold">{label ?? look?.name}</div>}
      </div>
      {stats?.liveCaption && !s.burnCaptions && (
        <div className="absolute bottom-14 left-1/2 max-w-[80%] -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-center font-sans text-[13px] text-white">{stats.liveCaption}</div>
      )}
    </div>
  );
}

export function PowerGate({ hook, title = "The camera awaits" }: { hook: EngineHook; title?: string }) {
  if (hook.powered) return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_50%_40%,rgba(216,181,122,0.12),rgba(0,0,0,0.92)_70%)] text-center">
      <div className="font-display text-4xl italic text-ivory">{title}</div>
      <p className="max-w-md text-[12.5px] leading-relaxed text-mist">Grant access to your camera and microphone. Footage stays on this device until you choose to send it anywhere.</p>
      <div className="flex gap-3">
        <button onClick={() => hook.powerOn({ camera: true, mic: true })} className="btn btn-gold px-6 py-3">
          <Video size={15} /> Power on camera & mic
        </button>
        <button onClick={() => hook.powerOn({ camera: false, mic: true })} className="btn btn-ghost px-4 py-3">
          <Mic size={14} /> Audio only
        </button>
      </div>
      {hook.error && <p className="max-w-md text-[12px] text-[#ff9aa9]">{hook.error}</p>}
    </div>
  );
}

/* ───────────────────────── scopes ───────────────────────── */

export function ScopePanel({ source }: { source: () => HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ScopeMode>("waveform");
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const src = sourceRef.current();
      const c = ref.current;
      if (!src || !c || !src.width) return;
      const img = sampleImage(src, 192, Math.round((192 * src.height) / src.width));
      if (img) drawScope(c, img, mode);
    }, 120);
    return () => clearInterval(id);
  }, [mode]);
  return (
    <div>
      <canvas ref={ref} width={300} height={150} className="w-full rounded-md border border-line" />
      <Segmented
        size="sm"
        className="mt-2 w-full"
        value={mode}
        onChange={setMode}
        options={[
          { value: "histogram", label: "Histo" },
          { value: "waveform", label: "Wave" },
          { value: "parade", label: "Parade" },
          { value: "vectorscope", label: "Vector" },
        ]}
      />
    </div>
  );
}

/* ───────────────────────── looks & grade ───────────────────────── */

export function LookBrowser({ grade, onChange, compact }: { grade: Grade; onChange: (g: Grade) => void; compact?: boolean }) {
  const [cat, setCat] = useState<string>("All");
  const list = cat === "All" ? LOOKS : LOOKS.filter((l) => l.category === cat);
  return (
    <div>
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 scroll-thin">
        {["All", ...LOOK_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("chip shrink-0 !py-0.5 transition", c === cat ? "!border-gold/60 !text-gold-hi" : "hover:!text-ivory")}>
            {c}
          </button>
        ))}
      </div>
      <div className={cn("grid gap-1.5 overflow-y-auto pr-1 scroll-thin", compact ? "max-h-[220px] grid-cols-2" : "max-h-[300px] grid-cols-2")}>
        <button onClick={() => onChange({ ...grade, look: null })} className={cn("rounded-lg border p-2 text-left transition", !grade.look ? "border-gold/60 bg-gold/10" : "border-line hover:border-line-2")}>
          <div className="mb-1.5 h-5 rounded checker" />
          <div className="text-[11px] font-semibold text-ivory">Original</div>
          <div className="truncate text-[9.5px] text-smoke">Camera native</div>
        </button>
        {list.map((l) => (
          <button key={l.id} title={`${l.category} — ${l.description}`} onClick={() => onChange({ ...grade, look: l.id, lutIntensity: grade.look ? grade.lutIntensity : 1 })} className={cn("rounded-lg border p-2 text-left transition", grade.look === l.id ? "border-gold/60 bg-gold/10" : "border-line hover:border-line-2")}>
            <div className="mb-1.5 flex h-5 overflow-hidden rounded">
              {l.swatch.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </div>
            <div className="truncate text-[11px] font-semibold text-ivory">{l.name}</div>
            <div className="truncate text-[9.5px] text-smoke">{l.category}</div>
          </button>
        ))}
      </div>
      {grade.look && (
        <Slider className="mt-3" label="Look intensity" value={grade.lookAmount} min={0} max={1.5} reset={1} onChange={(v) => onChange({ ...grade, lookAmount: v })} format={(v) => `${Math.round(v * 100)}%`} />
      )}
    </div>
  );
}

export function QuickGrade({ grade, onChange, onStart }: { grade: Grade; onChange: (g: Grade) => void; onStart?: () => void }) {
  const set = (k: keyof Grade) => (v: number) => onChange({ ...grade, [k]: v });
  const f1 = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));
  return (
    <div className="space-y-2.5">
      <Slider label="Exposure" value={grade.exposure} min={-3} max={3} reset={0} bipolar onStart={onStart} onChange={set("exposure")} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`} />
      <Slider label="Contrast" value={grade.contrast} min={0.4} max={2} reset={1} bipolar onStart={onStart} onChange={set("contrast")} />
      <Slider label="Saturation" value={grade.saturation} min={0} max={2} reset={1} bipolar onStart={onStart} onChange={set("saturation")} />
      <Slider label="Temperature" value={grade.temperature} min={-1} max={1} reset={0} bipolar onStart={onStart} onChange={set("temperature")} format={f1} />
      <Slider label="Tint" value={grade.tint} min={-1} max={1} reset={0} bipolar onStart={onStart} onChange={set("tint")} format={f1} />
      <Slider label="Highlights" value={grade.highlights} min={-1} max={1} reset={0} bipolar onStart={onStart} onChange={set("highlights")} format={f1} />
      <Slider label="Shadows" value={grade.shadows} min={-1} max={1} reset={0} bipolar onStart={onStart} onChange={set("shadows")} format={f1} />
      <div className="grid grid-cols-4 gap-1 pt-2">
        <Knob label="Grain" value={grade.grain} min={0} max={1} reset={0} onStart={onStart} onChange={set("grain")} size={40} />
        <Knob label="Vignette" value={grade.vignette} min={0} max={1} reset={0} onStart={onStart} onChange={set("vignette")} size={40} />
        <Knob label="Halation" value={grade.halation} min={0} max={1} reset={0} onStart={onStart} onChange={set("halation")} size={40} />
        <Knob label="Bloom" value={grade.bloom} min={0} max={1} reset={0} onStart={onStart} onChange={set("bloom")} size={40} />
      </div>
      <button onClick={() => onChange(defaultGrade())} className="text-[10.5px] uppercase tracking-[0.2em] text-smoke transition hover:text-gold">
        Reset grade
      </button>
    </div>
  );
}

/* ───────────────────────── device & audio ───────────────────────── */

export function DevicePanel({ hook }: { hook: EngineHook }) {
  const { devices, camId, micId, switchCamera, switchMic, settings: s, update, hardware, engine, setFormat, stats } = hook;
  const [proc, setProc] = useState({ echoCancellation: true, noiseSuppression: true, autoGainControl: false });
  const fmt = CAPTURE_FORMATS.find((f) => f.w === s.width && f.h === s.height)?.id ?? "1080";
  return (
    <>
      <Section title="Sources" right={<span className="flex gap-1.5 text-mist">{stats?.camera ? <Video size={12} className="text-jade" /> : <VideoOff size={12} />}{stats?.mic ? <Mic size={12} className="text-jade" /> : <MicOff size={12} />}</span>}>
        <div className="space-y-2">
          <select className="field !py-1.5 !text-[12px]" value={camId} onChange={(e) => switchCamera(e.target.value)}>
            {!devices.cameras.length && <option value="">Camera — power on to list</option>}
            {devices.cameras.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
            ))}
          </select>
          <select className="field !py-1.5 !text-[12px]" value={micId} onChange={(e) => switchMic(e.target.value, proc)}>
            {!devices.mics.length && <option value="">Microphone — power on to list</option>}
            {devices.mics.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
        </div>
      </Section>
      <Section title="Format">
        <div className="grid grid-cols-3 gap-1">
          {CAPTURE_FORMATS.map((f) => (
            <button key={f.id} onClick={() => setFormat(f.w, f.h, s.fps)} className={cn("rounded-md border py-1.5 text-[11px] font-semibold transition", fmt === f.id ? "border-gold/60 bg-gold/10 text-gold-hi" : "border-line text-mist hover:text-ivory")}>
              {f.label}
            </button>
          ))}
        </div>
        <Segmented size="sm" className="mt-2 w-full" value={s.fps} onChange={(v) => setFormat(s.width, s.height, v)} options={[24, 25, 30, 50, 60].map((v) => ({ value: v, label: `${v}p` }))} />
        <div className="mt-2 space-y-0.5">
          <Toggle label="Mirror preview & output" checked={s.mirror} onChange={(v) => update({ mirror: v })} />
        </div>
        <Slider className="mt-2" label="Digital zoom" value={s.zoom} min={1} max={4} reset={1} onChange={(v) => update({ zoom: v })} format={(v) => `${v.toFixed(1)}×`} />
        {s.zoom > 1 && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Slider label="Pan" value={s.panX} min={-1} max={1} reset={0} bipolar onChange={(v) => update({ panX: v })} />
            <Slider label="Tilt" value={s.panY} min={-1} max={1} reset={0} bipolar onChange={(v) => update({ panY: v })} />
          </div>
        )}
      </Section>
      {hardware.length > 0 && (
        <Section title="Lens & sensor">
          <div className="space-y-2">
            {hardware.map((h) => (
              <Slider key={h.name} label={h.name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} value={h.value} min={h.min} max={h.max} step={h.step} onChange={(v) => {
                void engine?.applyHardware(h.name, v);
                hook.hardware.splice(hook.hardware.indexOf(h), 1, { ...h, value: v });
                update({});
              }} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Audio desk" right={<Activity size={12} className="text-gold/60" />}>
        <div className="flex items-center gap-4">
          <Knob label="Gain" value={s.micGain} min={0} max={3} reset={1} onChange={(v) => update({ micGain: v })} format={(v) => `${(20 * Math.log10(Math.max(v, 0.001))).toFixed(1)}dB`} />
          <div className="flex h-16 gap-1">
            <Meter vertical db={stats?.levelDb ?? -90} peak={stats?.peakDb} />
            <Meter vertical db={(stats?.levelDb ?? -90) - 1.5} peak={stats?.peakDb} />
          </div>
          <div className="tc text-[10px] leading-relaxed text-smoke">
            <div>RMS {stats ? stats.levelDb.toFixed(1) : "--"}</div>
            <div>PK {stats ? stats.peakDb.toFixed(1) : "--"}</div>
            <div>48 kHz</div>
          </div>
        </div>
        <div className="mt-2">
          <Toggle label="Studio Voice" hint="HPF · de-mud · presence · air · compressor · limiter" checked={s.studioVoice} onChange={(v) => update({ studioVoice: v })} />
          {(["noiseSuppression", "echoCancellation", "autoGainControl"] as const).map((k) => (
            <Toggle key={k} label={k === "noiseSuppression" ? "AI noise suppression" : k === "echoCancellation" ? "Echo cancellation" : "Auto gain"} checked={proc[k]} onChange={(v) => {
              const next = { ...proc, [k]: v };
              setProc(next);
              if (micId) void switchMic(micId, next);
            }} />
          ))}
        </div>
      </Section>
    </>
  );
}

export function MonitoringPanel({ hook, overlay, setOverlay }: { hook: EngineHook; overlay: OverlayState; setOverlay: (o: OverlayState) => void }) {
  const { settings: s, update, stats } = hook;
  return (
    <>
      <Section title="Exposure tools">
        <Segmented size="sm" className="w-full" value={s.monitor} onChange={(v) => update({ monitor: v })} options={[
          { value: 0, label: "Clean" },
          { value: 1, label: "Zebra" },
          { value: 2, label: "False" },
          { value: 3, label: "Peak" },
        ]} />
        <p className="mt-1.5 text-[10px] leading-relaxed text-smoke">Monitoring passes are never recorded. False colour: purple crush · blue under · green 18% · pink skin · yellow/red clip.</p>
      </Section>
      <Section title="Guides">
        <Segmented size="sm" className="w-full" value={overlay.grid} onChange={(v) => setOverlay({ ...overlay, grid: v })} options={[
          { value: "off", label: "Off" },
          { value: "thirds", label: "Thirds" },
          { value: "golden", label: "Golden" },
          { value: "center", label: "Centre" },
        ]} />
        <Segmented size="sm" className="mt-2 w-full" value={overlay.guide} onChange={(v) => setOverlay({ ...overlay, guide: v })} options={[
          { value: "off", label: "—" },
          { value: "2.39", label: "2.39" },
          { value: "1.85", label: "1.85" },
          { value: "9:16", label: "9:16" },
          { value: "4:5", label: "4:5" },
          { value: "1:1", label: "1:1" },
        ]} />
        <Toggle label="SMPTE safe areas" hint="Action 93% · Title 90%" checked={overlay.safe} onChange={(v) => setOverlay({ ...overlay, safe: v })} />
      </Section>
      <Section title="AI vision" right={<span className={cn("text-[9.5px] uppercase tracking-[0.2em]", stats?.vision === "ready" ? "text-jade" : stats?.vision === "error" ? "text-ruby" : "text-smoke")}>{stats?.vision ?? "idle"}</span>}>
        <Toggle label="Auto-framing" hint="Face-tracked digital pan & zoom (Center Stage)" checked={s.autoFrame} onChange={(v) => update({ autoFrame: v })} />
        <Segmented size="sm" className="mt-2 w-full" value={s.portrait} onChange={(v) => update({ portrait: v })} options={[
          { value: "off", label: "No portrait" },
          { value: "blur", label: "Bokeh blur" },
          { value: "replace", label: "Backdrop" },
        ]} />
        {s.portrait === "replace" && (
          <div className="mt-2 flex items-center gap-2">
            {["#1a1410", "#0d1b2a", "#2b0f1a", "#10261c", "#262626"].map((c) => (
              <button key={c} onClick={() => update({ portraitColor: c })} className={cn("h-6 w-6 rounded-full border", s.portraitColor === c ? "border-gold" : "border-line-2")} style={{ background: c }} />
            ))}
            <input type="color" value={s.portraitColor} onChange={(e) => update({ portraitColor: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" />
          </div>
        )}
        <p className="mt-1.5 text-[10px] text-smoke">On-device MediaPipe models — no frames leave this computer.</p>
      </Section>
      <Section title="Teleprompter">
        <Toggle label="Show prompter" hint="Visible on monitor only" checked={overlay.prompter} onChange={(v) => setOverlay({ ...overlay, prompter: v })} />
        {overlay.prompter && (
          <>
            <textarea value={overlay.prompterText} onChange={(e) => setOverlay({ ...overlay, prompterText: e.target.value })} rows={4} placeholder="Paste your script…" className="field mt-2 !text-[12px]" />
            <Slider className="mt-2" label="Scroll speed" value={overlay.prompterSpeed} min={10} max={140} step={1} onChange={(v) => setOverlay({ ...overlay, prompterSpeed: v })} format={(v) => `${v.toFixed(0)} px/s`} />
          </>
        )}
      </Section>
    </>
  );
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV({ ...initial, ...JSON.parse(raw) } as T);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(key, JSON.stringify(nv));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set];
}

export const clampNum = clamp;
