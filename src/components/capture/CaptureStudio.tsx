"use client";

import { Camera, Captions, Circle, Clapperboard, Download, Film, Monitor, Pause, Play, Scissors, Square, Star, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BITRATES, speechSupported, supportedCodecs, type CodecOption, type SceneLayout } from "@/lib/camera/engine";
import { fetchAssets, getBlob, ingestBlob, updateAsset } from "@/lib/media/media";
import type { AssetMeta } from "@/lib/types";
import { cn, downloadBlob, formatBytes, jsonFetch, safeFileName, shortTime, timecode } from "@/lib/utils";
import { Section, Segmented, Spinner, Toggle, toast } from "../ui";
import { defaultOverlay, DevicePanel, Hud, LookBrowser, MonitoringPanel, MonitorView, PowerGate, QuickGrade, ScopePanel, useCameraEngine, useLocalState, type OverlayState } from "../studio/monitor";

interface Slate {
  production: string;
  scene: string;
  take: number;
  roll: string;
  camera: string;
  director: string;
  dp: string;
  notes: string;
}

const defaultSlate: Slate = { production: "Untitled", scene: "1", take: 1, roll: "A001", camera: "A", director: "", dp: "", notes: "" };

export function CaptureStudio() {
  const router = useRouter();
  const hook = useCameraEngine();
  const { engine, stats, settings, update } = hook;
  const [overlay, setOverlay] = useState<OverlayState>(defaultOverlay);
  const [slate, setSlate] = useLocalState<Slate>("lumiere.slate", defaultSlate);
  const [codecs, setCodecs] = useState<CodecOption[]>([]);
  const [codecId, setCodecId] = useState("");
  const [mbps, setMbps] = useState(16);
  const [countdown, setCountdown] = useState(true);
  const [count, setCount] = useState(0);
  const [captions, setCaptions] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [takes, setTakes] = useState<AssetMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);
  const [flash, setFlash] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [tab, setTab] = useState<"look" | "grade" | "monitor">("look");

  useEffect(() => {
    const list = supportedCodecs();
    setCodecs(list);
    setCodecId(list[0]?.id ?? "");
    fetchAssets()
      .then((a) => setTakes(a.filter((x) => ["camera", "screen", "photo"].includes(x.source)).slice(0, 24)))
      .catch(() => null);
    navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  }, []);

  const codec = useMemo(() => codecs.find((c) => c.id === codecId) ?? codecs[0], [codecs, codecId]);

  const beginRecording = useCallback(() => {
    if (!engine || !codec) return;
    void navigator.storage?.persist?.();
    engine.startRecording(codec, mbps);
    setMarks([]);
    if (captions) engine.startCaptions(lang);
  }, [engine, codec, mbps, captions, lang]);

  const record = useCallback(async () => {
    if (!engine || !codec) {
      toast("This browser cannot record video — try Chrome, Edge or Safari.", "error");
      return;
    }
    if (stats?.recording) {
      setSaving(true);
      const res = await engine.stopRecording();
      if (captions) engine.stopCaptions();
      if (res && res.blob.size) {
        const name = `${slate.production} · S${slate.scene} T${slate.take}`;
        const asset = await ingestBlob(res.blob, {
          name,
          source: settings.layout === "screen" ? "screen" : "camera",
          durationHint: res.duration,
          captions: res.captions,
          slate: { production: slate.production, scene: slate.scene, take: String(slate.take), roll: slate.roll, camera: slate.camera, director: slate.director, dp: slate.dp, notes: slate.notes, codec: codec.label, bitrate: `${mbps} Mbps`, fps: String(settings.fps), look: settings.grade.look ?? "none" },
          tags: [settings.grade.look ? `look:${settings.grade.look}` : "native", `${settings.width}x${settings.height}`],
          analysis: { marks },
        });
        setTakes((t) => [asset, ...t]);
        setSlate({ ...slate, take: slate.take + 1 });
        toast(`${name} saved to the Vault · ${shortTime(res.duration)}`, "success");
        navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
      }
      setSaving(false);
      return;
    }
    if (!hook.powered) {
      toast("Power on the camera first.", "error");
      return;
    }
    if (countdown) {
      for (let i = 3; i > 0; i--) {
        setCount(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCount(0);
    }
    beginRecording();
  }, [engine, codec, stats?.recording, captions, slate, setSlate, settings, mbps, marks, countdown, beginRecording, hook.powered]);

  const photo = useCallback(async () => {
    if (!engine) return;
    const blob = await engine.takePhoto("image/jpeg");
    if (!blob) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const asset = await ingestBlob(blob, { name: `${slate.production} · Still S${slate.scene}`, source: "photo", slate: { production: slate.production, scene: slate.scene } });
    setTakes((t) => [asset, ...t]);
    toast("Still frame captured", "success");
  }, [engine, slate]);

  const clap = useCallback(() => {
    if (!stats?.recording) return;
    const t = stats.recSeconds;
    setMarks((m) => [...m, Math.round(t * 100) / 100]);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    try {
      const ac = new AudioContext();
      const o = ac.createOscillator();
      o.frequency.value = 1000;
      o.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.08);
      setTimeout(() => void ac.close(), 300);
    } catch {
      /* no audio */
    }
  }, [stats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        void record();
      }
      if (e.key.toLowerCase() === "p") void photo();
      if (e.key.toLowerCase() === "m") clap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, photo, clap]);

  const setScene = async (layout: SceneLayout) => {
    if ((layout === "screen" || layout === "pip" || layout === "split") && !stats?.screen) {
      try {
        await engine?.startScreen();
      } catch {
        toast("Screen capture was cancelled.", "error");
        return;
      }
    }
    update({ layout });
  };

  const toggleCircle = async (a: AssetMeta) => {
    const next = !a.favorite;
    setTakes((t) => t.map((x) => (x.id === a.id ? { ...x, favorite: next } : x)));
    await updateAsset(a.id, { favorite: next });
  };

  const openInMontage = async (a: AssetMeta) => {
    const d = await jsonFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ name: a.slate.production && a.slate.production !== "Untitled" ? a.slate.production : a.name, width: settings.width, height: settings.height, fps: settings.fps, aspect: settings.width < settings.height ? "9:16" : "16:9" }) });
    router.push(`/editor/${d.project.id}?add=${a.id}`);
  };

  const download = async (a: AssetMeta) => {
    const b = await getBlob(a.id);
    if (!b) return toast("This take isn't stored on this device.", "error");
    downloadBlob(b, `${safeFileName(a.name)}.${a.kind === "image" ? "jpg" : b.type.includes("mp4") ? "mp4" : "webm"}`);
  };

  const recording = Boolean(stats?.recording);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-sm italic text-gold/60">II</span>
          <h1 className="font-display text-3xl text-ivory">Capture</h1>
          <span className="hidden text-[11px] text-smoke md:inline">Cinema camera monitor · on-device recording</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-mist">
          {storage && storage.quota > 0 && (
            <span className="chip" title="Local media storage">
              {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
            </span>
          )}
          <span className="chip">{codec?.label ?? "No recorder"}</span>
          <span className="chip">{mbps} Mbps</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left */}
        <aside className="w-[270px] shrink-0 overflow-y-auto border-r border-line px-4 scroll-thin">
          <DevicePanel hook={hook} />
          <Section title="Recording">
            <select className="field !py-1.5 !text-[12px]" value={codecId} onChange={(e) => setCodecId(e.target.value)}>
              {codecs.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <Segmented size="sm" className="mt-2 w-full" value={mbps} onChange={setMbps} options={BITRATES.map((b) => ({ value: b.mbps, label: b.label, title: `${b.mbps} Mbps` }))} />
            <div className="mt-2">
              <Toggle label="3-2-1 countdown" checked={countdown} onChange={setCountdown} />
              <Toggle label="Burn-in timecode" checked={settings.burnTimecode} onChange={(v) => update({ burnTimecode: v })} />
              <Toggle label="Live captions" hint={speechSupported() ? "Speech-to-text, saved as SRT-ready captions" : "Not supported in this browser"} checked={captions} onChange={(v) => speechSupported() && setCaptions(v)} />
              {captions && (
                <>
                  <select className="field mt-1 !py-1.5 !text-[12px]" value={lang} onChange={(e) => setLang(e.target.value)}>
                    {[["en-US", "English (US)"], ["en-GB", "English (UK)"], ["fr-FR", "Français"], ["es-ES", "Español"], ["de-DE", "Deutsch"], ["pt-BR", "Português"], ["it-IT", "Italiano"], ["ja-JP", "日本語"], ["zh-CN", "中文"], ["ar-SA", "العربية"], ["hi-IN", "हिन्दी"], ["yo-NG", "Yorùbá"]].map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <Toggle label="Burn captions into picture" checked={settings.burnCaptions} onChange={(v) => update({ burnCaptions: v })} />
                </>
              )}
            </div>
          </Section>
        </aside>

        {/* center */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 p-5">
            <MonitorView hook={hook} overlay={overlay} hud={<Hud hook={hook} codec={`${codec?.label ?? ""} · ${mbps} Mbps`} />}>
              <PowerGate hook={hook} />
              {count > 0 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                  <span key={count} className="animate-rise font-display text-[160px] italic leading-none text-gold-hi drop-shadow-[0_0_40px_rgba(216,181,122,0.6)]">{count}</span>
                </div>
              )}
              {flash && <div className="absolute inset-0 z-20 bg-white/70" />}
              {recording && <div className="pointer-events-none absolute inset-0 z-[5] ring-2 ring-inset ring-ruby/70" />}
            </MonitorView>
          </div>

          {/* transport */}
          <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-3">
            <Segmented size="sm" value={settings.layout} onChange={setScene} options={[
              { value: "camera", label: <span className="flex items-center gap-1"><Camera size={11} /> Camera</span> },
              { value: "screen", label: <span className="flex items-center gap-1"><Monitor size={11} /> Screen</span> },
              { value: "pip", label: "Screen + Cam" },
              { value: "split", label: "Split" },
            ]} />
            <div className="flex items-center gap-4">
              <button onClick={photo} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-2 text-mist transition hover:border-gold/60 hover:text-gold" title="Still frame (P)">
                <Camera size={16} strokeWidth={1.5} />
              </button>
              <button onClick={() => void record()} disabled={saving} className={cn("group relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition", recording ? "border-ruby" : "border-ivory/70 hover:border-ivory")} title="Record (Space)">
                {saving ? <Spinner className="!h-6 !w-6" /> : recording ? <Square size={20} className="fill-ruby text-ruby" /> : <Circle size={44} className="fill-ruby text-ruby transition group-hover:scale-95" />}
              </button>
              <button onClick={() => engine?.pauseRecording()} disabled={!recording} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-2 text-mist transition hover:border-gold/60 hover:text-gold disabled:opacity-30" title="Pause / resume">
                {stats?.paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button onClick={clap} disabled={!recording} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-2 text-mist transition hover:border-gold/60 hover:text-gold disabled:opacity-30" title="Sync mark / clap (M)">
                <Clapperboard size={15} strokeWidth={1.5} />
              </button>
            </div>
            <div className="text-right">
              <div className={cn("tc text-2xl", recording ? "text-[#ff9aa9]" : "text-ivory/80")}>{timecode(stats?.recSeconds ?? 0, settings.fps)}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-smoke">
                S{slate.scene} · T{slate.take} · {slate.roll} {marks.length ? `· ${marks.length} marks` : ""}
              </div>
            </div>
          </div>

          {/* takes */}
          <div className="h-[150px] shrink-0 border-t border-line px-6 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow flex items-center gap-2"><Film size={11} /> Takes</span>
              <span className="text-[10.5px] text-smoke">★ circle take · drag your best into Montage</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scroll-thin">
              {!takes.length && <div className="py-6 text-[12px] italic text-smoke">No takes yet. Press Space to roll.</div>}
              {takes.map((a) => (
                <div key={a.id} className="group relative w-[168px] shrink-0 overflow-hidden rounded-lg border border-line bg-ink-3">
                  <div className="relative aspect-video bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.thumbnail && <img src={a.thumbnail} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[9px] text-ivory">{a.kind === "image" ? "STILL" : shortTime(a.durationSec)}</span>
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 opacity-0 transition group-hover:opacity-100">
                      {a.kind !== "image" && (
                        <button onClick={() => openInMontage(a)} className="rounded-full bg-gold/90 p-1.5 text-ink" title="Edit in Montage"><Scissors size={12} /></button>
                      )}
                      <button onClick={() => download(a)} className="rounded-full bg-white/15 p-1.5 text-ivory" title="Download"><Download size={12} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1">
                    <span className="truncate text-[10.5px] text-ivory/85">{a.name}</span>
                    <button onClick={() => toggleCircle(a)} title="Circle take">
                      <Star size={12} className={a.favorite ? "fill-gold text-gold" : "text-smoke"} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* right */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-line px-4 scroll-thin">
          <Section title="Slate" right={<Timer size={12} className="text-gold/60" />}>
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="flex h-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className={cn("flex-1 -skew-x-[30deg]", i % 2 ? "bg-ivory/80" : "bg-ink")} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-px bg-line">
                {([["production", "Production"], ["scene", "Scene"], ["roll", "Roll"], ["camera", "Cam"], ["director", "Director"], ["dp", "DP"]] as const).map(([k, l]) => (
                  <label key={k} className={cn("bg-ink-2 px-2 py-1", k === "production" && "col-span-3")}>
                    <span className="block text-[8.5px] uppercase tracking-[0.25em] text-smoke">{l}</span>
                    <input value={String(slate[k])} onChange={(e) => setSlate({ ...slate, [k]: e.target.value })} className="w-full bg-transparent font-display text-[15px] italic text-ivory outline-none" />
                  </label>
                ))}
                <label className="col-span-3 flex items-center justify-between bg-ink-2 px-2 py-1">
                  <span className="text-[8.5px] uppercase tracking-[0.25em] text-smoke">Take</span>
                  <span className="flex items-center gap-2">
                    <button onClick={() => setSlate({ ...slate, take: Math.max(1, slate.take - 1) })} className="text-mist hover:text-gold">−</button>
                    <span className="tc text-lg text-gold-hi">{slate.take}</span>
                    <button onClick={() => setSlate({ ...slate, take: slate.take + 1 })} className="text-mist hover:text-gold">+</button>
                  </span>
                </label>
              </div>
            </div>
            <input value={slate.notes} onChange={(e) => setSlate({ ...slate, notes: e.target.value })} placeholder="Script supervisor notes" className="field mt-2 !text-[11.5px]" />
          </Section>
          <Segmented size="sm" className="mt-1 w-full" value={tab} onChange={setTab} options={[{ value: "look", label: "Looks" }, { value: "grade", label: "Grade" }, { value: "monitor", label: "Monitor" }]} />
          {tab === "look" && (
            <Section title="Live LUT">
              <LookBrowser compact grade={settings.grade} onChange={(g) => update({ grade: g })} />
              <Toggle label="Scope letterbox" hint="Baked 2.39:1 matte" checked={settings.letterbox === 2.39} onChange={(v) => update({ letterbox: v ? 2.39 : null })} />
            </Section>
          )}
          {tab === "grade" && (
            <Section title="In-camera grade">
              <QuickGrade grade={settings.grade} onChange={(g) => update({ grade: g })} />
            </Section>
          )}
          {tab === "monitor" && <MonitoringPanel hook={hook} overlay={overlay} setOverlay={setOverlay} />}
          <Section title="Scopes" right={<Captions size={12} className="text-gold/60" />}>
            <ScopePanel source={() => engine?.canvas ?? null} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
