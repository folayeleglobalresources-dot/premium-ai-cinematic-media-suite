"use client";

import { assetFileUrl, assetThumbUrl, fetchJSON, formatBytes, formatDuration, probeAudio, probeImage, probeVideo, thumbFromSource, thumbFromVideoUrl, uploadAsset } from "@/lib/api";
import { findLook } from "@/lib/looks";
import type { AssetDTO } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Spinner } from "../ui/Controls";

export function LibraryGrid() {
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "image" | "audio" | "favorite">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<AssetDTO | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const load = () =>
    fetchJSON<AssetDTO[]>("/api/assets")
      .then(setAssets)
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const list = useMemo(
    () =>
      assets.filter((a) => {
        if (filter === "favorite" && !a.favorite) return false;
        if (filter !== "all" && filter !== "favorite" && a.kind !== filter) return false;
        if (query && !a.name.toLowerCase().includes(query.toLowerCase()) && !a.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))) return false;
        return true;
      }),
    [assets, filter, query],
  );

  const patch = async (id: number, body: Partial<AssetDTO>) => {
    const updated = await fetchJSON<AssetDTO>(`/api/assets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setAssets((a) => a.map((x) => (x.id === id ? updated : x)));
    if (open?.id === id) setOpen(updated);
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this asset permanently?")) return;
    await fetchJSON(`/api/assets/${id}`, { method: "DELETE" });
    setAssets((a) => a.filter((x) => x.id !== id));
    setOpen(null);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setImporting(file.name);
      try {
        const kind: AssetDTO["kind"] = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video";
        const url = URL.createObjectURL(file);
        let durationMs = 0;
        let width = 0;
        let height = 0;
        let thumb: string | null = null;
        if (kind === "video") {
          const p = await probeVideo(url);
          durationMs = p.durationMs;
          width = p.width;
          height = p.height;
          thumb = await thumbFromVideoUrl(url, Math.min(1, durationMs / 2000));
        } else if (kind === "image") {
          const p = await probeImage(url);
          width = p.width;
          height = p.height;
          const img = new Image();
          img.src = url;
          await img.decode().catch(() => null);
          thumb = thumbFromSource(img, width, height);
        } else durationMs = (await probeAudio(url)).durationMs;
        URL.revokeObjectURL(url);
        const asset = await uploadAsset({ blob: file, name: file.name.replace(/\.[^.]+$/, ""), kind, mime: file.type || "application/octet-stream", durationMs, width, height, source: "import", thumbDataUrl: thumb });
        setAssets((a) => [asset, ...a]);
      } catch {
        /* ignore */
      }
    }
    setImporting(null);
  };

  const totals = useMemo(() => ({ size: assets.reduce((s, a) => s + a.size, 0), dur: assets.reduce((s, a) => s + a.durationMs, 0) / 1000 }), [assets]);

  return (
    <div className="vignette-page min-h-screen px-5 md:px-12 py-10 md:py-14">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="eyebrow mb-3 reveal">Vault</div>
            <h1 className="display text-5xl md:text-7xl reveal reveal-2">
              Every <span className="gold-text italic">frame</span>, kept
            </h1>
            <div className="readout text-[10px] text-muted mt-3 reveal reveal-3">
              {assets.length} assets · {formatBytes(totals.size)} · {formatDuration(totals.dur)} of footage
            </div>
          </div>
          <div className="flex items-center gap-2 reveal reveal-3">
            <input className="field !w-48" placeholder="Search name or tag" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="btn cursor-pointer">
              {importing ? <Spinner /> : null} Import
              <input type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => importFiles(e.target.files)} />
            </label>
          </div>
        </div>
        <div className="flex gap-1.5 mb-6 flex-wrap">
          {(["all", "video", "image", "audio", "favorite"] as const).map((f) => (
            <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : list.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {list.map((a, i) => (
              <button key={a.id} className={`group text-left glass overflow-hidden hover:border-gold/50 transition-all reveal ${i % 2 ? "reveal-2" : ""}`} onClick={() => setOpen(a)}>
                <div className="relative aspect-video bg-black overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetThumbUrl(a.id)} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="chip !py-0.5 !px-1.5 !text-[8px]">{a.kind}</span>
                    {a.source !== "import" ? <span className="chip !py-0.5 !px-1.5 !text-[8px]">{a.source}</span> : null}
                  </div>
                  {a.favorite ? <span className="absolute top-2 right-2 text-gold-bright">★</span> : null}
                  <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                    <span className="readout text-[10px] text-ivory/90">{a.kind === "image" ? `${a.width}×${a.height}` : formatDuration(a.durationMs / 1000)}</span>
                    <span className="readout text-[9px] text-ivory/60">{formatBytes(a.size)}</span>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[12px] truncate">{a.name}</div>
                  <div className="readout text-[9px] text-muted mt-0.5">
                    {a.width && a.kind !== "image" ? `${a.width}×${a.height} · ` : ""}
                    {new Date(a.createdAt).toLocaleDateString()}
                    {a.lookId ? ` · ${findLook(a.lookId)?.name ?? a.lookId}` : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="glass p-14 text-center">
            <div className="display text-3xl mb-2">The vault is empty</div>
            <p className="text-muted text-sm mb-5">Record in the Studio or import footage to begin.</p>
            <Link href="/studio" className="btn btn-solid">
              Open the Studio
            </Link>
          </div>
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="glass-strong w-full max-w-5xl max-h-[92vh] overflow-y-auto grid lg:grid-cols-[1fr_320px]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-black flex items-center justify-center min-h-[280px]">
              {open.kind === "video" ? (
                <video src={assetFileUrl(open.id)} controls className="w-full max-h-[70vh]" />
              ) : open.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetFileUrl(open.id)} alt={open.name} className="w-full max-h-[70vh] object-contain" />
              ) : (
                <audio src={assetFileUrl(open.id)} controls className="w-full px-6" />
              )}
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div>
                <div className="eyebrow mb-1">{open.kind} · {open.source}</div>
                <input className="field display !text-xl" value={open.name} onChange={(e) => setOpen({ ...open, name: e.target.value })} onBlur={() => patch(open.id, { name: open.name })} />
              </div>
              <div className="grid grid-cols-2 gap-2 readout text-[10px] text-muted">
                <span>{open.width}×{open.height}</span>
                <span>{open.kind === "image" ? "still" : formatDuration(open.durationMs / 1000)}</span>
                <span>{formatBytes(open.size)}</span>
                <span>{open.mime}</span>
                {open.fps ? <span>{Number(open.fps).toFixed(2).replace(/\.?0+$/, "")} fps</span> : null}
                {typeof open.metadata.codec === "string" ? <span>{open.metadata.codec}</span> : null}
                {typeof open.metadata.bitrateMbps === "number" ? <span>{open.metadata.bitrateMbps} Mb/s</span> : null}
                {open.lookId ? <span>Look: {findLook(open.lookId)?.name ?? open.lookId}</span> : null}
                {typeof open.metadata.camera === "string" ? <span className="col-span-2 truncate">{open.metadata.camera}</span> : null}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted mb-1">Tags</div>
                <input
                  className="field"
                  placeholder="comma, separated"
                  defaultValue={open.tags.join(", ")}
                  onBlur={(e) =>
                    patch(open.id, {
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={`chip ${open.favorite ? "active" : ""}`} onClick={() => patch(open.id, { favorite: !open.favorite })}>
                  ★ Favourite
                </button>
                {open.kind !== "audio" ? (
                  <Link href={`/editor?asset=${open.id}`} className="btn btn-sm">
                    Open in Cutting Room
                  </Link>
                ) : null}
                <a href={assetFileUrl(open.id)} download className="btn btn-sm btn-ghost">
                  Download
                </a>
                <button className="btn btn-sm btn-danger" onClick={() => remove(open.id)}>
                  Delete
                </button>
              </div>
              <div className="text-[10px] text-muted">Created {new Date(open.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
