"use client";

import { Camera, Info, Layers, Monitor, PictureInPicture2, Plus, Radio, SplitSquareHorizontal, Trash2, Tv } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supportedCodecs, type SceneLayout } from "@/lib/camera/engine";
import { ingestBlob } from "@/lib/media/media";
import { cn, jsonFetch, relativeDate, shortTime, timecode } from "@/lib/utils";
import { Modal, Section, Segmented, Slider, Spinner, Toggle, toast } from "../ui";
import { defaultOverlay, DevicePanel, Hud, LookBrowser, MonitoringPanel, MonitorView, PowerGate, QuickGrade, useCameraEngine, type OverlayState } from "../studio/monitor";

interface Destination {
  id: string;
  name: string;
  platform: string;
  whipUrl: string;
  streamKey: string;
  hasKey: boolean;
  enabled: boolean;
}
interface Session {
  id: string;
  title: string;
  status: string;
  startedAt: string;
  durationSec: number;
  peakKbps: number;
  avgFps: number;
  resolution: string;
}

const PLATFORMS = [
  { id: "twitch", label: "Twitch", url: "https://g.webrtc.live-video.net:4443/v2/offer", keyLabel: "Twitch stream key", note: "Twitch accepts WHIP natively — paste your stream key from the Creator Dashboard." },
  { id: "cloudflare", label: "Cloudflare Stream", url: "", keyLabel: "Token (optional)", note: "Use the WHIP URL of a Live Input (…/webRTC/publish). Add Live Outputs in Cloudflare to simulcast to YouTube, Facebook, LinkedIn & X via RTMP." },
  { id: "millicast", label: "Dolby Millicast", url: "https://director.millicast.com/api/whip/", keyLabel: "Publishing token", note: "Append your stream name to the URL; the publishing token is sent as a bearer token." },
  { id: "livekit", label: "LiveKit", url: "", keyLabel: "Ingress stream key", note: "Create a WHIP ingress and paste its URL and stream key." },
  { id: "custom", label: "Custom WHIP", url: "", keyLabel: "Bearer token", note: "Any RFC 9725 WHIP endpoint — OBS-compatible servers, MediaMTX, Janus, Ant Media, SRS." },
];

const SCENES: { id: SceneLayout; label: string; icon: typeof Camera }[] = [
  { id: "camera", label: "Camera", icon: Camera },
  { id: "screen", label: "Screen", icon: Monitor },
  { id: "pip", label: "Screen + Cam", icon: PictureInPicture2 },
  { id: "split", label: "Split", icon: SplitSquareHorizontal },
  { id: "starting", label: "Starting Soon", icon: Tv },
  { id: "brb", label: "Be Right Back", icon: Layers },
  { id: "ending", label: "Ending", icon: Tv },
];

export function BroadcastStudio() {
  const hook = useCameraEngine();
  const { engine, stats, settings, update } = hook;
  const [overlay, setOverlay] = useState<OverlayState>({ ...defaultOverlay, grid: "off" });
  const [dests, setDests] = useState<Destination[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("Live from the Atelier");
  const [kbps, setKbps] = useState(4500);
  const [recordIso, setRecordIso] = useState(true);
  const [going, setGoing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ platform: "twitch", name: "Twitch", whipUrl: PLATFORMS[0].url, streamKey: "" });
  const [tab, setTab] = useState<"out" | "look" | "devices" | "monitor">("out");
  const sessionRef = useRef<{ id: string; peak: number; fpsSum: number; n: number } | null>(null);

  const load = useCallback(async () => {
    const d = await jsonFetch<{ destinations: Destination[]; sessions: Session[] }>("/api/streams");
    setDests(d.destinations);
    setSessions(d.sessions);
    setSelected((s) => (s.length ? s : d.destinations.filter((x) => x.enabled).map((x) => x.id)));
  }, []);

  useEffect(() => {
    void load().catch(() => null);
  }, [load]);

  useEffect(() => {
    const s = sessionRef.current;
    if (s && stats?.live && stats.stream) {
      s.peak = Math.max(s.peak, stats.stream.kbps);
      s.fpsSum += stats.stream.fps;
      s.n++;
    }
  }, [stats]);

  const live = Boolean(stats?.live);

  const goLive = async () => {
    if (!engine) return;
    const targets = dests.filter((d) => selected.includes(d.id));
    if (!targets.length) {
      toast("Add or select at least one destination.", "error");
      setTab("out");
      return;
    }
    setGoing(true);
    try {
      if (!hook.powered) await hook.powerOn();
      const { session } = await jsonFetch<{ session: Session }>("/api/streams", {
        method: "POST",
        body: JSON.stringify({ kind: "session", title, destinationIds: targets.map((t) => t.id), resolution: `${settings.width}x${settings.height}@${settings.fps}` }),
      });
      const res = await engine.goLive(targets, kbps);
      if (!res.connected) {
        await jsonFetch(`/api/streams/${session.id}?kind=session`, { method: "PATCH", body: JSON.stringify({ status: "failed", ended: true, notes: res.errors.join(" | ") }) });
        toast(res.errors[0] ?? "Could not connect to any destination.", "error");
      } else {
        sessionRef.current = { id: session.id, peak: 0, fpsSum: 0, n: 0 };
        res.errors.forEach((e) => toast(e, "error"));
        toast(`On air → ${res.connected} destination${res.connected > 1 ? "s" : ""}`, "success");
        if (recordIso) {
          const codec = supportedCodecs()[0];
          if (codec) engine.startRecording(codec, Math.max(8, kbps / 1000 * 2));
        }
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setGoing(false);
      void load();
    }
  };

  const endLive = async () => {
    if (!engine) return;
    setGoing(true);
    const duration = stats?.liveSeconds ?? 0;
    await engine.endLive();
    const s = sessionRef.current;
    if (s) {
      await jsonFetch(`/api/streams/${s.id}?kind=session`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ended", ended: true, durationSec: duration, peakKbps: Math.round(s.peak), avgFps: s.n ? Math.round((s.fpsSum / s.n) * 10) / 10 : 0 }),
      }).catch(() => null);
      sessionRef.current = null;
    }
    if (engine && stats?.recording) {
      const rec = await engine.stopRecording();
      if (rec?.blob.size) {
        await ingestBlob(rec.blob, { name: `${title} · Broadcast ISO`, source: "broadcast", durationHint: rec.duration, tags: ["broadcast"] });
        toast("Broadcast ISO saved to the Vault", "success");
      }
    }
    setGoing(false);
    toast(`Broadcast ended · ${shortTime(duration)}`, "success");
    void load();
  };

  const addDest = async () => {
    try {
      await jsonFetch("/api/streams", { method: "POST", body: JSON.stringify(form) });
      setAdding(false);
      setForm({ platform: "twitch", name: "Twitch", whipUrl: PLATFORMS[0].url, streamKey: "" });
      await load();
      toast("Destination saved — key stored server-side", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const removeDest = async (id: string) => {
    await fetch(`/api/streams/${id}`, { method: "DELETE" });
    setSelected((s) => s.filter((x) => x !== id));
    void load();
  };

  const setScene = async (layout: SceneLayout) => {
    if ((layout === "screen" || layout === "pip" || layout === "split") && !stats?.screen) {
      try {
        await engine?.startScreen();
      } catch {
        toast("Screen share cancelled.", "error");
        return;
      }
    }
    update({ layout });
  };

  const platform = PLATFORMS.find((p) => p.id === form.platform)!;
  const health = stats?.stream;
  const healthTone = !health ? "text-smoke" : health.state === "connected" && health.rttMs < 250 ? "text-jade" : health.state === "connected" ? "text-gold" : "text-ruby";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-sm italic text-gold/60">III</span>
          <h1 className="font-display text-3xl text-ivory">Broadcast</h1>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="ml-2 w-72 border-b border-transparent bg-transparent font-display text-lg italic text-mist outline-none transition focus:border-gold/40 focus:text-ivory" />
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("chip", live ? "!border-ruby/60 !text-[#ff9aa9]" : "")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse bg-ruby" : "bg-smoke")} />
            {live ? `ON AIR · ${timecode(stats?.liveSeconds ?? 0, settings.fps).slice(0, 8)}` : "OFF AIR"}
          </span>
          {live ? (
            <button onClick={endLive} disabled={going} className="btn btn-ghost !border-ruby/50 px-5 py-2 !text-[#ff9aa9]">
              {going ? <Spinner /> : <span className="h-2 w-2 bg-ruby" />} End broadcast
            </button>
          ) : (
            <button onClick={goLive} disabled={going} className="btn btn-ruby px-6 py-2">
              {going ? <Spinner className="!border-white/30 !border-t-white" /> : <Radio size={14} />} Go live
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[250px] shrink-0 overflow-y-auto border-r border-line px-4 scroll-thin">
          <Section title="Scenes">
            <div className="grid grid-cols-2 gap-1.5">
              {SCENES.map((s) => (
                <button key={s.id} onClick={() => setScene(s.id)} className={cn("flex flex-col items-start gap-2 rounded-lg border p-2.5 text-left transition", settings.layout === s.id ? "border-ruby/60 bg-ruby/10 text-ivory shadow-[0_0_20px_-6px_rgba(214,50,74,0.6)]" : "border-line text-mist hover:border-line-2 hover:text-ivory")}>
                  <s.icon size={15} strokeWidth={1.4} />
                  <span className="text-[11px] font-semibold">{s.label}</span>
                </button>
              ))}
            </div>
            {settings.layout === "pip" && (
              <div className="mt-3 space-y-2">
                <Segmented size="sm" className="w-full" value={settings.pipCorner} onChange={(v) => update({ pipCorner: v })} options={[{ value: "tl", label: "↖" }, { value: "tr", label: "↗" }, { value: "bl", label: "↙" }, { value: "br", label: "↘" }]} />
                <Slider label="Camera size" value={settings.pipSize} min={0.15} max={0.45} reset={0.26} onChange={(v) => update({ pipSize: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
            )}
          </Section>
          <Section title="Lower third">
            <input value={settings.lowerThird.name} onChange={(e) => update({ lowerThird: { ...settings.lowerThird, name: e.target.value } })} className="field !text-[12px]" placeholder="Name" />
            <input value={settings.lowerThird.role} onChange={(e) => update({ lowerThird: { ...settings.lowerThird, role: e.target.value } })} className="field mt-1.5 !text-[12px]" placeholder="Role" />
            <button onClick={() => update({ lowerThird: { ...settings.lowerThird, visible: !settings.lowerThird.visible } })} className={cn("btn mt-2 w-full py-2", settings.lowerThird.visible ? "btn-gold" : "btn-ghost")}>
              {settings.lowerThird.visible ? "Take off air" : "Take to air"}
            </button>
          </Section>
          <Section title="Cards & ticker">
            <input value={settings.card.title} onChange={(e) => update({ card: { ...settings.card, title: e.target.value } })} className="field !text-[12px]" placeholder="Card title" />
            <input value={settings.card.subtitle} onChange={(e) => update({ card: { ...settings.card, subtitle: e.target.value } })} className="field mt-1.5 !text-[12px]" placeholder="Card subtitle" />
            <input value={settings.ticker} onChange={(e) => update({ ticker: e.target.value })} className="field mt-1.5 !text-[12px]" placeholder="Ticker headline (empty = hidden)" />
            <input value={settings.watermark} onChange={(e) => update({ watermark: e.target.value })} className="field mt-1.5 !text-[12px]" placeholder="Corner bug / watermark" />
            <div className="mt-1">
              <Toggle label="Scope letterbox" checked={settings.letterbox === 2.39} onChange={(v) => update({ letterbox: v ? 2.39 : null })} />
              <Toggle label="Burn-in clock" checked={settings.burnTimecode} onChange={(v) => update({ burnTimecode: v })} />
            </div>
          </Section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 p-5">
            <MonitorView hook={hook} overlay={overlay} hud={<Hud hook={hook} codec={`WHIP · ${(kbps / 1000).toFixed(1)} Mbps`} label="Program" />}>
              <PowerGate hook={hook} title="The stage is dark" />
              {live && <div className="pointer-events-none absolute inset-0 z-[5] ring-2 ring-inset ring-ruby/80" />}
            </MonitorView>
          </div>
          <div className="grid grid-cols-5 gap-px border-t border-line bg-line">
            {[
              ["Bitrate", health ? `${Math.round(health.kbps)} kbps` : "—"],
              ["Frames", health ? `${health.fps.toFixed(0)} fps` : "—"],
              ["Round trip", health ? `${health.rttMs} ms` : "—"],
              ["Packets lost", health ? String(health.packetsLost) : "—"],
              ["Link", health?.state ?? (live ? "connecting" : "idle")],
            ].map(([k, v]) => (
              <div key={k} className="bg-ink px-5 py-3">
                <div className="text-[9.5px] uppercase tracking-[0.25em] text-smoke">{k}</div>
                <div className={cn("tc mt-0.5 text-[15px]", k === "Link" ? healthTone : "text-ivory")}>{v}</div>
              </div>
            ))}
          </div>
          <div className="h-[130px] shrink-0 overflow-y-auto border-t border-line px-6 py-3 scroll-thin">
            <div className="eyebrow mb-2">Broadcast log</div>
            {!sessions.length && <div className="text-[12px] italic text-smoke">No broadcasts yet.</div>}
            <div className="space-y-1">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-4 text-[11.5px]">
                  <span className={cn("w-16 text-[9.5px] font-bold uppercase tracking-[0.2em]", s.status === "live" ? "text-ruby" : s.status === "failed" ? "text-[#ff9aa9]" : "text-jade")}>{s.status}</span>
                  <span className="flex-1 truncate font-display text-[14px] italic text-ivory">{s.title}</span>
                  <span className="tc text-smoke">{shortTime(s.durationSec)}</span>
                  <span className="tc w-20 text-right text-smoke">{s.peakKbps ? `${Math.round(s.peakKbps)}k` : "—"}</span>
                  <span className="w-24 text-right text-smoke">{relativeDate(s.startedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="w-[310px] shrink-0 overflow-y-auto border-l border-line px-4 scroll-thin">
          <Segmented size="sm" className="mt-3 w-full" value={tab} onChange={setTab} options={[{ value: "out", label: "Outputs" }, { value: "look", label: "Look" }, { value: "devices", label: "Sources" }, { value: "monitor", label: "Tools" }]} />
          {tab === "out" && (
            <>
              <Section title="Destinations" right={<button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-gold hover:text-gold-hi"><Plus size={12} /> Add</button>}>
                {!dests.length && <p className="text-[11.5px] leading-relaxed text-smoke">Add a WHIP destination — Twitch works out of the box with your stream key.</p>}
                <div className="space-y-1.5">
                  {dests.map((d) => (
                    <label key={d.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition", selected.includes(d.id) ? "border-gold/50 bg-gold/[0.06]" : "border-line")}>
                      <input type="checkbox" className="accent-[#d8b57a]" checked={selected.includes(d.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-ivory">{d.name}</span>
                        <span className="block truncate text-[10px] text-smoke">{d.platform} · {d.hasKey ? d.streamKey : "no key"}</span>
                      </span>
                      <button onClick={(e) => { e.preventDefault(); void removeDest(d.id); }} className="text-smoke hover:text-ruby"><Trash2 size={12} /></button>
                    </label>
                  ))}
                </div>
              </Section>
              <Section title="Encoder">
                <Segmented size="sm" className="w-full" value={kbps} onChange={setKbps} options={[{ value: 2500, label: "2.5" }, { value: 4500, label: "4.5" }, { value: 6000, label: "6" }, { value: 8000, label: "8" }, { value: 12000, label: "12" }]} />
                <p className="mt-1 text-[10px] text-smoke">Mbps ceiling · H.264 preferred for platform compatibility</p>
                <div className="mt-2">
                  <Toggle label="Record ISO locally" hint="Full-quality copy saved to the Vault" checked={recordIso} onChange={setRecordIso} />
                </div>
              </Section>
              <div className="mb-4 flex gap-2 rounded-lg border border-line p-3 text-[10.5px] leading-relaxed text-smoke">
                <Info size={14} className="mt-0.5 shrink-0 text-gold/70" />
                Signalling runs through LUMIÈRE&apos;s server so stream keys never reach the browser; video flows peer-to-peer to the ingest over encrypted SRTP. YouTube & Facebook need RTMP — simulcast via Cloudflare Stream live outputs.
              </div>
            </>
          )}
          {tab === "look" && (
            <>
              <Section title="Program look">
                <LookBrowser compact grade={settings.grade} onChange={(g) => update({ grade: g })} />
              </Section>
              <Section title="Grade">
                <QuickGrade grade={settings.grade} onChange={(g) => update({ grade: g })} />
              </Section>
            </>
          )}
          {tab === "devices" && <DevicePanel hook={hook} />}
          {tab === "monitor" && <MonitoringPanel hook={hook} overlay={overlay} setOverlay={setOverlay} />}
        </aside>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} width={520}>
        <div className="p-7">
          <div className="eyebrow">New destination</div>
          <h3 className="mt-1 font-display text-3xl text-ivory">Where shall we <span className="italic text-gold">broadcast?</span></h3>
          <div className="mt-5 grid grid-cols-3 gap-1.5">
            {PLATFORMS.map((p) => (
              <button key={p.id} onClick={() => setForm({ platform: p.id, name: p.label, whipUrl: p.url, streamKey: form.streamKey })} className={cn("rounded-lg border px-2 py-2 text-[11.5px] font-semibold transition", form.platform === p.id ? "border-gold/60 bg-gold/10 text-gold-hi" : "border-line text-mist hover:text-ivory")}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-smoke">{platform.note}</p>
          <div className="mt-4 space-y-2.5">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" placeholder="Display name" />
            <input value={form.whipUrl} onChange={(e) => setForm({ ...form, whipUrl: e.target.value })} className="field tc !text-[11.5px]" placeholder="https://…/whip" />
            <input value={form.streamKey} onChange={(e) => setForm({ ...form, streamKey: e.target.value })} type="password" className="field" placeholder={platform.keyLabel} />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn btn-ghost px-4 py-2">Cancel</button>
            <button onClick={addDest} className="btn btn-gold px-5 py-2">Save destination</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
