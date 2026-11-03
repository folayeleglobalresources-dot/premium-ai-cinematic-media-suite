import { db } from "@/db";
import { aiSessions, assets, broadcasts, projects, timelines } from "@/db/schema";
import { BUILTIN_LOOKS } from "@/lib/looks";
import { count, desc, sum } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const FEATURES = [
  { n: "01", title: "Studio", href: "/studio", kicker: "Live camera", body: "Manual ISO, shutter, white balance and focus where the hardware allows; zebras, false colour, focus peaking, waveform, parade and vectorscope; frame guides for scope, flat and vertical; 3D LUT preview and baked recording up to 8K.", tags: ["H.264 · HEVC · AV1 · VP9", "200 Mb/s", "Timecode"] },
  { n: "02", title: "Broadcast", href: "/studio", kicker: "Go live", body: "Sub-second WebRTC streaming over the WHIP standard to Cloudflare, Twitch, Dolby.io or your own origin, with real encoder telemetry, audio metering and a rehearsal mode.", tags: ["WHIP", "WebRTC", "Telemetry"] },
  { n: "03", title: "Cutting Room", href: "/editor", kicker: "Edit & grade", body: "Multi-track timeline with trims, ripples, speed ramps, dissolves, wipes, motion presets, typographic titles, per-clip and master grading, shot matching and real-time GPU mastering to 4K.", tags: ["Timeline", "Scopes", "Mastering"] },
  { n: "04", title: "Director", href: "/director", kicker: "Intelligence", body: "Reads the frame and answers like a cinematographer: exposure and white-balance verdicts, lighting plans, camera settings, ranked looks, corrective grades — and develops treatments, beat sheets and shot lists from a logline.", tags: ["Frame analysis", "Auto-edit", "Shot lists"] },
];

export default async function Home() {
  const [[a], [p], [b], [s], recent, footage] = await Promise.all([
    db.select({ n: count(), size: sum(assets.size), dur: sum(assets.durationMs) }).from(assets),
    db.select({ n: count() }).from(projects),
    db.select({ n: count() }).from(broadcasts),
    db.select({ n: count() }).from(aiSessions),
    db.select({ id: projects.id, name: projects.name, width: projects.width, height: projects.height, fps: projects.fps, updatedAt: projects.updatedAt }).from(projects).orderBy(desc(projects.updatedAt)).limit(4),
    db.select({ id: assets.id, name: assets.name, kind: assets.kind, durationMs: assets.durationMs }).from(assets).orderBy(desc(assets.createdAt)).limit(6),
  ]);
  const tls = recent.length ? await db.select({ id: timelines.id, projectId: timelines.projectId }).from(timelines) : [];
  const hours = Number(a?.dur ?? 0) / 3600000;
  const gb = Number(a?.size ?? 0) / 1024 ** 3;

  return (
    <div className="vignette-page min-h-screen">
      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-end overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/hero.jpg" alt="" className="w-full h-full object-cover object-[60%_center] md:object-left md:scale-110 md:origin-left opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-transparent to-obsidian/40" />
        </div>
        <div className="absolute top-8 right-8 hidden md:flex flex-col items-end gap-2 readout text-[9px] text-ivory/50 tracking-[0.3em]">
          <span>OBSIDIAN · CINEMA STUDIO</span>
          <span>EDITION 01 · {new Date().getFullYear()}</span>
        </div>
        <div className="absolute left-6 md:left-12 top-1/2 -translate-y-1/2 hidden lg:block">
          <div className="[writing-mode:vertical-rl] rotate-180 readout text-[9px] tracking-[0.5em] text-gold/70">CAPTURE · BROADCAST · GRADE · DELIVER</div>
        </div>
        <div className="relative z-10 px-6 md:px-16 lg:px-28 pb-16 md:pb-24 max-w-5xl">
          <div className="eyebrow mb-6 reveal">A premium cinema studio in the browser</div>
          <h1 className="display text-[15vw] md:text-[9rem] leading-[0.85] reveal reveal-2">
            Cinema,
            <br />
            <span className="gold-text italic">distilled.</span>
          </h1>
          <p className="mt-8 max-w-xl text-ivory/75 text-[15px] md:text-lg font-light leading-relaxed reveal reveal-3">
            Live camera with professional monitoring, broadcast-grade streaming, cinematic colour, a true cutting room and an intelligent director — on any PC, Mac or Linux machine, with nothing to install.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 reveal reveal-4">
            <Link href="/studio" className="btn btn-solid">
              Enter the Studio
            </Link>
            <Link href="/editor" className="btn">
              Open the Cutting Room
            </Link>
            <Link href="/director" className="btn btn-ghost">
              Meet the Director
            </Link>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      </section>

      {/* STATS STRIP */}
      <section className="border-b border-white/[0.06]">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.06]">
          {[
            ["Assets in the vault", `${a?.n ?? 0}`, `${gb.toFixed(2)} GB · ${hours.toFixed(1)} h`],
            ["Pictures in progress", `${p?.n ?? 0}`, "Sequences autosaved"],
            ["Broadcast sessions", `${b?.n ?? 0}`, "WHIP · WebRTC"],
            ["Director sessions", `${s?.n ?? 0}`, "Analyses · treatments · cuts"],
          ].map(([k, v, sub]) => (
            <div key={k} className="px-6 md:px-10 py-8">
              <div className="eyebrow !text-[8px] mb-2">{k}</div>
              <div className="display text-5xl text-ivory">{v}</div>
              <div className="readout text-[10px] text-muted mt-1">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-6 md:px-16 lg:px-28 py-20 md:py-28">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12">
          <div className="lg:sticky lg:top-16 self-start">
            <div className="eyebrow mb-4">The suite</div>
            <h2 className="display text-5xl md:text-6xl leading-[0.95]">
              Four rooms,
              <br />
              one <span className="italic text-gold-bright">pipeline</span>.
            </h2>
            <p className="text-muted mt-6 text-sm leading-relaxed max-w-sm">Everything shares a single GPU colour engine, so the look you monitor on set is the look you broadcast, the look you cut with, and the look you deliver.</p>
          </div>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {FEATURES.map((f) => (
              <Link key={f.n} href={f.href} className="group grid md:grid-cols-[80px_1fr] gap-4 py-10 hover:bg-white/[0.015] transition-colors -mx-4 px-4">
                <div className="display text-4xl text-gold-dim group-hover:text-gold-bright transition-colors">{f.n}</div>
                <div>
                  <div className="eyebrow !text-[8px] mb-2">{f.kicker}</div>
                  <div className="display text-4xl md:text-5xl mb-4 group-hover:translate-x-1 transition-transform">{f.title}</div>
                  <p className="text-ivory/70 text-[14px] leading-relaxed max-w-2xl">{f.body}</p>
                  <div className="flex flex-wrap gap-1.5 mt-5">
                    {f.tags.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* LOOK LIBRARY STRIP */}
      <section className="py-16 border-y border-white/[0.06] overflow-hidden">
        <div className="px-6 md:px-16 lg:px-28 flex items-end justify-between mb-8">
          <div>
            <div className="eyebrow mb-3">Look library</div>
            <h3 className="display text-4xl md:text-5xl">
              {BUILTIN_LOOKS.length} signature grades, <span className="italic text-gold-bright">infinitely adjustable</span>
            </h3>
          </div>
          <Link href="/studio" className="hidden md:inline-flex btn btn-ghost btn-sm">
            Try them live
          </Link>
        </div>
        <div className="flex gap-3 px-6 md:px-16 lg:px-28 overflow-x-auto pb-4 snap-x">
          {BUILTIN_LOOKS.map((l) => (
            <div key={l.id} className="snap-start flex-none w-[200px]">
              <div className="h-28 border border-white/10 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${l.swatch[0]} 0%, ${l.swatch[1]} 55%, ${l.swatch[2]} 100%)` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-2 left-3 eyebrow !text-[7px] !text-ivory/80">{l.category}</div>
              </div>
              <div className="display text-xl mt-2">{l.name}</div>
              <p className="text-[11px] text-muted leading-relaxed">{l.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RECENT */}
      {(recent.length || footage.length) ? (
        <section className="px-6 md:px-16 lg:px-28 py-20 grid lg:grid-cols-2 gap-12">
          <div>
            <div className="eyebrow mb-4">Recent pictures</div>
            <div className="flex flex-col divide-y divide-white/[0.06]">
              {recent.map((r) => {
                const t = tls.find((x) => x.projectId === r.id);
                return (
                  <Link key={r.id} href={t ? `/editor/${t.id}` : "/editor"} className="py-4 flex items-center justify-between group">
                    <div>
                      <div className="display text-2xl group-hover:text-gold-bright transition-colors">{r.name}</div>
                      <div className="readout text-[10px] text-muted">
                        {r.width}×{r.height} · {r.fps} fps · {new Date(r.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-gold-dim group-hover:text-gold-bright transition-colors">→</span>
                  </Link>
                );
              })}
              {!recent.length ? <div className="py-4 text-muted text-sm">No pictures yet.</div> : null}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-4">Latest footage</div>
            <div className="grid grid-cols-3 gap-2">
              {footage.map((f) => (
                <Link key={f.id} href="/library" className="group relative aspect-video bg-black border border-white/10 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${f.id}/thumb`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute bottom-1 left-2 right-2 text-[9px] truncate text-ivory/90">{f.name}</div>
                </Link>
              ))}
              {!footage.length ? <div className="col-span-3 text-muted text-sm">Nothing captured yet.</div> : null}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="px-6 md:px-16 lg:px-28 py-10 border-t border-white/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="display text-2xl">
          OBSIDIAN <span className="text-muted text-sm font-sans tracking-[0.3em] uppercase ml-2">Cinema Studio</span>
        </div>
        <div className="readout text-[9px] text-muted tracking-[0.3em] uppercase">Runs on Chrome · Edge · Firefox · Safari · Windows · macOS · Linux · ChromeOS</div>
      </footer>
    </div>
  );
}
