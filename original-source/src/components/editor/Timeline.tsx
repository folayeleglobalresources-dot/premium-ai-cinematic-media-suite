"use client";

import { formatTimecode } from "@/lib/api";
import { timelineDuration, type Clip, type TimelineData } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  tl: TimelineData;
  playhead: number;
  selectedId: string | null;
  zoom: number; // px per second
  snap: boolean;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  onChange: (tl: TimelineData, commit: boolean) => void;
  onZoom: (z: number) => void;
};

const TRACKS: { index: number; label: string; kind: "video" | "overlay" | "audio" }[] = [
  { index: 1, label: "V2", kind: "overlay" },
  { index: 0, label: "V1", kind: "video" },
  { index: 2, label: "A1", kind: "audio" },
];
const ROW = 58;
const GUTTER = 56;
const RULER = 26;

type Drag =
  | { mode: "move"; id: string; startX: number; startY: number; orig: Clip; moved: boolean }
  | { mode: "trimL" | "trimR"; id: string; startX: number; orig: Clip }
  | { mode: "scrub" };

export function Timeline({ tl, playhead, selectedId, zoom, snap, onSelect, onSeek, onChange, onZoom }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const duration = timelineDuration(tl);
  const width = Math.max(800, (duration + 10) * zoom);

  const ticks = useMemo(() => {
    const options = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
    const interval = options.find((o) => o * zoom >= 70) ?? 120;
    const out: number[] = [];
    for (let t = 0; t <= width / zoom; t += interval) out.push(+t.toFixed(3));
    return { interval, out };
  }, [zoom, width]);

  const snapTo = useCallback(
    (t: number, exclude: string) => {
      if (!snap) return t;
      const pts = [0, playhead];
      for (const c of tl.clips) {
        if (c.id === exclude) continue;
        pts.push(c.start, c.start + c.duration);
      }
      const tol = 8 / zoom;
      let best = t;
      let bd = tol;
      for (const p of pts) {
        const d = Math.abs(p - t);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    },
    [snap, playhead, tl.clips, zoom],
  );

  const xToTime = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - GUTTER) / zoom);
  };

  const yToTrack = (clientY: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop - RULER;
    const row = Math.max(0, Math.min(TRACKS.length - 1, Math.floor(y / ROW)));
    return TRACKS[row].index;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.mode === "scrub") {
        onSeek(xToTime(e.clientX));
        return;
      }
      const clip = tl.clips.find((c) => c.id === d.id);
      if (!clip) return;
      const dx = (e.clientX - d.startX) / zoom;
      let next: Clip = clip;
      if (d.mode === "move") {
        const start = snapTo(Math.max(0, d.orig.start + dx), d.id);
        const endSnap = snapTo(start + d.orig.duration, d.id);
        const finalStart = Math.abs(endSnap - (start + d.orig.duration)) < Math.abs(start - (d.orig.start + dx)) ? endSnap - d.orig.duration : start;
        let track = d.orig.track;
        if (d.orig.kind !== "audio") {
          const t = yToTrack(e.clientY);
          if (t === 0 || t === 1) track = t;
        }
        d.moved = d.moved || Math.abs(e.clientX - d.startX) > 3;
        next = { ...clip, start: Math.max(0, finalStart), track };
      } else if (d.mode === "trimL") {
        const maxStart = d.orig.start + d.orig.duration - 0.2;
        let ns = snapTo(d.orig.start + dx, d.id);
        const minStart = d.orig.start - d.orig.inPoint / d.orig.speed;
        ns = Math.max(Math.max(0, d.orig.kind === "title" || d.orig.kind === "image" ? 0 : minStart), Math.min(maxStart, ns));
        const delta = ns - d.orig.start;
        next = { ...clip, start: ns, duration: d.orig.duration - delta, inPoint: d.orig.kind === "title" || d.orig.kind === "image" ? 0 : d.orig.inPoint + delta * d.orig.speed };
      } else if (d.mode === "trimR") {
        let nd = snapTo(d.orig.start + d.orig.duration + dx, d.id) - d.orig.start;
        nd = Math.max(0.2, nd);
        if (d.orig.sourceDuration > 0 && d.orig.kind !== "image") nd = Math.min(nd, (d.orig.sourceDuration - d.orig.inPoint) / d.orig.speed);
        next = { ...clip, duration: nd };
      }
      onChange({ ...tl, clips: tl.clips.map((c) => (c.id === d.id ? next : c)) }, false);
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (d.mode !== "scrub") onChange(tl, true);
      force((n) => n + 1);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl, zoom, snapTo, onChange, onSeek]);

  // keep playhead visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * zoom + GUTTER;
    if (x < el.scrollLeft + GUTTER || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [playhead, zoom]);

  return (
    <div className="flex flex-col h-full select-none">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] text-[10px] text-muted">
        <div className="flex items-center gap-3">
          <span className="eyebrow">Timeline</span>
          <span className="readout">{formatTimecode(duration, tl.fps)}</span>
          <span className="readout hidden sm:inline">{tl.clips.length} clips · {tl.width}×{tl.height} · {tl.fps} fps</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Zoom</span>
          <input type="range" className="slider w-28" min={10} max={400} step={1} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onZoom(Math.max(10, Math.min(400, zoom * (e.deltaY > 0 ? 0.9 : 1.1))));
          }
        }}
      >
        <div className="relative" style={{ width: width + GUTTER, height: RULER + TRACKS.length * ROW }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-20 h-[26px] bg-[#0b0b10] border-b border-white/[0.08] cursor-ew-resize"
            style={{ width: width + GUTTER }}
            onPointerDown={(e) => {
              dragRef.current = { mode: "scrub" };
              onSeek(xToTime(e.clientX));
              onSelect(null);
            }}
          >
            {ticks.out.map((t) => (
              <div key={t} className="absolute top-0 h-full" style={{ left: GUTTER + t * zoom }}>
                <div className={`w-px ${t % (ticks.interval * 5) < 1e-6 ? "h-3 bg-white/40" : "h-1.5 bg-white/20"}`} />
                {t % (ticks.interval * 2) < 1e-6 ? <span className="absolute left-1 top-2 readout text-[8px] text-white/45">{formatTimecode(t, tl.fps).slice(3)}</span> : null}
              </div>
            ))}
          </div>

          {/* Track lanes */}
          {TRACKS.map((tr, row) => (
            <div
              key={tr.index}
              className="absolute left-0 right-0 border-b border-white/[0.05] timeline-grid"
              style={{ top: RULER + row * ROW, height: ROW, backgroundSize: `${ticks.interval * zoom}px 100%, ${(ticks.interval * zoom) / 4}px 100%`, backgroundPosition: `${GUTTER}px 0` }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).dataset.clip) return;
                dragRef.current = { mode: "scrub" };
                onSeek(xToTime(e.clientX));
                onSelect(null);
              }}
            >
              <div className="sticky left-0 z-10 h-full w-[56px] bg-[#0b0b10] border-r border-white/[0.08] flex flex-col items-center justify-center">
                <span className="readout text-[10px] text-ivory/80">{tr.label}</span>
                <span className="text-[7px] tracking-[0.2em] uppercase text-muted">{tr.kind}</span>
              </div>
            </div>
          ))}

          {/* Clips */}
          {tl.clips.map((c) => {
            const row = TRACKS.findIndex((t) => t.index === c.track);
            if (row < 0) return null;
            const selected = c.id === selectedId;
            const cls = c.kind === "title" ? "clip-title" : c.kind === "audio" ? "clip-audio" : c.kind === "image" ? "clip-image" : "clip-video";
            return (
              <div
                key={c.id}
                data-clip="1"
                className={`absolute ${cls} ${selected ? "clip-selected" : ""} cursor-grab active:cursor-grabbing overflow-hidden`}
                style={{ left: GUTTER + c.start * zoom, top: RULER + row * ROW + 6, width: Math.max(4, c.duration * zoom), height: ROW - 12 }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(c.id);
                  dragRef.current = { mode: "move", id: c.id, startX: e.clientX, startY: e.clientY, orig: c, moved: false };
                }}
                onDoubleClick={() => onSeek(c.start)}
              >
                <div data-clip="1" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/30" onPointerDown={(e) => { e.stopPropagation(); onSelect(c.id); dragRef.current = { mode: "trimL", id: c.id, startX: e.clientX, orig: c }; }} />
                <div data-clip="1" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30" onPointerDown={(e) => { e.stopPropagation(); onSelect(c.id); dragRef.current = { mode: "trimR", id: c.id, startX: e.clientX, orig: c }; }} />
                {c.transitionIn.type !== "none" && c.transitionIn.duration > 0 ? (
                  <div data-clip="1" className="absolute left-0 top-0 bottom-0 bg-white/15 border-r border-white/40 pointer-events-none" style={{ width: c.transitionIn.duration * zoom }} />
                ) : null}
                <div data-clip="1" className="px-2.5 py-1.5 flex flex-col pointer-events-none">
                  <span className="text-[10px] text-ivory truncate">{c.kind === "title" ? `T · ${c.title?.text ?? ""}` : c.name}</span>
                  <span className="readout text-[8px] text-ivory/60 truncate">
                    {c.duration.toFixed(2)}s{c.speed !== 1 ? ` · ${c.speed}×` : ""}
                    {c.lookId ? ` · ${c.lookId}` : ""}
                  </span>
                </div>
                {c.fadeIn > 0 ? <div className="absolute left-0 bottom-0 h-full pointer-events-none" style={{ width: c.fadeIn * zoom, background: "linear-gradient(90deg, rgba(0,0,0,0.5), transparent)" }} /> : null}
                {c.fadeOut > 0 ? <div className="absolute right-0 bottom-0 h-full pointer-events-none" style={{ width: c.fadeOut * zoom, background: "linear-gradient(270deg, rgba(0,0,0,0.5), transparent)" }} /> : null}
              </div>
            );
          })}

          {/* Playhead */}
          <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: GUTTER + playhead * zoom }}>
            <div className="w-px h-full bg-gold-bright shadow-[0_0_8px_rgba(var(--accent-rgb),0.9)]" />
            <div className="absolute -top-0 -left-[5px] w-[11px] h-[11px] bg-gold-bright" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
