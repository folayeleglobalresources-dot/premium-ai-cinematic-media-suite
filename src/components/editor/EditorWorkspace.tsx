"use client";

import { ChevronFirst, ChevronLast, Pause, Play, Redo2, Repeat, Rewind, FastForward, Send, Undo2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Compositor } from "@/lib/editor/compositor";
import { useEditor } from "@/lib/editor/store";
import { timelineDuration, type AssetMeta, type ProjectDoc } from "@/lib/types";
import { cn, timecode } from "@/lib/utils";
import { Segmented, toast } from "../ui";
import { AIDirector } from "./AIDirector";
import { Inspector } from "./Inspector";
import { MediaBin } from "./MediaBin";
import { Timeline } from "./Timeline";

function useFit(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      let w = r.width, h = r.width / aspect;
      if (h > r.height) {
        h = r.height;
        w = h * aspect;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return { ref, box };
}

function makePoster(canvas: HTMLCanvasElement): string | undefined {
  if (!canvas.width) return undefined;
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = Math.round((480 * canvas.height) / canvas.width);
  c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

function Timecode() {
  const playhead = useEditor((s) => s.playhead);
  const fps = useEditor((s) => s.settings.fps);
  const total = useEditor((s) => timelineDuration(s.timeline));
  return (
    <div className="tc flex items-baseline gap-2">
      <span className="text-[19px] text-gold-hi">{timecode(playhead, fps)}</span>
      <span className="text-[11px] text-smoke">/ {timecode(total, fps)}</span>
    </div>
  );
}

export function EditorWorkspace({ doc, assets }: { doc: ProjectDoc; assets: AssetMeta[] }) {
  const loaded = useRef<string | null>(null);
  if (loaded.current !== doc.id) {
    useEditor.getState().load(doc, assets);
    loaded.current = doc.id;
  }
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compRef = useRef<Compositor | null>(null);
  const [comp, setComp] = useState<Compositor | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("director") === "1") setAiOpen(true);
  }, []);
  const [save, setSave] = useState<{ state: "saved" | "saving" | "dirty" | "error"; at: Date | null }>({ state: "saved", at: null });
  const name = useEditor((s) => s.name);
  const settings = useEditor((s) => s.settings);
  const playing = useEditor((s) => s.playing);
  const loop = useEditor((s) => s.loop);
  const quality = useEditor((s) => s.quality);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const busy = useEditor((s) => s.busy);
  const { ref: viewerRef, box } = useFit(settings.width / settings.height);

  // compositor + playback clock
  useEffect(() => {
    const c = new Compositor(canvasRef.current!);
    compRef.current = c;
    setComp(c);
    const s0 = useEditor.getState();
    c.setProject(s0.timeline, s0.settings, s0.assets);
    const unsub = useEditor.subscribe((s, p) => {
      if (s.timeline !== p.timeline || s.settings !== p.settings || s.assets !== p.assets) c.setProject(s.timeline, s.settings, s.assets);
    });
    let raf = 0, last = performance.now(), frame = 0;
    const loopFn = (now: number) => {
      raf = requestAnimationFrame(loopFn);
      const dt = (now - last) / 1000;
      last = now;
      if (c.exporting) return;
      const st = useEditor.getState();
      let t = st.playhead;
      if (st.playing) {
        t += dt;
        const end = timelineDuration(st.timeline);
        if (t >= end) {
          if (st.loop && end > 0) t = 0;
          else {
            t = end;
            useEditor.setState({ playing: false });
            c.pauseAll();
          }
        }
        useEditor.setState({ playhead: t });
      } else if (frame++ % 2) return;
      c.quality = st.quality;
      c.sync(t, st.playing);
      c.render(t);
    };
    raf = requestAnimationFrame(loopFn);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      c.destroy();
    };
  }, []);

  useEffect(() => {
    if (!playing) compRef.current?.pauseAll();
  }, [playing]);

  // autosave
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = async () => {
      timer = null;
      const s = useEditor.getState();
      setSave((v) => ({ ...v, state: "saving" }));
      try {
        const dur = timelineDuration(s.timeline);
        const body = JSON.stringify({
          name: s.name,
          timeline: s.timeline,
          width: s.settings.width,
          height: s.settings.height,
          fps: s.settings.fps,
          aspect: s.settings.aspect,
          durationSec: dur,
          poster: dur > 0 && canvasRef.current ? makePoster(canvasRef.current) : undefined,
        });
        const res = await fetch(`/api/projects/${s.projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          keepalive: body.length < 60_000,
          body,
        });
        if (!res.ok) throw new Error();
        useEditor.setState({ dirty: false });
        setSave({ state: "saved", at: new Date() });
      } catch {
        setSave((v) => ({ ...v, state: "error" }));
      }
    };
    const unsub = useEditor.subscribe((s, p) => {
      if (s.rev !== p.rev) {
        setSave((v) => ({ ...v, state: "dirty" }));
        if (timer) clearTimeout(timer);
        timer = setTimeout(persist, 1200);
      }
    });
    const before = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", before);
      if (timer) {
        clearTimeout(timer);
        void persist();
      }
    };
  }, []);

  // ?add=<assetId> handoff from Capture / Vault
  useEffect(() => {
    const url = new URL(window.location.href);
    const add = url.searchParams.get("add");
    if (!add) return;
    const asset = useEditor.getState().assets.find((a) => a.id === add);
    if (asset) {
      useEditor.getState().addAssetClip(asset, { at: 0 });
      toast(`“${asset.name}” placed on the timeline`, "success");
    }
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.toString());
  }, []);

  // toasts from store
  useEffect(
    () =>
      useEditor.subscribe((s, p) => {
        if (s.toast && s.toast !== p.toast) toast(s.toast.text, s.toast.tone);
      }),
    [],
  );

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const st = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const frame = 1 / st.settings.fps;
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && k === "d") {
        e.preventDefault();
        st.duplicateSelection();
      } else if (mod && k === "j") {
        e.preventDefault();
        setAiOpen((o) => !o);
      } else if (mod && k === "e") {
        e.preventDefault();
        st.set("inspector", "deliver");
      } else if (mod && k === "k") {
        return;
      } else if (e.code === "Space" || k === "k") {
        e.preventDefault();
        if (!st.playing) compRef.current?.resumeAudio();
        if (k === "k") st.setPlaying(false);
        else st.setPlaying(!st.playing);
      } else if (k === "l") {
        compRef.current?.resumeAudio();
        st.setPlaying(true);
      } else if (k === "j") {
        st.setPlaying(false);
        st.setPlayhead(st.playhead - 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        st.setPlayhead(st.playhead - (e.shiftKey ? 1 : frame));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        st.setPlayhead(st.playhead + (e.shiftKey ? 1 : frame));
      } else if (e.key === "Home") st.setPlayhead(0);
      else if (e.key === "End") st.setPlayhead(timelineDuration(st.timeline));
      else if (k === "s") st.splitAtPlayhead();
      else if (k === "b" || k === "c") st.set("tool", st.tool === "blade" ? "select" : "blade");
      else if (k === "v" || k === "a") st.set("tool", "select");
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        st.deleteSelection(e.shiftKey);
      } else if (k === "m") st.commit((tl) => tl.markers.push({ id: crypto.randomUUID(), time: st.playhead, label: `Marker ${tl.markers.length + 1}`, color: "#E8C27A" }));
      else if (k === "t") st.addTitle("cinematic");
      else if (k === "=" || k === "+") st.setZoom(st.zoom * 1.25);
      else if (k === "-") st.setZoom(st.zoom / 1.25);
      else if (e.key === "Escape") st.select([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const st = useEditor.getState;
  const togglePlay = () => {
    compRef.current?.resumeAudio();
    st().setPlaying(!st().playing);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display text-sm italic text-gold/60">IV</span>
          <input value={name} onChange={(e) => st().rename(e.target.value)} className="min-w-0 max-w-[340px] bg-transparent font-display text-[22px] text-ivory outline-none focus:text-gold-hi" />
          <span className="chip hidden md:inline-flex">{settings.width}×{settings.height} · {settings.aspect} · {settings.fps}p</span>
          <span className={cn("text-[10.5px] uppercase tracking-[0.2em]", save.state === "error" ? "text-ruby" : save.state === "saved" ? "text-smoke" : "text-gold")}>
            {save.state === "saving" ? "Saving…" : save.state === "dirty" ? "Edited" : save.state === "error" ? "Save failed" : save.at ? `Saved ${save.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {busy && <span className="gold-shimmer mr-2 text-[11.5px] font-semibold">{busy}</span>}
          <button onClick={() => st().undo()} disabled={!canUndo} className="rounded-full p-2 text-mist transition hover:text-gold disabled:opacity-30" title="Undo (⌘Z)"><Undo2 size={15} /></button>
          <button onClick={() => st().redo()} disabled={!canRedo} className="rounded-full p-2 text-mist transition hover:text-gold disabled:opacity-30" title="Redo (⇧⌘Z)"><Redo2 size={15} /></button>
          <button onClick={() => setAiOpen((o) => !o)} className={cn("btn px-4 py-1.5", aiOpen ? "btn-gold" : "btn-ghost")} title="AI Director (⌘J)">
            <Wand2 size={14} /> AI Director
          </button>
          <button onClick={() => st().set("inspector", "deliver")} className="btn btn-ghost px-4 py-1.5" title="Deliver (⌘E)">
            <Send size={13} /> Deliver
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <MediaBin />
        <section className="flex min-w-0 flex-1 flex-col">
          <div
            ref={viewerRef}
            className="relative min-h-0 flex-1 m-3 flex items-center justify-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("application/x-lumiere-asset");
              const asset = st().assets.find((a) => a.id === id);
              if (asset) st().addAssetClip(asset, { at: st().playhead });
            }}
          >
            <div className="relative overflow-hidden rounded-md bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] ring-1 ring-line" style={{ width: box.w, height: box.h }}>
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" onClick={togglePlay} />
            </div>
          </div>
          <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-t border-line px-4">
            <Timecode />
            <div className="flex items-center gap-1">
              <button onClick={() => st().setPlayhead(0)} className="rounded-full p-2 text-mist hover:text-gold" title="Start (Home)"><ChevronFirst size={16} /></button>
              <button onClick={() => st().setPlayhead(st().playhead - 1)} className="rounded-full p-2 text-mist hover:text-gold" title="Back 1s (J)"><Rewind size={15} /></button>
              <button onClick={togglePlay} className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-gold-hi to-gold text-ink shadow-[0_6px_20px_-6px_rgba(216,181,122,0.7)]" title="Play / Pause (Space)">
                {playing ? <Pause size={15} className="fill-ink" /> : <Play size={15} className="ml-0.5 fill-ink" />}
              </button>
              <button onClick={() => st().setPlayhead(st().playhead + 1)} className="rounded-full p-2 text-mist hover:text-gold" title="Forward 1s"><FastForward size={15} /></button>
              <button onClick={() => st().setPlayhead(timelineDuration(st().timeline))} className="rounded-full p-2 text-mist hover:text-gold" title="End"><ChevronLast size={16} /></button>
              <button onClick={() => st().set("loop", !loop)} className={cn("ml-1 rounded-full p-2", loop ? "text-gold" : "text-smoke hover:text-ivory")} title="Loop"><Repeat size={14} /></button>
            </div>
            <Segmented size="sm" value={quality} onChange={(v) => st().set("quality", v)} options={[{ value: 1, label: "Full" }, { value: 0.5, label: "½" }, { value: 0.25, label: "¼" }]} />
          </div>
        </section>
        <div className="relative flex">
          <Inspector compositor={comp} />
          {aiOpen && <AIDirector onClose={() => setAiOpen(false)} />}
        </div>
      </div>

      <Timeline />
    </div>
  );
}
