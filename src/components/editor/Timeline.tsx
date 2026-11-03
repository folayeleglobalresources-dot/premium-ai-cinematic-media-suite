"use client";

import { Eye, EyeOff, Flag, Lock, Magnet, MousePointer2, Plus, Scissors, Trash2, Type, Unlock, Volume2, VolumeX, ZoomIn } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { getLook } from "@/lib/looks";
import { clipEnd, compatibleTrack, resolveOverlaps, splitClipAt, useEditor } from "@/lib/editor/store";
import { timelineDuration, type AssetMeta, type Clip, type Track, type TrackKind } from "@/lib/types";
import { clamp, cn } from "@/lib/utils";

const RULER = 28;
const HEADER_W = 170;
const laneHeight = (k: TrackKind) => (k === "video" ? 68 : k === "audio" ? 54 : 40);

interface Lane {
  track: Track;
  y: number;
  h: number;
}

function majorStep(zoom: number) {
  const steps = [0.04, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * zoom >= 90) ?? 600;
}

function label(t: number, step: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  if (step < 1) return `${m}:${String(s).padStart(2, "0")}.${String(Math.round((t % 1) * 100)).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Timeline() {
  const timeline = useEditor((s) => s.timeline);
  const zoom = useEditor((s) => s.zoom);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const snapping = useEditor((s) => s.snapping);
  const assets = useEditor((s) => s.assets);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  const [view, setView] = useState({ left: 0, width: 1200 });
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const duration = timelineDuration(timeline);
  const capH = timeline.captions.length ? 18 : 0;
  const top = RULER + capH;
  const lanes: Lane[] = useMemo(() => {
    let y = 0;
    return timeline.tracks.map((t) => {
      const l = { track: t, y, h: laneHeight(t.kind) };
      y += l.h;
      return l;
    });
  }, [timeline.tracks]);
  const lanesH = lanes.reduce((a, l) => a + l.h, 0);
  const totalW = Math.max(view.width, (duration + 40) * zoom);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView((v) => ({ ...v, width: el.clientWidth })));
    ro.observe(el);
    // native, non-passive wheel listener so ⌘/Ctrl + wheel zooms the timeline instead of the page
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const s = useEditor.getState();
      s.setZoom(s.zoom * (e.deltaY < 0 ? 1.12 : 0.89));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft) / useEditor.getState().zoom);
  };
  const laneAt = (clientY: number): Lane | undefined => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const y = clientY - r.top + el.scrollTop - top;
    return lanes.find((l) => y >= l.y && y < l.y + l.h);
  };

  const snapCandidates = (exclude: string) => {
    const st = useEditor.getState();
    const c: number[] = [0, st.playhead];
    for (const x of st.timeline.clips) if (x.id !== exclude) c.push(x.start, clipEnd(x));
    for (const m of st.timeline.markers) c.push(m.time);
    return c;
  };
  const snap = (t: number, cands: number[]) => {
    if (!useEditor.getState().snapping) return t;
    const th = 8 / useEditor.getState().zoom;
    let best = t, bd = th;
    for (const c of cands) {
      const d = Math.abs(c - t);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };

  const startDrag = (e: RPointerEvent, c: Clip, mode: "move" | "trim-l" | "trim-r") => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const st = useEditor.getState();
    const track = st.timeline.tracks.find((t) => t.id === c.trackId);
    if (track?.locked) return;
    if (st.tool === "blade" && mode === "move") {
      const t = snap(timeAt(e.clientX), [st.playhead]);
      st.commit((tl) => {
        splitClipAt(tl, c.id, t);
      });
      return;
    }
    if (e.shiftKey || e.metaKey) st.select([c.id], true);
    else if (!st.selection.includes(c.id)) st.select([c.id]);
    st.set("inspector", c.kind === "title" ? "titles" : st.inspector === "deliver" ? "clip" : st.inspector);
    const orig: Clip = JSON.parse(JSON.stringify(c));
    const asset = c.assetId ? useEditor.getState().assets.find((a) => a.id === c.assetId) : undefined;
    const cands = snapCandidates(c.id);
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const s = useEditor.getState();
      if (!moved) {
        if (Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return;
        moved = true;
        s.beginGesture();
      }
      const dx = (ev.clientX - x0) / s.zoom;
      if (mode === "move") {
        let start = Math.max(0, orig.start + dx);
        const s1 = snap(start, cands);
        const e1 = snap(start + orig.duration, cands);
        start = Math.abs(s1 - start) <= Math.abs(e1 - (start + orig.duration)) ? s1 : e1 - orig.duration;
        const lane = laneAt(ev.clientY);
        s.mutateLive((tl) => {
          const cl = tl.clips.find((x) => x.id === c.id);
          if (!cl) return;
          cl.start = Math.max(0, start);
          if (lane && lane.track.id !== cl.trackId && !lane.track.locked && compatibleTrack(tl, cl, lane.track.id)) cl.trackId = lane.track.id;
        });
      } else if (mode === "trim-l") {
        const media = orig.kind === "video" || orig.kind === "audio";
        const minStart = media ? orig.start - orig.sourceIn / orig.speed : 0;
        const ns = clamp(snap(orig.start + dx, cands), Math.max(0, minStart), clipEnd(orig) - 0.1);
        s.mutateLive((tl) => {
          const cl = tl.clips.find((x) => x.id === c.id);
          if (!cl) return;
          const d = ns - orig.start;
          cl.start = ns;
          cl.duration = orig.duration - d;
          if (media) cl.sourceIn = Math.max(0, orig.sourceIn + d * orig.speed);
        });
      } else {
        const media = orig.kind === "video" || orig.kind === "audio";
        const maxDur = media && asset?.durationSec ? (asset.durationSec - orig.sourceIn) / orig.speed : 3600;
        const ne = snap(clipEnd(orig) + dx, cands);
        const nd = clamp(ne - orig.start, 0.1, maxDur);
        s.mutateLive((tl) => {
          const cl = tl.clips.find((x) => x.id === c.id);
          if (cl) cl.duration = nd;
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      if (moved) useEditor.getState().mutateLive((tl) => resolveOverlaps(tl, c.id));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const scrub = (e: RPointerEvent) => {
    const st = useEditor.getState();
    st.setPlaying(false);
    st.setPlayhead(timeAt(e.clientX));
    const onMove = (ev: PointerEvent) => useEditor.getState().setPlayhead(timeAt(ev.clientX));
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", onMove), { once: true });
  };

  const step = majorStep(zoom);
  const ticks: number[] = [];
  const t0 = Math.floor(view.left / zoom / step) * step;
  for (let t = t0; t * zoom < view.left + view.width + 200; t += step) ticks.push(t);

  const st = useEditor.getState;

  return (
    <div className="relative shrink-0 border-t border-line bg-ink-2" style={{ height }}>
      <div
        className="absolute -top-1 left-0 right-0 z-20 h-2 cursor-ns-resize"
        onPointerDown={(e) => {
          const y0 = e.clientY, h0 = height;
          const mv = (ev: PointerEvent) => setHeight(clamp(h0 - (ev.clientY - y0), 170, window.innerHeight * 0.65));
          window.addEventListener("pointermove", mv);
          window.addEventListener("pointerup", () => window.removeEventListener("pointermove", mv), { once: true });
        }}
      />
      {/* toolbar */}
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1">
          <ToolBtn active={tool === "select"} onClick={() => st().set("tool", "select")} title="Select (V)"><MousePointer2 size={14} /></ToolBtn>
          <ToolBtn active={tool === "blade"} onClick={() => st().set("tool", "blade")} title="Blade (B)"><Scissors size={14} /></ToolBtn>
          <span className="mx-1.5 h-4 w-px bg-line-2" />
          <ToolBtn active={snapping} onClick={() => st().set("snapping", !snapping)} title="Magnetic snapping"><Magnet size={14} /></ToolBtn>
          <ToolBtn onClick={() => st().splitAtPlayhead()} title="Split at playhead (S)"><span className="text-[10px] font-bold tracking-wider">SPLIT</span></ToolBtn>
          <ToolBtn onClick={() => st().deleteSelection(false)} disabled={!selection.length} title="Delete (⌫)"><Trash2 size={13} /></ToolBtn>
          <ToolBtn onClick={() => st().deleteSelection(true)} disabled={!selection.length} title="Ripple delete (⇧⌫)"><span className="text-[10px] font-bold tracking-wider">RIPPLE</span></ToolBtn>
          <span className="mx-1.5 h-4 w-px bg-line-2" />
          <ToolBtn onClick={() => st().commit((tl) => tl.markers.push({ id: crypto.randomUUID(), time: st().playhead, label: `Marker ${tl.markers.length + 1}`, color: "#E8C27A" }))} title="Marker (M)"><Flag size={13} /></ToolBtn>
          <ToolBtn onClick={() => st().addTitle("cinematic")} title="Title (T)"><Type size={13} /></ToolBtn>
        </div>
        <div className="flex items-center gap-3">
          <span className="tc text-[10.5px] text-smoke">{selection.length ? `${selection.length} selected · ` : ""}{timeline.clips.length} clips</span>
          <ZoomIn size={13} className="text-smoke" />
          <input type="range" min={4} max={400} value={zoom} onChange={(e) => st().setZoom(Number(e.target.value))} className="w-28 accent-[#d8b57a]" />
          <button onClick={() => st().setZoom((view.width - 60) / Math.max(5, duration))} className="text-[10px] font-bold uppercase tracking-[0.15em] text-mist hover:text-gold">Fit</button>
        </div>
      </div>

      <div className="flex" style={{ height: height - 36 }}>
        {/* headers */}
        <div className="shrink-0 overflow-hidden border-r border-line" style={{ width: HEADER_W }}>
          <div className="flex items-center justify-between border-b border-line px-2" style={{ height: top }}>
            <span className="text-[9px] uppercase tracking-[0.25em] text-smoke">Tracks</span>
            <div className="flex gap-0.5">
              {(["video", "audio", "text"] as const).map((k) => (
                <button key={k} onClick={() => st().addTrack(k)} className="flex items-center gap-0.5 rounded px-1 text-[9px] font-bold text-mist hover:bg-white/5 hover:text-gold" title={`Add ${k} track`}>
                  <Plus size={9} />{k === "video" ? "V" : k === "audio" ? "A" : "T"}
                </button>
              ))}
            </div>
          </div>
          <div ref={headRef}>
            {lanes.map((l) => (
              <TrackHeader key={l.track.id} lane={l} />
            ))}
          </div>
        </div>

        {/* lanes */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-auto scroll-thin"
          onScroll={(e) => {
            const el = e.currentTarget;
            setView({ left: el.scrollLeft, width: el.clientWidth });
            if (headRef.current) headRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("application/x-lumiere-asset");
            const asset = st().assets.find((a) => a.id === id);
            if (!asset) return;
            const lane = laneAt(e.clientY);
            st().addAssetClip(asset, { trackId: lane?.track.id, at: snap(timeAt(e.clientX), snapCandidates("")) });
          }}
        >
          <div className="relative" style={{ width: totalW, height: top + lanesH + 20 }}>
            {/* ruler */}
            <div className="sticky top-0 z-20 cursor-text border-b border-line bg-ink-2/95 backdrop-blur" style={{ height: RULER }} onPointerDown={scrub}>
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * zoom }}>
                  <div className="h-2.5 w-px bg-gold/40" />
                  <span className="tc absolute left-1 top-2.5 text-[9.5px] text-smoke">{label(t, step)}</span>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="absolute top-0 h-1.5 w-px bg-white/10" style={{ left: (step * zoom * i) / 5 }} />
                  ))}
                </div>
              ))}
              {timeline.markers.map((m) =>
                m.label === "♪" ? (
                  <div key={m.id} className="absolute bottom-0 h-1.5 w-px bg-gold/70" style={{ left: m.time * zoom }} />
                ) : (
                  <button
                    key={m.id}
                    title={`${m.label} — click to jump, ⌥-click to delete`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.altKey) st().commit((tl) => (tl.markers = tl.markers.filter((x) => x.id !== m.id)));
                      else st().setPlayhead(m.time);
                    }}
                    className="absolute bottom-0 -translate-x-1/2"
                    style={{ left: m.time * zoom }}
                  >
                    <span className="block h-3 w-2.5 [clip-path:polygon(0_0,100%_0,100%_70%,50%_100%,0_70%)]" style={{ background: m.color }} />
                  </button>
                ),
              )}
            </div>
            {capH > 0 && (
              <div className="sticky z-10 border-b border-line bg-ink-3/90" style={{ top: RULER, height: capH }}>
                {timeline.captions.map((c) => (
                  <div key={c.id} className="absolute top-[2px] h-[13px] overflow-hidden truncate rounded-sm bg-azure/25 px-1 text-[8.5px] leading-[13px] text-ivory/80" style={{ left: c.start * zoom, width: Math.max(2, (c.end - c.start) * zoom) }} title={c.text}>
                    {c.text}
                  </div>
                ))}
              </div>
            )}
            {/* lanes */}
            <div className="absolute left-0 right-0" style={{ top }} onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                st().select([]);
                scrub(e);
              }
            }}>
              {lanes.map((l) => (
                <div key={l.track.id} className={cn("absolute left-0 right-0 border-b border-line/60", l.track.kind === "audio" ? "bg-[rgba(99,195,148,0.015)]" : l.track.kind === "text" ? "bg-[rgba(216,181,122,0.015)]" : "")} style={{ top: l.y, height: l.h }} onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    st().select([]);
                    scrub(e);
                  }
                }} />
              ))}
              {timeline.clips.map((c) => {
                const lane = lanes.find((l) => l.track.id === c.trackId);
                if (!lane) return null;
                const x = c.start * zoom, w = c.duration * zoom;
                if (x > view.left + view.width + 400 || x + w < view.left - 400) return null;
                return (
                  <ClipView
                    key={c.id}
                    clip={c}
                    lane={lane}
                    zoom={zoom}
                    selected={selection.includes(c.id)}
                    asset={c.assetId ? assetMap.get(c.assetId) : undefined}
                    blade={tool === "blade"}
                    onDown={startDrag}
                  />
                );
              })}
            </div>
            <Playhead scrollRef={scrollRef} height={top + lanesH} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ children, active, onClick, title, disabled }: { children: React.ReactNode; active?: boolean; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={cn("flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 transition disabled:opacity-30", active ? "bg-gold/15 text-gold-hi" : "text-mist hover:bg-white/5 hover:text-ivory")}>
      {children}
    </button>
  );
}

function TrackHeader({ lane }: { lane: Lane }) {
  const t = lane.track;
  const toggle = (k: "muted" | "solo" | "locked" | "hidden") =>
    useEditor.getState().commit((tl) => {
      const tr = tl.tracks.find((x) => x.id === t.id);
      if (tr) tr[k] = !tr[k];
    });
  return (
    <div className="flex items-center justify-between gap-1 border-b border-line/60 px-2" style={{ height: lane.h }}>
      <div className="min-w-0">
        <div className={cn("truncate text-[11px] font-semibold", t.kind === "audio" ? "text-jade/90" : t.kind === "text" ? "text-gold" : "text-ivory/90")}>{t.name}</div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-smoke">{t.kind}</div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 text-smoke">
        {t.kind !== "audio" && (
          <button onClick={() => toggle("hidden")} className="rounded p-1 hover:text-ivory" title="Show / hide">{t.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>
        )}
        {t.kind !== "text" && (
          <>
            <button onClick={() => toggle("muted")} className={cn("rounded p-1", t.muted ? "text-ruby" : "hover:text-ivory")} title="Mute">{t.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
            <button onClick={() => toggle("solo")} className={cn("rounded px-1 text-[9px] font-black", t.solo ? "bg-gold text-ink" : "hover:text-ivory")} title="Solo">S</button>
          </>
        )}
        <button onClick={() => toggle("locked")} className={cn("rounded p-1", t.locked ? "text-gold" : "hover:text-ivory")} title="Lock">{t.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
      </div>
    </div>
  );
}

const ClipView = memo(function ClipView({ clip: c, lane, zoom, selected, asset, blade, onDown }: { clip: Clip; lane: Lane; zoom: number; selected: boolean; asset?: AssetMeta; blade: boolean; onDown: (e: RPointerEvent, c: Clip, mode: "move" | "trim-l" | "trim-r") => void }) {
  const w = Math.max(3, c.duration * zoom);
  const h = lane.h - 6;
  const look = getLook(c.grade.look);
  const assetDur = asset?.durationSec || 1;
  const kindStyle =
    c.kind === "audio" ? "bg-[#0f2a1f] border-jade/30" : c.kind === "title" ? "bg-gradient-to-r from-[#3a2c14] to-[#1f180d] border-gold/40" : c.kind === "solid" ? "border-white/10" : "bg-[#141a24] border-azure/25";
  const tiles: { x: number; src: string }[] = [];
  if ((c.kind === "video" || c.kind === "image") && asset?.filmstrip.length) {
    const tw = Math.max(28, (h - 14) * (16 / 9));
    const n = Math.min(48, Math.ceil(w / tw));
    for (let i = 0; i < n; i++) {
      const src = c.sourceIn + ((i * tw) / zoom) * c.speed;
      const idx = c.kind === "image" ? 0 : clamp(Math.floor((src / assetDur) * asset.filmstrip.length), 0, asset.filmstrip.length - 1);
      tiles.push({ x: i * tw, src: asset.filmstrip[idx] });
    }
  }
  let wave = "";
  if (asset?.peaks.length && (c.kind === "audio" || c.kind === "video")) {
    const bars = Math.min(900, Math.floor(w / 2));
    const wh = c.kind === "audio" ? h - 14 : 14;
    const mid = c.kind === "audio" ? 14 + wh / 2 : h - 8;
    for (let i = 0; i < bars; i++) {
      const src = c.sourceIn + ((i * 2) / zoom) * c.speed;
      const p = asset.peaks[clamp(Math.floor((src / assetDur) * asset.peaks.length), 0, asset.peaks.length - 1)] ?? 0;
      const a = Math.max(0.5, p * wh * 0.48 * Math.min(2, c.volume));
      wave += `M${i * 2} ${mid - a}V${mid + a}`;
    }
  }
  return (
    <div
      className={cn("group absolute overflow-hidden rounded-md border", kindStyle, selected && "!border-gold-hi ring-1 ring-gold/70 shadow-[0_0_18px_-4px_rgba(216,181,122,0.7)]", c.muted && "opacity-50", blade ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")}
      style={{ left: c.start * zoom, width: w, top: lane.y + 3, height: h, background: c.kind === "solid" ? c.color : undefined }}
      onPointerDown={(e) => onDown(e, c, "move")}
    >
      {tiles.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 opacity-80" style={{ height: c.kind === "video" && wave ? h - 16 : h }}>
          {tiles.map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={t.src} alt="" draggable={false} className="absolute top-0 h-full object-cover" style={{ left: t.x, width: Math.max(28, (h - 14) * (16 / 9)) }} />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/30" />
        </div>
      )}
      {wave && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h}>
          <path d={wave} stroke={c.kind === "audio" ? "rgba(99,195,148,0.75)" : "rgba(111,168,220,0.7)"} strokeWidth={1.2} />
        </svg>
      )}
      {c.kind === "title" && (
        <div className="pointer-events-none absolute inset-0 flex items-center gap-1.5 px-2 pt-2">
          <Type size={11} className="shrink-0 text-gold" />
          <span className="truncate font-display text-[13px] italic text-gold-hi">{c.title?.text}</span>
        </div>
      )}
      {c.transitionIn && (
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 bg-[repeating-linear-gradient(135deg,rgba(243,223,177,0.35)_0_3px,transparent_3px_7px)]" style={{ width: Math.min(w, c.transitionIn.duration * zoom) }} title={c.transitionIn.type} />
      )}
      {(c.fadeIn > 0 || c.fadeOut > 0) && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h}>
          {c.fadeIn > 0 && <line x1={0} y1={h} x2={Math.min(w, c.fadeIn * zoom)} y2={0} stroke="rgba(243,223,177,0.6)" strokeWidth={1} />}
          {c.fadeOut > 0 && <line x1={w - Math.min(w, c.fadeOut * zoom)} y1={0} x2={w} y2={h} stroke="rgba(243,223,177,0.6)" strokeWidth={1} />}
        </svg>
      )}
      {c.kind !== "title" && (
        <div className="pointer-events-none absolute left-1 top-0.5 flex max-w-full items-center gap-1 pr-2">
          <span className="truncate text-[10px] font-semibold text-ivory drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{c.name}</span>
          {c.speed !== 1 && <span className="shrink-0 rounded bg-black/60 px-1 font-mono text-[8.5px] text-gold">{Math.round(c.speed * 100)}%</span>}
          {look && <span className="shrink-0 rounded bg-black/60 px-1 text-[8.5px] text-gold" title={look.name}>◆ {look.name.split(" ")[0]}</span>}
          {c.reframe && <span className="shrink-0 rounded bg-black/60 px-1 text-[8.5px] text-azure">⌖</span>}
        </div>
      )}
      {!blade && (
        <>
          <div className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize bg-gold/0 transition group-hover:bg-gold/40" onPointerDown={(e) => onDown(e, c, "trim-l")} />
          <div className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize bg-gold/0 transition group-hover:bg-gold/40" onPointerDown={(e) => onDown(e, c, "trim-r")} />
        </>
      )}
    </div>
  );
});

function Playhead({ scrollRef, height }: { scrollRef: React.RefObject<HTMLDivElement | null>; height: number }) {
  const playhead = useEditor((s) => s.playhead);
  const zoom = useEditor((s) => s.zoom);
  const playing = useEditor((s) => s.playing);
  const x = playhead * zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 120);
  }, [x, playing, scrollRef]);
  return (
    <div className="pointer-events-none absolute top-0 z-30" style={{ left: x, height }}>
      <div className="absolute -left-[6px] top-0 h-3 w-3 rotate-45 border border-gold-hi bg-gold shadow-[0_0_12px_rgba(216,181,122,0.9)]" />
      <div className="absolute left-0 top-2 h-full w-px bg-gold-hi shadow-[0_0_8px_rgba(243,223,177,0.8)]" />
    </div>
  );
}
