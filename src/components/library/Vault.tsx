"use client";

import { Archive, Download, Scissors, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { frameStats, rmsEnvelope, sampleImage } from "@/lib/media/analysis";
import { decodeAssetAudio, fetchAssets, getBlob, localAvailability, objectUrl, removeAsset, seekTo, updateAsset } from "@/lib/media/media";
import type { AssetMeta } from "@/lib/types";
import { cn, downloadBlob, formatBytes, jsonFetch, relativeDate, safeFileName, shortTime } from "@/lib/utils";
import { Empty, Segmented, Spinner, toast } from "../ui";

const SOURCES = ["all", "camera", "screen", "broadcast", "import", "export", "photo"] as const;

async function analyze(a: AssetMeta): Promise<{ tags: string[]; analysis: Record<string, unknown> }> {
  const tags = new Set(a.tags);
  const analysis: Record<string, unknown> = { ...a.analysis, analyzedAt: new Date().toISOString() };
  const url = await objectUrl(a.id);
  if (!url) throw new Error("Media is not on this device");
  if (a.kind !== "audio") {
    const lumas: number[] = [], temps: number[] = [], sats: number[] = [];
    if (a.kind === "image") {
      const img = new Image();
      img.src = url;
      await img.decode();
      const d = sampleImage(img);
      if (d) {
        const s = frameStats(d);
        lumas.push(s.p50);
        temps.push(s.mean[0] - s.mean[2]);
        sats.push(s.saturation);
      }
    } else {
      const v = document.createElement("video");
      v.muted = true;
      v.src = url;
      await new Promise<void>((r) => {
        v.onloadeddata = () => r();
        v.onerror = () => r();
        setTimeout(r, 5000);
      });
      for (const f of [0.15, 0.5, 0.85]) {
        await seekTo(v, a.durationSec * f);
        const d = sampleImage(v);
        if (!d) continue;
        const s = frameStats(d);
        lumas.push(s.p50);
        temps.push(s.mean[0] - s.mean[2]);
        sats.push(s.saturation);
      }
    }
    const avg = (x: number[]) => (x.length ? x.reduce((p, c) => p + c, 0) / x.length : 0);
    const L = avg(lumas), T = avg(temps), S = avg(sats);
    analysis.luma = Math.round(L * 100) / 100;
    analysis.warmth = Math.round(T * 100) / 100;
    analysis.saturation = Math.round(S * 100) / 100;
    tags.add(L < 0.28 ? "low-key" : L > 0.62 ? "high-key" : "mid-key");
    if (L < 0.2) tags.add("night");
    tags.add(T > 0.06 ? "warm" : T < -0.04 ? "cool" : "neutral");
    tags.add(S > 0.32 ? "vivid" : S < 0.12 ? "muted" : "natural");
    if (a.height > a.width) tags.add("vertical");
    if (a.width >= 3840) tags.add("4k");
  }
  if (a.kind !== "image") {
    const buf = await decodeAssetAudio(a.id);
    if (buf) {
      const env = rmsEnvelope(buf, 0.05);
      const arr = Array.from(env);
      const mean = arr.reduce((p, c) => p + c, 0) / Math.max(1, arr.length);
      const loud = 20 * Math.log10(mean || 1e-5);
      const active = arr.filter((x) => x > mean * 0.6).length / Math.max(1, arr.length);
      analysis.loudnessDb = Math.round(loud);
      tags.add(loud < -50 ? "silent" : active < 0.55 ? "dialogue" : "music-or-ambience");
    }
  }
  if (a.captions.length) tags.add("transcribed");
  return { tags: [...tags].slice(0, 16), analysis };
}

export function Vault() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [local, setLocal] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"all" | "video" | "audio" | "image">("all");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
  const [circle, setCircle] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "long" | "rating">("new");
  const [open, setOpen] = useState<AssetMeta | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    fetchAssets()
      .then(async (a) => {
        setAssets(a);
        setLocal(await localAvailability(a.map((x) => x.id)));
      })
      .catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    setPreview(null);
    if (open && local.has(open.id)) objectUrl(open.id).then(setPreview);
  }, [open, local]);

  const list = useMemo(() => {
    if (!assets) return [];
    const s = q.toLowerCase();
    const out = assets.filter(
      (a) =>
        (kind === "all" || a.kind === kind) &&
        (source === "all" || a.source === source) &&
        (!circle || a.favorite) &&
        (!s || a.name.toLowerCase().includes(s) || a.tags.some((t) => t.includes(s)) || Object.values(a.slate).some((v) => String(v).toLowerCase().includes(s)) || a.captions.some((c) => c.text.toLowerCase().includes(s))),
    );
    return out.sort((x, y) => (sort === "old" ? x.createdAt.localeCompare(y.createdAt) : sort === "long" ? y.durationSec - x.durationSec : sort === "rating" ? y.rating - x.rating : y.createdAt.localeCompare(x.createdAt)));
  }, [assets, kind, source, circle, q, sort]);

  const patch = async (a: AssetMeta, p: Partial<AssetMeta>) => {
    setAssets((l) => l?.map((x) => (x.id === a.id ? { ...x, ...p } : x)) ?? null);
    if (open?.id === a.id) setOpen({ ...a, ...p });
    await updateAsset(a.id, p);
  };

  const runAnalysis = async (a: AssetMeta) => {
    setWorking(a.id);
    try {
      const r = await analyze(a);
      await patch(a, r);
      toast(`Analysed — ${r.tags.slice(0, 4).join(", ")}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setWorking(null);
    }
  };

  const toMontage = async (a: AssetMeta) => {
    const vertical = a.height > a.width;
    const d = await jsonFetch<{ project: { id: string } }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: a.slate.production && a.slate.production !== "Untitled" ? a.slate.production : a.name, width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, fps: Number(a.slate.fps) || 24, aspect: vertical ? "9:16" : "16:9" }),
    });
    router.push(`/editor/${d.project.id}?add=${a.id}`);
  };

  const download = async (a: AssetMeta) => {
    const b = await getBlob(a.id);
    if (!b) return toast("Not stored on this device.", "error");
    downloadBlob(b, `${safeFileName(a.name)}.${a.kind === "image" ? "jpg" : a.kind === "audio" ? "webm" : b.type.includes("mp4") ? "mp4" : "webm"}`);
  };

  const del = async (a: AssetMeta) => {
    if (!confirm(`Delete “${a.name}” from the Vault and this device?`)) return;
    await removeAsset(a.id);
    setAssets((l) => l?.filter((x) => x.id !== a.id) ?? null);
    setOpen(null);
  };

  const total = assets?.reduce((p, a) => p + a.sizeBytes, 0) ?? 0;

  return (
    <div className="min-h-screen px-10 pb-20 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">V · The Vault</div>
          <h1 className="mt-2 font-display text-6xl text-ivory">Every frame, <span className="italic text-gold">catalogued.</span></h1>
          <p className="mt-2 text-[13px] text-mist">{assets?.length ?? 0} assets · {formatBytes(total)} · slate metadata, circle takes, transcripts & AI tags</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-smoke" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, tags, slates, dialogue…" className="field w-72 !pl-8" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field !w-36">
            <option value="new">Newest</option>
            <option value="old">Oldest</option>
            <option value="long">Longest</option>
            <option value="rating">Top rated</option>
          </select>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "all", label: "All media" }, { value: "video", label: "Video" }, { value: "audio", label: "Audio" }, { value: "image", label: "Stills" }]} />
        <Segmented size="sm" value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s, label: s === "all" ? "Any source" : s[0].toUpperCase() + s.slice(1) }))} />
        <button onClick={() => setCircle(!circle)} className={cn("chip transition", circle && "!border-gold/60 !text-gold-hi")}><Star size={11} className={circle ? "fill-gold" : ""} /> Circle takes</button>
      </div>

      {!assets ? (
        <div className="mt-20 flex justify-center"><Spinner className="!h-6 !w-6" /></div>
      ) : !list.length ? (
        <Empty icon={<Archive size={30} strokeWidth={1} />} title="The Vault is quiet" body="Record in Capture, archive broadcasts, or import footage in Montage — everything lands here with its metadata." />
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {list.map((a) => (
            <Card key={a.id} a={a} offline={!local.has(a.id)} onOpen={() => setOpen(a)} onRate={(r) => patch(a, { rating: r })} onFav={() => patch(a, { favorite: !a.favorite })} />
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={() => setOpen(null)}>
          <div className="lux-glass animate-rise h-full w-full max-w-xl overflow-y-auto scroll-thin" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <span className="eyebrow">{open.source} · {open.kind}</span>
              <button onClick={() => setOpen(null)} className="text-mist hover:text-ivory"><X size={16} /></button>
            </div>
            <div className="bg-black">
              {preview ? (
                open.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="max-h-[360px] w-full object-contain" />
                ) : (
                  <video src={preview} controls className="max-h-[360px] w-full" />
                )
              ) : (
                <div className="flex h-56 items-center justify-center text-[12px] text-smoke">{local.has(open.id) ? <Spinner /> : "Media offline — captured on another device"}</div>
              )}
            </div>
            <div className="space-y-5 p-6">
              <input value={open.name} onChange={(e) => setOpen({ ...open, name: e.target.value })} onBlur={(e) => patch(open, { name: e.target.value })} className="w-full bg-transparent font-display text-3xl text-ivory outline-none" />
              <div className="flex flex-wrap gap-2">
                <button disabled={!local.has(open.id) || open.kind === "image"} onClick={() => toMontage(open)} className="btn btn-gold px-4 py-2"><Scissors size={13} /> Edit in Montage</button>
                <button disabled={!local.has(open.id) || working === open.id} onClick={() => runAnalysis(open)} className="btn btn-ghost px-4 py-2">{working === open.id ? <Spinner /> : <Sparkles size={13} />} AI analyse & tag</button>
                <button disabled={!local.has(open.id)} onClick={() => download(open)} className="btn btn-ghost px-4 py-2"><Download size={13} /> Download</button>
                <button onClick={() => del(open)} className="btn btn-ghost px-3 py-2 hover:!text-[#ff9aa9]"><Trash2 size={13} /></button>
              </div>
              <dl className="tc grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-[11px]">
                {[
                  ["Duration", open.kind === "image" ? "—" : shortTime(open.durationSec)],
                  ["Resolution", open.width ? `${open.width}×${open.height}` : "—"],
                  ["Size", formatBytes(open.sizeBytes)],
                  ["Format", open.mime.split(";")[0] || "—"],
                  ...Object.entries(open.slate).filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
                  ...Object.entries(open.analysis).filter(([k, v]) => typeof v === "number" && k !== "marks").map(([k, v]) => [k, String(v)]),
                ].map(([k, v]) => (
                  <div key={k} className="bg-ink-2 px-3 py-2">
                    <dt className="text-[8.5px] uppercase tracking-[0.22em] text-smoke">{k}</dt>
                    <dd className="truncate text-ivory/90">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <div className="eyebrow mb-2">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {open.tags.map((t) => (
                    <button key={t} onClick={() => patch(open, { tags: open.tags.filter((x) => x !== t) })} className="chip hover:!border-ruby/50" title="Remove">#{t}</button>
                  ))}
                  <input
                    placeholder="+ tag"
                    className="w-24 bg-transparent text-[11px] text-ivory outline-none"
                    onKeyDown={(e) => {
                      const v = e.currentTarget.value.trim().toLowerCase();
                      if (e.key === "Enter" && v) {
                        void patch(open, { tags: [...new Set([...open.tags, v])] });
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                </div>
              </div>
              {open.captions.length > 0 && (
                <div>
                  <div className="eyebrow mb-2">Transcript</div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-2 font-display text-[15px] leading-relaxed text-ivory/85 scroll-thin">
                    {open.captions.map((c, i) => (
                      <p key={i}><span className="tc mr-2 text-[10px] text-gold/70">{shortTime(c.start)}</span>{c.text}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ a, offline, onOpen, onRate, onFav }: { a: AssetMeta; offline: boolean; onOpen: () => void; onRate: (r: number) => void; onFav: () => void }) {
  const [frame, setFrame] = useState<string | null>(null);
  return (
    <article className="group overflow-hidden rounded-xl border border-line bg-ink-3 transition hover:border-gold/40 hover:shadow-[0_30px_60px_-30px_rgba(216,181,122,0.3)]">
      <button
        onClick={onOpen}
        className="relative block aspect-video w-full bg-black"
        onMouseMove={(e) => {
          if (!a.filmstrip.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          setFrame(a.filmstrip[Math.min(a.filmstrip.length - 1, Math.floor(((e.clientX - r.left) / r.width) * a.filmstrip.length))]);
        }}
        onMouseLeave={() => setFrame(null)}
      >
        {a.kind === "audio" ? (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
            {a.peaks.filter((_, i) => i % 6 === 0).map((p, i, arr) => (
              <rect key={i} x={(i / arr.length) * 100} y={20 - p * 17} width={100 / arr.length - 0.3} height={Math.max(0.5, p * 34)} fill="rgba(216,181,122,0.6)" />
            ))}
          </svg>
        ) : (
          (frame ?? a.thumbnail) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frame ?? a.thumbnail ?? ""} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
          )
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 font-mono text-[9.5px] text-ivory">{a.kind === "image" ? "STILL" : shortTime(a.durationSec)}</span>
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.18em] text-gold">{a.source}</span>
        {offline && <span className="absolute right-2 top-2 rounded bg-ruby/90 px-1.5 text-[8px] font-bold tracking-wider text-white">OFFLINE</span>}
      </button>
      <div className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-display text-[17px] text-ivory">{a.name}</h3>
          <button onClick={onFav} title="Circle take"><Star size={13} className={a.favorite ? "fill-gold text-gold" : "text-smoke hover:text-gold"} /></button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} onClick={() => onRate(r === a.rating ? 0 : r)} className={cn("h-1.5 w-4 rounded-full transition", r <= a.rating ? "bg-gold" : "bg-white/10 hover:bg-gold/40")} title={`${r} star`} />
            ))}
          </div>
          <span className="text-[10px] text-smoke">{relativeDate(a.createdAt)}</span>
        </div>
        {a.tags.length > 0 && <div className="truncate text-[10px] text-mist">#{a.tags.slice(0, 4).join(" #")}</div>}
      </div>
    </article>
  );
}
