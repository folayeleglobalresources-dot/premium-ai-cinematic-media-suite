"use client";

import { AudioLines, Film, Image as ImageIcon, Plus, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/lib/editor/store";
import { ingestBlob, localAvailability } from "@/lib/media/media";
import type { AssetMeta } from "@/lib/types";
import { cn, shortTime } from "@/lib/utils";
import { Segmented, Spinner, toast } from "../ui";

const ACCEPT = /\.(mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|ogg|oga|flac|png|jpe?g|webp|gif|avif)$/i;

export function MediaBin() {
  const assets = useEditor((s) => s.assets);
  const projectId = useEditor((s) => s.projectId);
  const [filter, setFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [q, setQ] = useState("");
  const [available, setAvailable] = useState<Set<string> | null>(null);
  const [importing, setImporting] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localAvailability(assets.map((a) => a.id)).then(setAvailable).catch(() => null);
  }, [assets]);

  const list = useMemo(
    () => assets.filter((a) => (filter === "all" || a.kind === filter) && (!q || a.name.toLowerCase().includes(q.toLowerCase()) || a.tags.some((t) => t.includes(q.toLowerCase())))),
    [assets, filter, q],
  );

  const importFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => /^(video|audio|image)\//.test(f.type) || ACCEPT.test(f.name));
    if (!arr.length) return toast("Drop video, audio or image files.", "error");
    for (const f of arr) {
      setImporting((s) => [...s, f.name]);
      try {
        const a = await ingestBlob(f, { name: f.name.replace(/\.[^.]+$/, ""), source: "import", projectId });
        useEditor.getState().addAsset(a);
        setAvailable((s) => new Set([...(s ?? []), a.id]));
      } catch {
        toast(`Couldn't import ${f.name}`, "error");
      } finally {
        setImporting((s) => s.filter((n) => n !== f.name));
      }
    }
    toast(`${arr.length} file${arr.length > 1 ? "s" : ""} ingested`, "success");
  };

  return (
    <aside
      className="relative flex w-[262px] shrink-0 flex-col border-r border-line"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="eyebrow">Media</span>
        <button onClick={() => fileRef.current?.click()} className="btn btn-ghost px-3 py-1 !text-[11px]">
          <Upload size={12} /> Import
        </button>
        <input ref={fileRef} type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => e.target.files && importFiles(e.target.files)} />
      </div>
      <div className="px-4">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-smoke" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media & tags" className="field !py-1.5 !pl-7 !text-[11.5px]" />
        </div>
        <Segmented size="sm" className="mt-2 w-full" value={filter} onChange={setFilter} options={[
          { value: "all", label: "All" },
          { value: "video", label: <Film size={11} /> },
          { value: "audio", label: <AudioLines size={11} /> },
          { value: "image", label: <ImageIcon size={11} /> },
        ]} />
      </div>
      <div className="mt-3 flex-1 overflow-y-auto px-4 pb-4 scroll-thin">
        {importing.map((n) => (
          <div key={n} className="mb-2 flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-gold-hi">
            <Spinner /> <span className="truncate">Ingesting {n}</span>
          </div>
        ))}
        {!list.length && !importing.length && (
          <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-2 px-4 py-10 text-center text-mist transition hover:border-gold/50 hover:text-gold">
            <Upload size={20} strokeWidth={1.2} />
            <span className="font-display text-lg italic">Drop footage here</span>
            <span className="text-[10.5px] text-smoke">MP4 · MOV · WebM · WAV · MP3 · PNG · JPG</span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {list.map((a) => (
            <AssetCard key={a.id} asset={a} offline={available ? !available.has(a.id) : false} />
          ))}
        </div>
      </div>
      {over && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-gold/70 bg-gold/10 font-display text-xl italic text-gold-hi">
          Release to ingest
        </div>
      )}
    </aside>
  );
}

function AssetCard({ asset: a, offline }: { asset: AssetMeta; offline: boolean }) {
  const [frame, setFrame] = useState<string | null>(null);
  return (
    <div
      draggable={!offline}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-lumiere-asset", a.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={() => !offline && useEditor.getState().addAssetClip(a)}
      className={cn("group relative cursor-grab overflow-hidden rounded-lg border border-line bg-ink-3 transition hover:border-gold/40", offline && "opacity-60")}
      title={`${a.name}\n${a.width ? `${a.width}×${a.height} · ` : ""}${a.source}${a.tags.length ? `\n#${a.tags.join(" #")}` : ""}`}
    >
      <div
        className="relative aspect-video bg-black"
        onMouseMove={(e) => {
          if (!a.filmstrip.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.min(a.filmstrip.length - 1, Math.floor(((e.clientX - r.left) / r.width) * a.filmstrip.length));
          setFrame(a.filmstrip[i]);
        }}
        onMouseLeave={() => setFrame(null)}
      >
        {a.kind === "audio" ? (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
            {a.peaks.filter((_, i) => i % 8 === 0).map((p, i, arr) => (
              <rect key={i} x={(i / arr.length) * 100} y={20 - p * 16} width={100 / arr.length - 0.4} height={Math.max(0.6, p * 32)} fill="rgba(99,195,148,0.7)" />
            ))}
          </svg>
        ) : (
          (frame ?? a.thumbnail) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frame ?? a.thumbnail ?? ""} alt="" draggable={false} className="h-full w-full object-cover" />
          )
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[8.5px] text-ivory">{a.kind === "image" ? "IMG" : shortTime(a.durationSec)}</span>
        {offline && <span className="absolute left-1 top-1 rounded bg-ruby/90 px-1 text-[8px] font-bold tracking-wider text-white">OFFLINE</span>}
        {a.favorite && <span className="absolute left-1 top-1 text-[10px] text-gold">★</span>}
        {!offline && (
          <button onClick={() => useEditor.getState().addAssetClip(a)} className="absolute right-1 top-1 rounded-full bg-gold/90 p-1 text-ink opacity-0 transition group-hover:opacity-100" title="Append to timeline">
            <Plus size={10} />
          </button>
        )}
      </div>
      <div className="truncate px-1.5 py-1 text-[10px] text-ivory/80">{a.name}</div>
    </div>
  );
}
