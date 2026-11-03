"use client";

import { Camera, Clapperboard, Download, Feather, Music, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ShotPlan } from "@/lib/ai/shotlist";
import { cn, downloadText, jsonFetch, relativeDate, safeFileName } from "@/lib/utils";
import { Slider, Spinner, toast } from "../ui";

interface Saved {
  id: string;
  title: string;
  logline: string;
  genre: string;
  engine: string;
  createdAt: string;
  data: ShotPlan;
}

const GENRES = ["auto", "drama", "thriller", "horror", "romance", "action", "scifi", "comedy", "documentary", "commercial", "musicvideo"];
const EXAMPLES = [
  "A retired detective receives a letter from the daughter she never knew, the night before her final case.",
  "Two estranged brothers drive across the desert to scatter their father's ashes and find the secret he buried.",
  "A luxury watchmaker's apprentice must finish a masterpiece in seven days as her mentor goes blind.",
];

export function WritersRoom() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [genre, setGenre] = useState("auto");
  const [tone, setTone] = useState("");
  const [shots, setShots] = useState(18);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [plan, setPlan] = useState<Saved | null>(null);
  const [engine, setEngine] = useState("lumiere-local");

  useEffect(() => {
    jsonFetch<{ shotlists: Saved[]; engine: string }>("/api/ai/shotlist")
      .then((d) => {
        setSaved(d.shotlists);
        setEngine(d.engine);
        if (d.shotlists[0]) setPlan(d.shotlists[0]);
      })
      .catch(() => null);
  }, []);

  const generate = async () => {
    if (logline.trim().length < 8) return toast("Write a logline — one vivid sentence.", "error");
    setBusy(true);
    try {
      const d = await jsonFetch<{ shotlist: Saved }>("/api/ai/shotlist", { method: "POST", body: JSON.stringify({ title, logline, genre: genre === "auto" ? undefined : genre, tone, shots }) });
      setSaved((s) => [d.shotlist, ...s]);
      setPlan(d.shotlist);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/ai/shotlist?id=${id}`, { method: "DELETE" });
    setSaved((s) => s.filter((x) => x.id !== id));
    if (plan?.id === id) setPlan(null);
  };

  const csv = (p: ShotPlan) => {
    const rows = [["Scene", "Slug", "Shot", "Size", "Angle", "Movement", "Lens", "Subject", "Action", "Lighting", "Audio", "Duration (s)"]];
    for (const s of p.scenes) for (const sh of s.shots) rows.push([String(s.n), s.slug, sh.n, sh.size, sh.angle, sh.movement, sh.lens, sh.subject, sh.action, sh.lighting, sh.audio, String(sh.duration)]);
    downloadText(rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), `${safeFileName(p.title)}_shotlist.csv`, "text/csv");
  };

  const startProduction = async (p: ShotPlan) => {
    const fmt = p.aspect === "2.39:1" ? { width: 1920, height: 804, aspect: "2.39:1" } : p.aspect === "1.85:1" ? { width: 1998, height: 1080, aspect: "1.85:1" } : p.aspect === "9:16" ? { width: 1080, height: 1920, aspect: "9:16" } : { width: 1920, height: 1080, aspect: "16:9" };
    const d = await jsonFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ name: p.title, logline: p.logline, fps: 24, ...fmt }) });
    router.push(`/editor/${d.project.id}`);
  };

  const p = plan?.data;

  return (
    <div className="flex min-h-screen">
      <aside className="w-[380px] shrink-0 border-r border-line px-6 py-8">
        <div className="eyebrow">VI · Writers&apos; Room</div>
        <h1 className="mt-2 font-display text-5xl leading-[0.95] text-ivory">From logline to <span className="italic text-gold">shot list.</span></h1>
        <p className="mt-3 text-[12px] leading-relaxed text-mist">Pre-production intelligence: scenes, coverage, lenses, lighting and sound — designed with the grammar of cinema.</p>
        <div className="mt-6 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Working title (optional)" className="field font-display !text-lg italic" />
          <textarea value={logline} onChange={(e) => setLogline(e.target.value)} rows={4} placeholder="A logline — who wants what, and what stands in the way…" className="field !text-[13px] leading-relaxed" />
          <div className="flex flex-wrap gap-1">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setLogline(ex)} className="chip max-w-full truncate text-left hover:!text-gold-hi">{ex.slice(0, 42)}…</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className="field">
              {GENRES.map((g) => (
                <option key={g} value={g}>{g === "auto" ? "Genre · detect" : g === "scifi" ? "Sci-fi" : g === "musicvideo" ? "Music video" : g[0].toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
            <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Tone · e.g. melancholic" className="field" />
          </div>
          <Slider label="Coverage" value={shots} min={10} max={30} step={1} onChange={setShots} format={(v) => `${v} shots`} />
          <button onClick={generate} disabled={busy} className="btn btn-gold w-full py-3">
            {busy ? <Spinner className="!border-ink/30 !border-t-ink" /> : <Sparkles size={14} />} {busy ? "Breaking down the script…" : "Design the shoot"}
          </button>
          <p className="text-center text-[9.5px] uppercase tracking-[0.22em] text-smoke">{engine === "lumiere-local" ? "LUMIÈRE Neural · on-device" : engine}</p>
        </div>
        {saved.length > 0 && (
          <div className="mt-8">
            <div className="eyebrow mb-2">Archive</div>
            <div className="space-y-1">
              {saved.map((s) => (
                <div key={s.id} className={cn("group flex items-center justify-between rounded-lg px-3 py-2 transition", plan?.id === s.id ? "bg-gold/10" : "hover:bg-white/[0.03]")}>
                  <button onClick={() => setPlan(s)} className="min-w-0 text-left">
                    <div className="truncate font-display text-[16px] italic text-ivory">{s.title}</div>
                    <div className="text-[10px] text-smoke">{s.genre} · {relativeDate(s.createdAt)}</div>
                  </button>
                  <button onClick={() => remove(s.id)} className="text-smoke opacity-0 transition hover:text-ruby group-hover:opacity-100"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 px-10 py-10">
        {!p ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Feather size={34} strokeWidth={1} className="text-gold/60" />
            <div className="font-display text-4xl italic text-ivory">Every film begins as a sentence.</div>
            <p className="max-w-md text-[13px] text-mist">Write yours on the left. I&apos;ll break it into scenes and coverage, choose lenses and light, and recommend a grade.</p>
          </div>
        ) : (
          <article className="animate-rise mx-auto max-w-5xl">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-3xl">
                <div className="eyebrow">{p.genre} · {p.aspect} · {p.totalDuration}s of coverage</div>
                <h2 className="mt-3 font-display text-7xl leading-[0.9] text-ivory">{p.title}</h2>
                <p className="mt-4 font-display text-xl italic leading-relaxed text-ivory/75">{p.logline}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => startProduction(p)} className="btn btn-gold px-5 py-2.5"><Clapperboard size={14} /> Start production</button>
                <button onClick={() => csv(p)} className="btn btn-ghost px-5 py-2.5"><Download size={14} /> Shot list CSV</button>
              </div>
            </div>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
              <div className="bg-ink-2 p-5">
                <div className="eyebrow mb-2">Grade</div>
                <div className="mb-2 flex h-6 overflow-hidden rounded">{p.palette.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
                <div className="font-display text-xl text-ivory">{p.look.name}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-mist">{p.look.rationale}</p>
              </div>
              <div className="bg-ink-2 p-5">
                <div className="eyebrow mb-2 flex items-center gap-1.5"><Camera size={11} /> Camera</div>
                <p className="text-[12.5px] text-ivory/90">{p.cameraPackage}</p>
                <p className="mt-2 text-[11px] text-mist">{p.lensPackage}</p>
              </div>
              <div className="bg-ink-2 p-5">
                <div className="eyebrow mb-2 flex items-center gap-1.5"><Music size={11} /> Score</div>
                <p className="text-[12px] leading-relaxed text-ivory/85">{p.musicDirection}</p>
              </div>
              <div className="bg-ink-2 p-5">
                <div className="eyebrow mb-2">References</div>
                <ul className="space-y-1 font-display text-[16px] italic text-ivory/85">{p.references.map((r) => <li key={r}>{r}</li>)}</ul>
                <div className="mt-2 text-[10.5px] text-smoke">Tone · {p.tone}</div>
              </div>
            </div>
            <div className="mt-10 space-y-10">
              {p.scenes.map((s) => (
                <section key={s.n}>
                  <div className="flex flex-wrap items-baseline gap-4">
                    <span className="font-display text-5xl italic text-gold/40">{String(s.n).padStart(2, "0")}</span>
                    <div>
                      <div className="font-mono text-[13px] font-medium uppercase tracking-[0.12em] text-ivory">{s.slug}</div>
                      <div className="text-[11px] text-gold">{s.beat} · <span className="text-mist">{s.mood}</span></div>
                    </div>
                  </div>
                  <p className="mt-2 max-w-3xl font-display text-[17px] leading-relaxed text-ivory/80">{s.summary}</p>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-line scroll-thin">
                    <table className="w-full min-w-[900px] text-left text-[11.5px]">
                      <thead className="bg-white/[0.02] text-[9px] uppercase tracking-[0.2em] text-smoke">
                        <tr>{["Shot", "Size", "Angle", "Movement", "Lens", "Action", "Lighting", "Sound", "Sec"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {s.shots.map((sh) => (
                          <tr key={sh.n} className="border-t border-line/70 align-top hover:bg-gold/[0.03]">
                            <td className="tc px-3 py-2.5 text-gold">{sh.n}</td>
                            <td className="px-3 py-2.5 font-semibold text-ivory">{sh.size}</td>
                            <td className="px-3 py-2.5 text-mist">{sh.angle}</td>
                            <td className="px-3 py-2.5 text-mist">{sh.movement}</td>
                            <td className="tc px-3 py-2.5 text-ivory/80">{sh.lens}</td>
                            <td className="max-w-[260px] px-3 py-2.5 text-ivory/90">{sh.action}</td>
                            <td className="max-w-[200px] px-3 py-2.5 text-mist">{sh.lighting}</td>
                            <td className="max-w-[160px] px-3 py-2.5 text-mist">{sh.audio}</td>
                            <td className="tc px-3 py-2.5 text-smoke">{sh.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
