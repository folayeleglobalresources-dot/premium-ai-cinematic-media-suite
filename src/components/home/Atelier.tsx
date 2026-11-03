"use client";

import { Aperture, ArrowUpRight, Clapperboard, Download, Feather, Film, Palette, Plus, Radio, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FORMAT_PRESETS } from "@/lib/types";
import { cn, formatBytes, jsonFetch, relativeDate, shortTime } from "@/lib/utils";
import { Modal, Segmented, toast } from "../ui";

export interface ProjectCard {
  id: string;
  name: string;
  logline: string;
  width: number;
  height: number;
  fps: number;
  aspect: string;
  poster: string | null;
  durationSec: number;
  updatedAt: string;
}

const ROOMS = [
  { n: "II", title: "Capture", href: "/capture", icon: Aperture, body: "Pro camera monitor with false colour, zebras, focus peaking, scopes, slate metadata, live LUTs, AI portrait & auto-framing, and live speech captions." },
  { n: "III", title: "Broadcast", href: "/live", icon: Radio, body: "Multi-destination WebRTC (WHIP) streaming to Twitch, Cloudflare & more — scenes, picture-in-picture, lower thirds, tickers and stream health." },
  { n: "IV", title: "Montage", href: "/editor", icon: Film, body: "Multi-track timeline with blade, ripple, overwrite edits, transitions, kinetic titles, keyframe-free motion, captions and real-time export." },
  { n: "✦", title: "Colour", href: "/editor", icon: Palette, body: "GPU colour engine: lift/gamma/gain wheels, ASC-CDL, 42 film & auteur looks, halation, bloom, grain — with histogram, waveform, parade and vectorscope." },
  { n: "AI", title: "AI Director", href: "/editor", icon: Wand2, body: "Direct in plain language: grade like Blade Runner, cut to the beat, remove silences, detect scenes, smart-reframe vertical, build a trailer." },
  { n: "VI", title: "Writers' Room", href: "/script", icon: Feather, body: "From logline to shooting plan: scenes, coverage, lenses, lighting and sound — with grade and camera package recommendations." },
];

const FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 60];

export function Atelier({ projects, stats }: { projects: ProjectCard[]; stats: { assets: number; bytes: number; sessions: number; boards: number } }) {
  const router = useRouter();
  const [list, setList] = useState(projects);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [logline, setLogline] = useState("");
  const [preset, setPreset] = useState("hd");
  const [fps, setFps] = useState(24);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<{ prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setInstall(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  const create = async () => {
    setBusy(true);
    const p = FORMAT_PRESETS.find((f) => f.id === preset)!;
    try {
      const d = await jsonFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || "Untitled Production", logline, width: p.width, height: p.height, fps, aspect: p.aspect }),
      });
      router.push(`/editor/${d.project.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this production? Media in your Vault is kept.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setList((l) => l.filter((p) => p.id !== id));
    toast("Production removed", "success");
  };

  return (
    <div className="pb-24">
      {/* ─────────────── Hero ─────────────── */}
      <section className="relative h-[86vh] min-h-[620px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/40" />
        <div className="absolute left-0 right-0 top-0 h-[5.5%] bg-black" />
        <div className="absolute bottom-0 left-0 right-0 h-[5.5%] bg-black" />
        <div className="animate-flare pointer-events-none absolute left-[20%] top-[42%] h-px w-[60%] bg-gradient-to-r from-transparent via-azure/70 to-transparent blur-[1px]" />

        <div className="relative z-10 flex h-full flex-col justify-center px-10 lg:px-20">
          <div className="max-w-2xl">
            <div className="eyebrow animate-rise flex items-center gap-3">
              <span className="hairline w-10" /> The Cinematic Studio · Est. MMXXVI
            </div>
            <h1 className="animate-rise mt-6 font-display text-[clamp(3.2rem,7vw,6.6rem)] font-medium leading-[0.92] tracking-[-0.01em] text-ivory" style={{ animationDelay: "80ms" }}>
              Make light
              <br />
              <span className="gold-shimmer italic">obey.</span>
            </h1>
            <p className="animate-rise mt-6 max-w-lg text-[15px] leading-relaxed text-ivory/70" style={{ animationDelay: "160ms" }}>
              Capture, broadcast, cut, grade and deliver — one atelier for cinema, from the first frame to the final master. Built for any computer, with an AI Director that speaks the language of film.
            </p>
            <div className="animate-rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
              <button onClick={() => setOpen(true)} className="btn btn-gold px-6 py-3 text-[13px]">
                <Plus size={15} /> Begin a Production
              </button>
              <Link href="/capture" className="btn btn-ghost px-5 py-3">
                <Aperture size={15} strokeWidth={1.5} /> Open the Camera
              </Link>
              <Link href="/live" className="btn btn-ghost px-5 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-ruby" /> Go Live
              </Link>
            </div>
            <div className="animate-rise mt-12 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-smoke" style={{ animationDelay: "320ms" }}>
              <span>GPU Colour Engine</span>
              <span className="text-gold/50">◆</span>
              <span>42 Film Looks</span>
              <span className="text-gold/50">◆</span>
              <span>WHIP Live</span>
              <span className="text-gold/50">◆</span>
              <span>ASC-CDL · EDL · SRT</span>
              <span className="text-gold/50">◆</span>
              <span>AI Director</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-[8%] right-10 z-10 hidden gap-10 lg:flex">
          {[
            ["Productions", list.length],
            ["Media assets", stats.assets],
            ["Broadcasts", stats.sessions],
            ["Shot plans", stats.boards],
          ].map(([k, v]) => (
            <div key={String(k)} className="text-right">
              <div className="font-display text-4xl italic text-gold-hi">{String(v).padStart(2, "0")}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-mist">{k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── Productions ─────────────── */}
      <section className="px-10 pt-14 lg:px-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="eyebrow">Repertoire</div>
            <h2 className="mt-2 font-display text-5xl text-ivory">
              Your <span className="italic text-gold">productions</span>
            </h2>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-mist">
            <span className="hidden md:inline">{formatBytes(stats.bytes)} of footage catalogued</span>
            <button onClick={() => setOpen(true)} className="btn btn-ghost px-4 py-2">
              <Plus size={14} /> New
            </button>
          </div>
        </div>
        <div className="mt-8 flex gap-6 overflow-x-auto pb-6 scroll-thin">
          <button onClick={() => setOpen(true)} className="group flex h-[260px] w-[300px] shrink-0 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-line-2 text-mist transition hover:border-gold/50 hover:text-gold">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-current transition group-hover:rotate-90">
              <Plus size={20} strokeWidth={1.25} />
            </span>
            <span className="font-display text-2xl italic">A new picture</span>
            <span className="text-[11px] uppercase tracking-[0.25em] opacity-70">Cinema · Broadcast · Social</span>
          </button>
          {list.map((p, i) => (
            <article key={p.id} className="group relative w-[340px] shrink-0 animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <Link href={`/editor/${p.id}`} className="block overflow-hidden rounded-2xl border border-line bg-ink-3 transition group-hover:border-gold/40 group-hover:shadow-[0_30px_60px_-30px_rgba(216,181,122,0.35)]">
                <div className="relative bg-black px-3 py-2">
                  <Sprockets />
                  <div className="relative aspect-video overflow-hidden rounded-sm bg-ink-4">
                    {p.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.poster} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(216,181,122,0.18),transparent_60%)]">
                        <span className="px-6 text-center font-display text-3xl italic text-gold/80">{p.name}</span>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-ivory/80">{shortTime(p.durationSec)}</div>
                  </div>
                  <Sprockets bottom />
                </div>
                <div className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-2xl leading-tight text-ivory">{p.name}</h3>
                    <ArrowUpRight size={16} className="mt-1 shrink-0 text-gold opacity-0 transition group-hover:opacity-100" />
                  </div>
                  {p.logline && <p className="line-clamp-2 text-[12px] leading-relaxed text-mist">{p.logline}</p>}
                  <div className="flex items-center gap-3 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-smoke">
                    <span>{p.width}×{p.height}</span>
                    <span>{p.aspect}</span>
                    <span>{p.fps} fps</span>
                    <span className="ml-auto normal-case tracking-normal">{relativeDate(p.updatedAt)}</span>
                  </div>
                </div>
              </Link>
              <button onClick={() => remove(p.id)} className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-mist opacity-0 transition hover:text-ruby group-hover:opacity-100" title="Delete">
                <Trash2 size={13} />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ─────────────── The Suite ─────────────── */}
      <section className="px-10 pt-16 lg:px-20">
        <div className="eyebrow">The Suite</div>
        <h2 className="mt-2 font-display text-5xl text-ivory">
          Six rooms. <span className="italic text-gold">One vision.</span>
        </h2>
        <div className="mt-10 grid border-l border-t border-line md:grid-cols-2 xl:grid-cols-3">
          {ROOMS.map((r) => (
            <Link key={r.title} href={r.href} className="group relative border-b border-r border-line p-8 transition hover:bg-gold/[0.03]">
              <div className="flex items-start justify-between">
                <span className="font-display text-5xl italic text-gold/30 transition group-hover:text-gold/70">{r.n}</span>
                <r.icon size={22} strokeWidth={1.1} className="text-gold/70 transition group-hover:rotate-12 group-hover:text-gold" />
              </div>
              <h3 className="mt-6 font-display text-3xl text-ivory">{r.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-mist">{r.body}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold opacity-0 transition group-hover:opacity-100">
                Enter <ArrowUpRight size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─────────────── Universal ─────────────── */}
      <section className="px-10 pt-16 lg:px-20">
        <div className="gold-border relative overflow-hidden rounded-3xl p-10">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="eyebrow flex items-center gap-2">
                <Sparkles size={12} /> Universal by design
              </div>
              <h3 className="mt-3 font-display text-4xl text-ivory">
                Every computer is now a <span className="italic text-gold">post house.</span>
              </h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                Windows, macOS, Linux and ChromeOS — LUMIÈRE runs on the GPU you already own, keeps footage on-device, and speaks the interchange formats of professional pipelines: CMX 3600 EDL to Resolve, Premiere & Avid; ASC-CDL to your colourist; SRT to any platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {install ? (
                <button onClick={() => install.prompt()} className="btn btn-gold px-5 py-3">
                  <Download size={15} /> Install desktop app
                </button>
              ) : (
                <span className="chip">Install from your browser menu → “Install LUMIÈRE”</span>
              )}
              <Link href="/script" className="btn btn-ghost px-5 py-3">
                <Clapperboard size={15} strokeWidth={1.5} /> Plan a shoot
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── New production ─────────────── */}
      <Modal open={open} onClose={() => !busy && setOpen(false)} width={760}>
        <div className="p-8">
          <div className="eyebrow">New Production</div>
          <h3 className="mt-2 font-display text-4xl text-ivory">
            Name your <span className="italic text-gold">picture</span>
          </h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="The Last Light" className="field font-display !text-xl italic" onKeyDown={(e) => e.key === "Enter" && create()} />
            <input value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="Logline — one sentence, one soul" className="field" />
          </div>
          {["Cinema", "Broadcast", "Social", "Vintage"].map((g) => (
            <div key={g} className="mt-6">
              <div className="mb-2 text-[10.5px] uppercase tracking-[0.28em] text-smoke">{g}</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {FORMAT_PRESETS.filter((f) => f.group === g).map((f) => {
                  const ar = f.width / f.height;
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        setPreset(f.id);
                        setFps(f.fps);
                      }}
                      className={cn("flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition", preset === f.id ? "border-gold/60 bg-gold/10" : "border-line hover:border-line-2")}
                    >
                      <div className="flex h-12 items-center justify-center">
                        <div className={cn("border", preset === f.id ? "border-gold bg-gold/15" : "border-mist/50")} style={{ width: ar >= 1 ? 48 : 48 * ar, height: ar >= 1 ? 48 / ar : 48 }} />
                      </div>
                      <div className="text-[11.5px] font-semibold text-ivory">{f.label}</div>
                      <div className="font-mono text-[9.5px] text-smoke">
                        {f.width}×{f.height}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10.5px] uppercase tracking-[0.28em] text-smoke">Frame rate</span>
              <Segmented size="sm" value={fps} onChange={setFps} options={FPS.map((f) => ({ value: f, label: String(f) }))} />
            </div>
            <button disabled={busy} onClick={create} className="btn btn-gold px-6 py-3">
              {busy ? "Preparing the stage…" : "Roll camera"}
            </button>
          </div>
          <p className="mt-4 text-[11px] text-smoke">{FORMAT_PRESETS.find((f) => f.id === preset)?.note}</p>
        </div>
      </Modal>
    </div>
  );
}

function Sprockets({ bottom }: { bottom?: boolean }) {
  return (
    <div className={cn("flex justify-between px-1", bottom ? "mt-1.5" : "mb-1.5")}>
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-[2px] bg-white/10" />
      ))}
    </div>
  );
}
