"use client";

import { codecOptions } from "@/lib/api";
import { useLooks, useSettings } from "@/lib/hooks";
import { BUILTIN_LOOKS } from "@/lib/looks";
import { useEffect, useState } from "react";
import { Section, Slider, Toggle } from "../ui/Controls";

export function SettingsPanel() {
  const { settings, update, loaded } = useSettings();
  const { custom, deleteLook } = useLooks();
  const [caps, setCaps] = useState<{ gl2: boolean; recorder: boolean; webrtc: boolean; speech: boolean; cores: number; memory: number | null; ua: string; codecs: number } | null>(null);

  useEffect(() => {
    const c = document.createElement("canvas");
    const nav = navigator as Navigator & { deviceMemory?: number };
    const w = window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown };
    setCaps({
      gl2: !!c.getContext("webgl2"),
      recorder: typeof MediaRecorder !== "undefined",
      webrtc: typeof RTCPeerConnection !== "undefined",
      speech: !!(w.SpeechRecognition || w.webkitSpeechRecognition),
      cores: navigator.hardwareConcurrency ?? 0,
      memory: nav.deviceMemory ?? null,
      ua: navigator.userAgent,
      codecs: codecOptions().filter((x) => x.supported).length,
    });
  }, []);

  return (
    <div className="vignette-page min-h-screen px-5 md:px-12 py-10 md:py-14">
      <div className="max-w-5xl mx-auto">
        <div className="eyebrow mb-3 reveal">Configure</div>
        <h1 className="display text-5xl md:text-7xl mb-10 reveal reveal-2">
          Tuned to your <span className="gold-text italic">hand</span>
        </h1>
        {!loaded ? <div className="text-muted text-sm">Loading…</div> : null}
        <div className="grid md:grid-cols-2 gap-6 reveal reveal-3">
          <div className="glass p-6 flex flex-col gap-6">
            <Section title="Appearance">
              <div className="flex gap-2">
                {(["gold", "platinum", "rose"] as const).map((a) => (
                  <button key={a} className={`flex-1 border p-3 flex flex-col items-center gap-2 transition-colors ${settings.accent === a ? "border-gold/70 bg-gold/10" : "border-white/10 hover:border-white/30"}`} onClick={() => update({ accent: a })}>
                    <span className="w-6 h-6 rounded-full" style={{ background: a === "gold" ? "linear-gradient(135deg,#f1dba4,#8a7040)" : a === "platinum" ? "linear-gradient(135deg,#f2f4f6,#7c838b)" : "linear-gradient(135deg,#f6d8d3,#8c5f5a)" }} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{a}</span>
                  </button>
                ))}
              </div>
              <Toggle label="Reduce motion" hint="Disables grain and shimmer animations" on={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
            </Section>
            <Section title="Studio defaults">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Default look</span>
                <select className="field" value={settings.defaultLook} onChange={(e) => update({ defaultLook: e.target.value })}>
                  {BUILTIN_LOOKS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Resolution</span>
                  <select className="field" value={settings.resolution} onChange={(e) => update({ resolution: e.target.value as typeof settings.resolution })}>
                    {["720p", "1080p", "1440p", "4k", "8k"].map((r) => (
                      <option key={r} value={r}>
                        {r.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Frame rate</span>
                  <select className="field" value={settings.fps} onChange={(e) => update({ fps: Number(e.target.value) })}>
                    {[23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Codec</span>
                <select className="field" value={settings.codec} onChange={(e) => update({ codec: e.target.value })}>
                  <option value="auto">Auto (best available)</option>
                  {codecOptions().map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.supported}>
                      {c.label}
                      {c.supported ? "" : " — unavailable here"}
                    </option>
                  ))}
                </select>
              </label>
              <Slider label="Bitrate" value={settings.bitrateMbps} min={4} max={200} step={1} onChange={(v) => update({ bitrateMbps: v })} unit=" Mb/s" />
              <div className="flex gap-1.5">
                <button className={`chip ${settings.recordMode === "look" ? "active" : ""}`} onClick={() => update({ recordMode: "look" })}>
                  Bake look
                </button>
                <button className={`chip ${settings.recordMode === "clean" ? "active" : ""}`} onClick={() => update({ recordMode: "clean" })}>
                  Clean feed
                </button>
              </div>
            </Section>
            <Section title="Monitoring defaults">
              <Toggle label="Zebra" on={settings.zebra} onChange={(v) => update({ zebra: v })} />
              <Slider label="Zebra threshold" value={settings.zebraLevel} min={0.5} max={1} step={0.01} onChange={(v) => update({ zebraLevel: v })} format={(v) => `${Math.round(v * 100)} IRE`} />
              <Toggle label="Focus peaking" on={settings.peaking} onChange={(v) => update({ peaking: v })} />
              <Toggle label="False colour" on={settings.falseColor} onChange={(v) => update({ falseColor: v })} />
              <Toggle label="Scopes" on={settings.scopes} onChange={(v) => update({ scopes: v })} />
              <Toggle label="Mirror preview" on={settings.mirrorPreview} onChange={(v) => update({ mirrorPreview: v })} />
            </Section>
          </div>

          <div className="flex flex-col gap-6">
            <div className="glass p-6 flex flex-col gap-6">
              <Section title="Broadcast">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">WHIP ingest URL</span>
                  <input className="field" placeholder="https://…" value={settings.whipEndpoint} onChange={(e) => update({ whipEndpoint: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Bearer token</span>
                  <input className="field" type="password" value={settings.whipToken} onChange={(e) => update({ whipToken: e.target.value })} />
                </label>
                <p className="text-[10px] text-muted leading-relaxed">Works with Cloudflare Stream Live (WebRTC), Twitch WHIP, Dolby.io Real-time, Millicast, MediaMTX, Janus, SRS and any WHIP-compliant origin. Tokens are forwarded by the server and never exposed to viewers.</p>
              </Section>
              <Section title="Intelligence">
                <p className="text-[11px] text-ivory/80 leading-relaxed">The Director runs the Aurum engine on measured frame data on-device. If you set <code className="readout text-gold-bright">OPENAI_API_KEY</code> or <code className="readout text-gold-bright">ANTHROPIC_API_KEY</code> in the server environment, prose notes and treatments are additionally written by a large language model grounded in the same measurements.</p>
              </Section>
            </div>
            <div className="glass p-6 flex flex-col gap-6">
              <Section title="Custom looks & LUTs">
                {custom.length ? (
                  <div className="flex flex-col gap-1.5">
                    {custom.map((l) => (
                      <div key={l.id} className="flex items-center gap-3 panel p-2">
                        <span className="w-8 h-6 flex-none" style={{ background: `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]}, ${l.swatch[2]})` }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] truncate">{l.name}</div>
                          <div className="text-[9px] text-muted">{l.category}{l.cubeText ? " · 3D LUT" : ""}</div>
                        </div>
                        <button className="btn btn-xs btn-ghost" onClick={() => deleteLook(l.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">Save presets or import .cube files from the Studio to see them here.</p>
                )}
              </Section>
              <Section title="This machine">
                {caps ? (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {[
                      ["WebGL2 pipeline", caps.gl2],
                      ["Media recorder", caps.recorder],
                      ["WebRTC broadcast", caps.webrtc],
                      ["Speech captions", caps.speech],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex items-center justify-between panel p-2">
                        <span className="text-muted">{k as string}</span>
                        <span className={v ? "text-emerald-400" : "text-crimson"}>{v ? "ready" : "missing"}</span>
                      </div>
                    ))}
                    <div className="panel p-2 flex items-center justify-between"><span className="text-muted">Encoders</span><span className="readout">{caps.codecs}</span></div>
                    <div className="panel p-2 flex items-center justify-between"><span className="text-muted">CPU threads</span><span className="readout">{caps.cores || "—"}</span></div>
                    <div className="panel p-2 col-span-2 text-[9px] text-muted truncate">{caps.ua}</div>
                  </div>
                ) : null}
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
