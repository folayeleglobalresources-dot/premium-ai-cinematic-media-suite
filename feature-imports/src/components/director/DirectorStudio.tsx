"use client";

import { fetchJSON, downloadBlob, stamp } from "@/lib/api";
import type { DirectorPlan } from "@/lib/intelligence";
import { findLook } from "@/lib/looks";
import { useEffect, useState } from "react";
import { Slider, Spinner } from "../ui/Controls";

const GENRES = ["drama", "thriller", "romance", "sci-fi", "horror", "documentary", "commercial", "music video", "wedding", "action", "noir"];
const MOODS = ["restrained", "tender", "menacing", "euphoric", "melancholic", "playful", "elegant", "feverish", "austere"];
const FORMATS = ["short film", "feature teaser", "commercial", "music video", "documentary", "trailer", "wedding film", "brand film"];
const ASPECTS = ["2.39:1", "1.85:1", "16:9", "4:3", "9:16"];

type Session = { id: number; kind: string; title: string; createdAt: string; output: Record<string, unknown>; input: Record<string, unknown> };

export function DirectorStudio() {
  const [logline, setLogline] = useState("A lighthouse keeper discovers that the fog has started to remember the ships it swallowed.");
  const [genre, setGenre] = useState("thriller");
  const [mood, setMood] = useState("menacing");
  const [format, setFormat] = useState("short film");
  const [aspect, setAspect] = useState("2.39:1");
  const [duration, setDuration] = useState(120);
  const [plan, setPlan] = useState<(DirectorPlan & { sessionId?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = () => fetchJSON<Session[]>("/api/ai/sessions?limit=30").then(setSessions).catch(() => null);
  useEffect(() => {
    loadSessions();
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await fetchJSON<DirectorPlan & { sessionId?: number }>("/api/ai/director", {
        method: "POST",
        body: JSON.stringify({ logline, genre, mood, format, aspect, durationSec: duration }),
      });
      setPlan(p);
      loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const exportPlan = () => {
    if (!plan) return;
    const lines = [
      `${plan.titles[0].toUpperCase()}`,
      `Logline: ${plan.logline}`,
      "",
      "SYNOPSIS",
      plan.synopsis,
      "",
      "BEATS",
      ...plan.beats.map((b) => `${b.act} — ${b.name} (${b.seconds}s): ${b.description}`),
      "",
      "SHOT LIST",
      "No.\tBeat\tType\tLens\tMovement\tLighting\tLook\tDur\tNote\tSound",
      ...plan.shots.map((s) => [s.num, s.beat, s.type, s.lens, s.movement, s.lighting, findLook(s.lookId)?.name ?? s.lookId, `${s.durationSec}s`, s.note, s.sound].join("\t")),
      "",
      "SOUND DESIGN",
      ...plan.soundDesign,
      "",
      "GEAR",
      ...plan.gear,
      "",
      "SCHEDULE",
      ...plan.schedule,
    ];
    downloadBlob(new Blob([lines.join("\n")], { type: "text/plain" }), `${plan.titles[0].replace(/\W+/g, "_")}_plan_${stamp()}.txt`);
  };

  return (
    <div className="backdrop-cine min-h-screen px-5 md:px-12 py-10 md:py-14">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <div className="eyebrow mb-3 reveal">Director</div>
          <h1 className="display text-5xl md:text-7xl reveal reveal-2">
            From a sentence to a <span className="gold-text italic">shot list</span>
          </h1>
          <p className="text-muted max-w-2xl mt-4 text-sm leading-relaxed reveal reveal-3">
            Describe the picture. The Director returns titles, a treatment, a beat sheet, a lens-by-lens shot list with lighting, movement and looks, a sound design brief, gear and a shooting schedule. Frame analysis and shot matching live inside the Studio and Cutting Room.
          </p>
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
          <aside className="glass-strong p-6 flex flex-col gap-4 reveal reveal-3 lg:sticky lg:top-6">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Logline</span>
              <textarea className="field" value={logline} onChange={(e) => setLogline(e.target.value)} />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Genre</span>
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map((g) => (
                  <button key={g} className={`chip ${genre === g ? "active" : ""}`} onClick={() => setGenre(g)}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Mood</span>
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button key={m} className={`chip ${mood === m ? "active" : ""}`} onClick={() => setMood(m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Format</span>
                <select className="field" value={format} onChange={(e) => setFormat(e.target.value)}>
                  {FORMATS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Aspect</span>
                <select className="field" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {ASPECTS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
            <Slider label="Running time" value={duration} min={15} max={900} step={5} onChange={setDuration} format={(v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
            {error ? <div className="text-[11px] text-crimson">{error}</div> : null}
            <button className="btn btn-solid" onClick={run} disabled={busy}>
              {busy ? <Spinner /> : null} Develop the picture
            </button>
            {sessions.length ? (
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="eyebrow">Recent sessions</div>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      className="panel p-2 text-left hover:border-gold/40 transition-colors"
                      onClick={() => {
                        if (s.kind === "director") setPlan(s.output as unknown as DirectorPlan);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] truncate">{s.title || s.kind}</span>
                        <span className="chip !py-0 !px-1.5 !text-[7px]">{s.kind}</span>
                      </div>
                      <div className="readout text-[9px] text-muted">{new Date(s.createdAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="flex flex-col gap-6 min-w-0">
            {!plan ? (
              <div className="glass p-10 text-center text-muted text-sm reveal reveal-4">
                <div className="display text-3xl text-ivory/80 mb-2">The room is quiet</div>
                Set the logline, genre and mood, then develop the picture.
              </div>
            ) : (
              <>
                <div className="glass p-6 md:p-8 reveal">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {plan.titles.map((t) => (
                      <span key={t} className="chip active">
                        {t}
                      </span>
                    ))}
                    <span className="flex-1" />
                    <button className="btn btn-xs btn-ghost" onClick={exportPlan}>
                      Export plan
                    </button>
                  </div>
                  <h2 className="display text-4xl md:text-5xl mb-4">{plan.titles[0]}</h2>
                  <p className="text-ivory/85 leading-relaxed text-[15px] font-light">{plan.synopsis}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-1">
                      {[plan.palette.primary, plan.palette.secondary, plan.palette.accent].map((c) => (
                        <span key={c} className="w-8 h-8 border border-white/10" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="text-[11px] text-muted max-w-xl">
                      <span className="text-gold-bright">{findLook(plan.palette.lookId)?.name ?? plan.palette.lookId}</span> — {plan.palette.rationale}
                    </div>
                  </div>
                  <div className="mt-3 text-[9px] text-muted tracking-[0.2em] uppercase">engine · {plan.generatedBy}</div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 reveal reveal-2">
                  {plan.beats.map((b, i) => (
                    <div key={i} className="glass p-5 flex gap-4">
                      <div className="readout text-gold-dim text-2xl display leading-none">{String(i + 1).padStart(2, "0")}</div>
                      <div>
                        <div className="eyebrow !text-[8px] mb-1">
                          {b.act} · {b.name} · {b.seconds}s
                        </div>
                        <p className="text-[13px] text-ivory/85 leading-relaxed">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="glass overflow-hidden reveal reveal-3">
                  <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <span className="eyebrow">Shot list · {plan.shots.length} setups</span>
                    <span className="readout text-[10px] text-muted">{plan.shots.reduce((a, s) => a + s.durationSec, 0)}s</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-left text-muted uppercase tracking-[0.15em] text-[8px]">
                          {["#", "Beat", "Shot", "Lens", "Movement", "Lighting", "Look", "Dur", "Direction", "Sound"].map((h) => (
                            <th key={h} className="px-3 py-2 font-normal whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {plan.shots.map((s) => (
                          <tr key={s.num} className="border-t border-white/[0.05] hover:bg-white/[0.02] align-top">
                            <td className="px-3 py-2 readout text-gold-dim">{s.num}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{s.beat}</td>
                            <td className="px-3 py-2 text-ivory">{s.type}</td>
                            <td className="px-3 py-2 readout whitespace-nowrap">{s.lens}</td>
                            <td className="px-3 py-2 min-w-[140px]">{s.movement}</td>
                            <td className="px-3 py-2 min-w-[140px] text-muted">{s.lighting}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5" style={{ background: findLook(s.lookId)?.swatch[1] ?? "#888" }} />
                                {findLook(s.lookId)?.name ?? s.lookId}
                              </span>
                            </td>
                            <td className="px-3 py-2 readout">{s.durationSec}s</td>
                            <td className="px-3 py-2 min-w-[180px] text-muted">{s.note}</td>
                            <td className="px-3 py-2 min-w-[140px] text-muted">{s.sound}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4 reveal reveal-4">
                  {[
                    ["Sound design", plan.soundDesign],
                    ["Gear", plan.gear],
                    ["Schedule", plan.schedule],
                  ].map(([title, items]) => (
                    <div key={title as string} className="glass p-5">
                      <div className="eyebrow mb-3">{title as string}</div>
                      <ul className="flex flex-col gap-2 text-[12px] text-ivory/80 leading-relaxed">
                        {(items as string[]).map((it, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-gold-dim">—</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
