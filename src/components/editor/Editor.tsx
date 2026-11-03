"use client";

import { AnalysisPanel } from "@/components/ai/AnalysisPanel";
import { Kbd, LookStrip, Section, Slider, Spinner, Toggle } from "@/components/ui/Controls";
import { Scopes } from "@/components/ui/Scopes";
import { computeStats, matchGrade, type FrameStats } from "@/lib/analysis";
import { assetFileUrl, assetThumbUrl, codecOptions, downloadBlob, fetchJSON, finalizeRecording, formatBytes, formatDuration, formatTimecode, pickCodec, probeAudio, probeImage, probeVideo, stamp, thumbFromSource, thumbFromVideoUrl, uploadAsset } from "@/lib/api";
import { MOODS, planAutoEdit, type AutoEditMood, type AutoEditSource } from "@/lib/autoedit";
import { EditorEngine, sampleEnergy } from "@/lib/editor-engine";
import { useLooks } from "@/lib/hooks";
import { DEFAULT_GRADE, GRADE_CONTROLS, newClipId, timelineDuration, type AssetDTO, type Clip, type Grade, type TimelineData, type TransitionType } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "./Timeline";

type Tab = "clip" | "color" | "title" | "master" | "director" | "auto";
type ProjectDTO = { id: number; name: string; fps: number; width: number; height: number };

function makeClip(asset: AssetDTO, start: number): Clip {
  const kind = asset.kind;
  const src = asset.durationMs / 1000;
  return {
    id: newClipId(),
    assetId: asset.id,
    kind,
    name: asset.name,
    track: kind === "audio" ? 2 : 0,
    start,
    inPoint: 0,
    duration: kind === "image" ? 4 : src > 0 ? src : 5,
    sourceDuration: src,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    opacity: 1,
    transitionIn: { type: "none", duration: 0 },
    grade: { ...DEFAULT_GRADE },
    lookId: null,
    motion: "none",
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    width: asset.width,
    height: asset.height,
  };
}

function makeTitle(start: number): Clip {
  return {
    id: newClipId(),
    assetId: null,
    kind: "title",
    name: "Title",
    track: 1,
    start,
    inPoint: 0,
    duration: 4,
    sourceDuration: 0,
    speed: 1,
    volume: 0,
    muted: true,
    fadeIn: 0,
    fadeOut: 0,
    opacity: 1,
    transitionIn: { type: "none", duration: 0 },
    grade: { ...DEFAULT_GRADE },
    lookId: null,
    motion: "none",
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    title: { text: "Your Title", subtitle: "", font: "serif", size: 6, color: "#f3e7c9", align: "center", position: "center", animation: "tracking", background: "none" },
  };
}

export function Editor({ timelineId }: { timelineId: number }) {
  const { looks, custom, resolve, lutFor } = useLooks();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditorEngine | null>(null);
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [tl, setTl] = useState<TimelineData | null>(null);
  const tlRef = useRef<TimelineData | null>(null);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [snap, setSnap] = useState(true);
  const [tab, setTab] = useState<Tab>("clip");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopesOn, setScopesOn] = useState(false);
  const [scopeData, setScopeData] = useState<Uint8ClampedArray | null>(null);
  const [binFilter, setBinFilter] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; href?: string }[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCfg, setExportCfg] = useState({ res: "project", codec: "auto", bitrate: 25, name: "" });
  const [exporting, setExporting] = useState<{ progress: number; label: string } | null>(null);
  const exportRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; start: number } | null>(null);
  const [refStats, setRefStats] = useState<FrameStats | null>(null);
  const [autoSel, setAutoSel] = useState<number[]>([]);
  const [autoMood, setAutoMood] = useState<AutoEditMood>("cinematic");
  const [autoDur, setAutoDur] = useState(60);
  const [autoTitle, setAutoTitle] = useState("");
  const [autoBusy, setAutoBusy] = useState<string | null>(null);
  const undoRef = useRef<TimelineData[]>([]);
  const redoRef = useRef<TimelineData[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewBaseRef = useRef<TimelineData | null>(null);
  const lastUiFrame = useRef(0);

  const toast = useCallback((text: string, href?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, href }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("grain");
    return () => document.body.classList.add("grain");
  }, []);

  /* ------------------------------- load -------------------------------- */
  useEffect(() => {
    let alive = true;
    Promise.all([fetchJSON<{ timeline: { data: TimelineData; name: string }; project: ProjectDTO | null }>(`/api/timelines/${timelineId}`), fetchJSON<AssetDTO[]>("/api/assets")])
      .then(([t, a]) => {
        if (!alive) return;
        const data = t.timeline.data && (t.timeline.data as TimelineData).version ? (t.timeline.data as TimelineData) : null;
        const base: TimelineData = data ?? { version: 1, fps: t.project?.fps ?? 24, width: t.project?.width ?? 1920, height: t.project?.height ?? 1080, clips: [], masterVolume: 1, masterGrade: { ...DEFAULT_GRADE }, masterLookId: null, letterbox: "none" };
        if (!base.masterGrade) base.masterGrade = { ...DEFAULT_GRADE };
        setTl(base);
        tlRef.current = base;
        setProject(t.project);
        setAssets(a.filter((x) => x.status === "ready"));
        setExportCfg((c) => ({ ...c, name: t.project?.name ?? "Export" }));
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [timelineId]);

  /* ------------------------------ engine ------------------------------- */
  useEffect(() => {
    if (!tl || !canvasRef.current || engineRef.current) return;
    const eng = new EditorEngine(canvasRef.current, tl, assetFileUrl);
    eng.onFrame = (t) => {
      const now = performance.now();
      if (now - lastUiFrame.current < 40 && eng.playing) return;
      lastUiFrame.current = now;
      setPlayhead(t);
    };
    eng.onEnd = () => setPlaying(false);
    eng.setLutLoader(lutFor);
    eng.looks = looks;
    eng.setTimeline(tl);
    engineRef.current = eng;
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl !== null]);

  useEffect(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.looks = looks;
      eng.dirty = true;
    }
  }, [looks]);

  useEffect(() => {
    if (tl && engineRef.current) engineRef.current.setTimeline(tl);
  }, [tl]);

  useEffect(() => {
    if (!scopesOn) return;
    const id = setInterval(() => {
      const eng = engineRef.current;
      if (!eng) return;
      const d = eng.sampleComposite(192, 108);
      if (d) setScopeData(d);
    }, 200);
    return () => clearInterval(id);
  }, [scopesOn]);

  /* ----------------------------- persistence ---------------------------- */
  const commit = useCallback(
    (next: TimelineData, pushUndo = true) => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = null;
      const base = previewBaseRef.current ?? tlRef.current;
      previewBaseRef.current = null;
      if (pushUndo && base && base !== next) {
        undoRef.current = [...undoRef.current.slice(-60), base];
        redoRef.current = [];
      }
      tlRef.current = next;
      setTl(next);
      setSaveState("dirty");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          await fetchJSON(`/api/timelines/${timelineId}`, { method: "PATCH", body: JSON.stringify({ data: next, durationMs: Math.round(timelineDuration(next) * 1000) }) });
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 1200);
    },
    [timelineId],
  );

  const preview = useCallback(
    (next: TimelineData) => {
      if (!previewBaseRef.current) previewBaseRef.current = tlRef.current;
      tlRef.current = next;
      setTl(next);
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => {
        if (tlRef.current) commit(tlRef.current);
      }, 900);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev || !tlRef.current) return;
    redoRef.current.push(tlRef.current);
    commit(prev, false);
  }, [commit]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next || !tlRef.current) return;
    undoRef.current.push(tlRef.current);
    commit(next, false);
  }, [commit]);

  /* ------------------------------ editing ------------------------------- */
  const selected = useMemo(() => tl?.clips.find((c) => c.id === selectedId) ?? null, [tl, selectedId]);

  const updateClip = useCallback(
    (id: string, patch: Partial<Clip>, pushUndo = true) => {
      const cur = tlRef.current;
      if (!cur) return;
      const next = { ...cur, clips: cur.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      if (pushUndo) commit(next);
      else preview(next);
    },
    [commit, preview],
  );

  const addAsset = useCallback(
    (asset: AssetDTO, atPlayhead = false) => {
      const cur = tlRef.current;
      if (!cur) return;
      const track = asset.kind === "audio" ? 2 : 0;
      const end = cur.clips.filter((c) => c.track === track).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
      const clip = makeClip(asset, atPlayhead ? playhead : end);
      commit({ ...cur, clips: [...cur.clips, clip] });
      setSelectedId(clip.id);
      setTab("clip");
    },
    [commit, playhead],
  );

  const addTitle = useCallback(() => {
    const cur = tlRef.current;
    if (!cur) return;
    const clip = makeTitle(playhead);
    commit({ ...cur, clips: [...cur.clips, clip] });
    setSelectedId(clip.id);
    setTab("title");
  }, [commit, playhead]);

  const splitAtPlayhead = useCallback(() => {
    const cur = tlRef.current;
    if (!cur) return;
    const targets = cur.clips.filter((c) => (selectedId ? c.id === selectedId : c.track === 0) && playhead > c.start + 0.05 && playhead < c.start + c.duration - 0.05);
    if (!targets.length) return;
    let clips = cur.clips;
    for (const c of targets) {
      const t = playhead - c.start;
      const a: Clip = { ...c, duration: t, fadeOut: 0 };
      const b: Clip = { ...c, id: newClipId(), start: playhead, inPoint: c.inPoint + t * c.speed, duration: c.duration - t, transitionIn: { type: "none", duration: 0 }, fadeIn: 0 };
      clips = clips.flatMap((x) => (x.id === c.id ? [a, b] : [x]));
    }
    commit({ ...cur, clips });
  }, [commit, playhead, selectedId]);

  const deleteSelected = useCallback(
    (ripple = false) => {
      const cur = tlRef.current;
      if (!cur || !selectedId) return;
      const c = cur.clips.find((x) => x.id === selectedId);
      if (!c) return;
      let clips = cur.clips.filter((x) => x.id !== selectedId);
      if (ripple) clips = clips.map((x) => (x.track === c.track && x.start >= c.start + c.duration - 1e-6 ? { ...x, start: Math.max(0, x.start - c.duration) } : x));
      commit({ ...cur, clips });
      setSelectedId(null);
    },
    [commit, selectedId],
  );

  const duplicateSelected = useCallback(() => {
    const cur = tlRef.current;
    if (!cur || !selectedId) return;
    const c = cur.clips.find((x) => x.id === selectedId);
    if (!c) return;
    const d: Clip = { ...c, id: newClipId(), start: c.start + c.duration };
    commit({ ...cur, clips: [...cur.clips, d] });
    setSelectedId(d.id);
  }, [commit, selectedId]);

  /* ------------------------------ transport ----------------------------- */
  const togglePlay = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.playing) {
      eng.pause();
      setPlaying(false);
    } else {
      eng.play();
      setPlaying(true);
    }
  }, []);
  const seek = useCallback((t: number) => {
    engineRef.current?.seek(t);
    setPlayhead(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const fps = tlRef.current?.fps ?? 24;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "s" || e.key === "S") splitAtPlayhead();
      else if (e.key === "Delete" || e.key === "Backspace") deleteSelected(e.shiftKey);
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "ArrowLeft") seek(Math.max(0, (engineRef.current?.time ?? 0) - (e.shiftKey ? 1 : 1 / fps)));
      else if (e.key === "ArrowRight") seek((engineRef.current?.time ?? 0) + (e.shiftKey ? 1 : 1 / fps));
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(timelineDuration(tlRef.current!));
      else if (e.key === "t" || e.key === "T") addTitle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, splitAtPlayhead, deleteSelected, undo, redo, duplicateSelected, seek, addTitle]);

  /* ------------------------------- import ------------------------------- */
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
        } else {
          durationMs = (await probeAudio(url)).durationMs;
        }
        URL.revokeObjectURL(url);
        const asset = await uploadAsset({ blob: file, name: file.name.replace(/\.[^.]+$/, ""), kind, mime: file.type || "application/octet-stream", durationMs, width, height, source: "import", thumbDataUrl: thumb, projectId: project?.id ?? null });
        setAssets((a) => [asset, ...a]);
        toast(`Imported ${file.name}`);
      } catch (e) {
        toast(`Import failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    setImporting(null);
  };

  /* ------------------------------- export ------------------------------- */
  const startExport = async () => {
    const eng = engineRef.current;
    const cur = tlRef.current;
    if (!eng || !cur) return;
    const codec = pickCodec(exportCfg.codec);
    if (!codec) {
      toast("No supported encoder in this browser");
      return;
    }
    const dims = exportCfg.res === "720p" ? [1280, 720] : exportCfg.res === "1080p" ? [1920, 1080] : exportCfg.res === "4k" ? [3840, 2160] : [cur.width, cur.height];
    const dur = timelineDuration(cur);
    if (dur <= 0) {
      toast("Timeline is empty");
      return;
    }
    eng.pause();
    setPlaying(false);
    eng.resumeAudio();
    eng.setMonitorMuted(true);
    eng.setOutputSize(dims[0], dims[1]);
    eng.seek(0);
    await new Promise((r) => setTimeout(r, 400));
    const stream = eng.display.captureStream(cur.fps);
    for (const t of eng.audioTracks()) stream.addTrack(t);
    const rec = new MediaRecorder(stream, { mimeType: codec.mime, videoBitsPerSecond: exportCfg.bitrate * 1_000_000, audioBitsPerSecond: 320_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const start = performance.now();
    exportRef.current = { rec, chunks, start };
    setExporting({ progress: 0, label: "Mastering in real time…" });
    const done = async () => {
      const elapsed = Math.round(performance.now() - start);
      const raw = new Blob(chunks, { type: codec.mime.split(";")[0] });
      const blob = await finalizeRecording(raw, elapsed, codec.mime);
      const name = `${(exportCfg.name || "Export").replace(/[^\w\- ]+/g, "")}_${dims[1]}p_${stamp()}`;
      const thumb = thumbFromSource(eng.display, eng.display.width, eng.display.height);
      eng.setOutputSize(cur.width, cur.height);
      eng.setMonitorMuted(false);
      eng.seek(0);
      setExporting({ progress: 1, label: "Saving to the Vault…" });
      try {
        const asset = await uploadAsset({ blob, name, kind: "video", mime: codec.mime.split(";")[0], durationMs: Math.round(dur * 1000), width: dims[0], height: dims[1], fps: cur.fps, lookId: cur.masterLookId, source: "export", projectId: project?.id ?? null, thumbDataUrl: thumb, metadata: { codec: codec.label, bitrateMbps: exportCfg.bitrate, timelineId } });
        setAssets((a) => [asset, ...a]);
        toast(`Master exported · ${formatBytes(blob.size)}`, "/library");
      } catch {
        toast("Saved locally (upload failed)");
      }
      downloadBlob(blob, `${name}.${codec.ext}`);
      setExporting(null);
      setExportOpen(false);
      exportRef.current = null;
    };
    rec.onstop = () => {
      done();
    };
    const prevEnd = eng.onEnd;
    eng.onEnd = () => {
      setPlaying(false);
      setTimeout(() => {
        if (rec.state !== "inactive") rec.stop();
      }, 250);
      eng.onEnd = prevEnd;
    };
    const prevFrame = eng.onFrame;
    eng.onFrame = (t) => {
      setPlayhead(t);
      setExporting((x) => (x ? { ...x, progress: Math.min(0.99, t / dur) } : x));
    };
    rec.start(1000);
    eng.play();
    setPlaying(true);
    const restore = () => {
      eng.onFrame = prevFrame;
    };
    rec.addEventListener("stop", restore, { once: true });
  };

  const cancelExport = () => {
    const ex = exportRef.current;
    const eng = engineRef.current;
    if (ex && ex.rec.state !== "inactive") {
      ex.rec.onstop = null;
      ex.rec.stop();
    }
    exportRef.current = null;
    if (eng && tlRef.current) {
      eng.pause();
      eng.setOutputSize(tlRef.current.width, tlRef.current.height);
      eng.setMonitorMuted(false);
    }
    setPlaying(false);
    setExporting(null);
  };

  /* ------------------------------ auto edit ----------------------------- */
  const runAutoEdit = async () => {
    const cur = tlRef.current;
    if (!cur) return;
    const chosen = assets.filter((a) => autoSel.includes(a.id) && (a.kind === "video" || a.kind === "image"));
    if (!chosen.length) {
      toast("Select at least one clip in the list");
      return;
    }
    setAutoBusy("Reading footage…");
    const sources: AutoEditSource[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const a = chosen[i];
      if (a.kind === "image") {
        sources.push({ assetId: a.id, name: a.name, kind: "image", duration: 4, width: a.width, height: a.height, energy: [0.5] });
        continue;
      }
      setAutoBusy(`Analysing ${a.name} (${i + 1}/${chosen.length})…`);
      const r = await sampleEnergy(assetFileUrl(a.id), 12);
      sources.push({ assetId: a.id, name: a.name, kind: "video", duration: r.duration || a.durationMs / 1000, width: a.width || r.width, height: a.height || r.height, energy: r.energy });
    }
    setAutoBusy("Composing the cut…");
    const next = planAutoEdit(sources, { mood: autoMood, targetDuration: autoDur, title: autoTitle || undefined, subtitle: project?.name, width: cur.width, height: cur.height, fps: cur.fps });
    next.masterGrade = cur.masterGrade;
    commit(next);
    fetchJSON("/api/ai/sessions", { method: "POST", body: JSON.stringify({ kind: "autoedit", title: `${MOODS[autoMood].label} cut · ${project?.name ?? ""}`, input: { mood: autoMood, targetDuration: autoDur, sources: sources.map((s) => ({ assetId: s.assetId, duration: s.duration, peak: Math.max(...s.energy) })) }, output: { clips: next.clips.length, duration: timelineDuration(next) } }) }).catch(() => null);
    setAutoBusy(null);
    seek(0);
    toast(`${MOODS[autoMood].label} assembly: ${next.clips.length} clips, ${formatDuration(timelineDuration(next))}`);
  };

  /* -------------------------------- render ------------------------------ */
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-strong p-8 text-center">
          <div className="eyebrow mb-2">Cutting Room</div>
          <div className="display text-3xl mb-3">Sequence not found</div>
          <Link href="/editor" className="btn">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const filteredAssets = assets.filter((a) => !binFilter || a.name.toLowerCase().includes(binFilter.toLowerCase()) || a.kind.includes(binFilter.toLowerCase()));
  const fps = tl?.fps ?? 24;
  const duration = tl ? timelineDuration(tl) : 0;
  const clipGradeValue = (k: keyof Grade) => (selected ? selected.grade[k] : 0);

  return (
    <div className="h-[100dvh] md:h-screen flex flex-col bg-obsidian overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06] bg-[#0a0a0e]">
        <Link href="/editor" className="text-muted hover:text-ivory text-[10px] tracking-[0.22em] uppercase font-mono">
          ← Projects
        </Link>
        <span className="hairline-v h-5" />
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <span className="display text-[18px] truncate">{project?.name ?? "Sequence"}</span>
          <span className={`readout text-[9px] tracking-[0.2em] uppercase ${saveState === "saved" ? "text-muted" : saveState === "error" ? "text-crimson" : "text-gold"}`}>{saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : "Unsaved"}</span>
        </div>
        <button className="btn btn-xs btn-ghost" onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="btn btn-xs btn-ghost" onClick={redo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button className="btn btn-xs btn-ghost" onClick={() => setScopesOn((s) => !s)}>
          Scopes
        </button>
        <button className="btn btn-xs btn-solid" onClick={() => setExportOpen(true)} disabled={!tl || !tl.clips.length}>
          Master & Export
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Bin */}
        <aside className="hidden lg:flex w-[240px] xl:w-[270px] flex-none border-r border-white/[0.06] flex-col bg-[#0b0b10]">
          <div className="p-3 flex flex-col gap-2 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Bin</span>
              <label className="btn btn-xs cursor-pointer">
                {importing ? <Spinner /> : null} Import
                <input type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => importFiles(e.target.files)} />
              </label>
            </div>
            <input className="field !py-1.5 !text-[11px]" placeholder="Filter footage…" value={binFilter} onChange={(e) => setBinFilter(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {filteredAssets.map((a) => (
              <div key={a.id} className="group flex items-center gap-2 panel p-1.5 hover:border-gold/40 transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetThumbUrl(a.id)} alt="" className="w-16 h-9 object-cover bg-black flex-none" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate">{a.name}</div>
                  <div className="readout text-[9px] text-muted">
                    {a.kind} · {a.kind === "image" ? `${a.width}×${a.height}` : formatDuration(a.durationMs / 1000)}
                  </div>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn btn-xs" title="Append to timeline" onClick={() => addAsset(a)}>
                    +
                  </button>
                  <button className="btn btn-xs btn-ghost" title="Insert at playhead" onClick={() => addAsset(a, true)}>
                    ⤓
                  </button>
                </div>
              </div>
            ))}
            {!filteredAssets.length ? <div className="text-[11px] text-muted p-3 text-center">No footage yet. Import files or record in the Studio.</div> : null}
          </div>
        </aside>

        {/* Monitor + inspector */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
            <div className="flex-1 min-h-[220px] flex flex-col bg-black relative">
              <div className="flex-1 min-h-0 flex items-center justify-center p-3">
                <div className="relative bracket max-h-full max-w-full" style={{ aspectRatio: tl ? `${tl.width}/${tl.height}` : "16/9", width: "100%", maxHeight: "100%" }}>
                  <span className="bracket-b" />
                  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Spinner />
                    </div>
                  ) : null}
                  {tl && !tl.clips.length && !loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-2">
                      <div className="eyebrow">Empty sequence</div>
                      <div className="display text-2xl text-ivory/80">Bring in footage from the bin</div>
                      <div className="text-[11px] text-muted">…or let the Director assemble a cut automatically.</div>
                      <button className="btn btn-sm mt-2" onClick={() => setTab("auto")}>
                        Auto-edit
                      </button>
                    </div>
                  ) : null}
                  {scopesOn && scopeData ? (
                    <div className="absolute left-2 bottom-2 w-[220px] glass-strong p-2">
                      <Scopes data={scopeData} width={192} height={108} compact />
                    </div>
                  ) : null}
                </div>
              </div>
              {/* Transport */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06] bg-[#0a0a0e]">
                <button className="btn btn-xs btn-ghost" onClick={() => seek(0)} title="Home">
                  ⇤
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => seek(Math.max(0, playhead - 1 / fps))} title="←">
                  ‹
                </button>
                <button className="w-10 h-10 rounded-full border border-gold/60 text-gold-bright flex items-center justify-center hover:bg-gold/10" onClick={togglePlay} title="Space">
                  {playing ? "❚❚" : "▶"}
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => seek(playhead + 1 / fps)} title="→">
                  ›
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => seek(duration)} title="End">
                  ⇥
                </button>
                <span className="readout text-[15px] text-ivory ml-2">{formatTimecode(playhead, fps)}</span>
                <span className="readout text-[10px] text-muted">/ {formatTimecode(duration, fps)}</span>
                <div className="flex-1" />
                <button className="btn btn-xs btn-ghost hidden sm:inline-flex" onClick={addTitle} title="T">
                  + Title
                </button>
                <button className="btn btn-xs btn-ghost" onClick={splitAtPlayhead} title="S">
                  Split
                </button>
                <button className="btn btn-xs btn-ghost hidden sm:inline-flex" onClick={duplicateSelected} disabled={!selected}>
                  Dup
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => deleteSelected(false)} disabled={!selected} title="Delete">
                  Delete
                </button>
                <button className="btn btn-xs btn-ghost hidden sm:inline-flex" onClick={() => deleteSelected(true)} disabled={!selected} title="Shift+Delete">
                  Ripple
                </button>
                <button className={`chip ${snap ? "active" : ""}`} onClick={() => setSnap((s) => !s)}>
                  Snap
                </button>
              </div>
            </div>

            {/* Inspector */}
            <aside className="w-full xl:w-[340px] 2xl:w-[380px] flex-none border-t xl:border-t-0 xl:border-l border-white/[0.06] bg-[#0b0b10] flex flex-col max-h-[40vh] xl:max-h-none">
              <div className="flex border-b border-white/[0.06] overflow-x-auto">
                {(["clip", "color", "title", "master", "director", "auto"] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`flex-1 min-w-[56px] py-2.5 text-[9px] tracking-[0.2em] uppercase font-mono relative ${tab === t ? "text-gold-bright" : "text-muted hover:text-ivory"}`}>
                    {t === "auto" ? "Auto-edit" : t}
                    {tab === t ? <span className="absolute bottom-0 left-2 right-2 h-px bg-gold" /> : null}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                {tab === "clip" ? (
                  selected ? (
                    <>
                      <Section title={`${selected.kind} clip`}>
                        <input className="field" value={selected.name} onChange={(e) => updateClip(selected.id, { name: e.target.value }, false)} onBlur={() => commit(tlRef.current!)} />
                        <div className="grid grid-cols-2 gap-2 readout text-[10px] text-muted">
                          <span>In {formatTimecode(selected.start, fps)}</span>
                          <span>Out {formatTimecode(selected.start + selected.duration, fps)}</span>
                          <span>Src in {selected.inPoint.toFixed(2)}s</span>
                          <span>Dur {selected.duration.toFixed(2)}s</span>
                        </div>
                      </Section>
                      {selected.kind !== "title" ? (
                        <Section title="Timing">
                          <Slider label="Speed" value={selected.speed} min={0.25} max={4} step={0.05} onChange={(v) => updateClip(selected.id, { speed: v }, false)} format={(v) => `${v.toFixed(2)}×`} />
                          <div className="flex gap-1.5 flex-wrap">
                            {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
                              <button key={s} className={`chip ${selected.speed === s ? "active" : ""}`} onClick={() => updateClip(selected.id, { speed: s })}>
                                {s}×
                              </button>
                            ))}
                          </div>
                          <Slider label="Fade in" value={selected.fadeIn} min={0} max={5} step={0.05} onChange={(v) => updateClip(selected.id, { fadeIn: v }, false)} unit="s" />
                          <Slider label="Fade out" value={selected.fadeOut} min={0} max={5} step={0.05} onChange={(v) => updateClip(selected.id, { fadeOut: v }, false)} unit="s" />
                        </Section>
                      ) : null}
                      {selected.kind !== "audio" ? (
                        <>
                          <Section title="Transition in">
                            <div className="flex gap-1.5 flex-wrap">
                              {(["none", "dissolve", "dipBlack", "dipWhite", "wipe", "slide"] as TransitionType[]).map((t) => (
                                <button key={t} className={`chip ${selected.transitionIn.type === t ? "active" : ""}`} onClick={() => updateClip(selected.id, { transitionIn: { type: t, duration: t === "none" ? 0 : selected.transitionIn.duration || 0.6 } })}>
                                  {t}
                                </button>
                              ))}
                            </div>
                            {selected.transitionIn.type !== "none" ? <Slider label="Duration" value={selected.transitionIn.duration} min={0.1} max={3} step={0.05} onChange={(v) => updateClip(selected.id, { transitionIn: { ...selected.transitionIn, duration: v } }, false)} unit="s" /> : null}
                            <p className="text-[10px] text-muted">Overlap the clip with the previous one on the same track to cross-fade.</p>
                          </Section>
                          <Section title="Motion & framing">
                            <div className="flex gap-1.5 flex-wrap">
                              {(["none", "zoomIn", "zoomOut", "panLeft", "panRight", "drift"] as const).map((m) => (
                                <button key={m} className={`chip ${selected.motion === m ? "active" : ""}`} onClick={() => updateClip(selected.id, { motion: m })}>
                                  {m}
                                </button>
                              ))}
                            </div>
                            <Slider label="Scale" value={selected.scale} min={0.5} max={3} step={0.01} onChange={(v) => updateClip(selected.id, { scale: v }, false)} format={(v) => `${Math.round(v * 100)}%`} />
                            <Slider label="Position X" value={selected.x} min={-50} max={50} step={0.5} onChange={(v) => updateClip(selected.id, { x: v }, false)} unit="%" />
                            <Slider label="Position Y" value={selected.y} min={-50} max={50} step={0.5} onChange={(v) => updateClip(selected.id, { y: v }, false)} unit="%" />
                            <Slider label="Rotation" value={selected.rotation} min={-180} max={180} step={0.5} onChange={(v) => updateClip(selected.id, { rotation: v }, false)} unit="°" />
                            <Slider label="Opacity" value={selected.opacity} min={0} max={1} step={0.01} onChange={(v) => updateClip(selected.id, { opacity: v }, false)} format={(v) => `${Math.round(v * 100)}%`} />
                          </Section>
                        </>
                      ) : null}
                      {selected.kind === "video" || selected.kind === "audio" ? (
                        <Section title="Audio">
                          <Slider label="Volume" value={selected.volume} min={0} max={2} step={0.01} onChange={(v) => updateClip(selected.id, { volume: v }, false)} format={(v) => `${(20 * Math.log10(Math.max(0.001, v))).toFixed(1)} dB`} />
                          <Toggle label="Mute" on={selected.muted} onChange={(v) => updateClip(selected.id, { muted: v })} />
                        </Section>
                      ) : null}
                      <button className="btn btn-xs btn-ghost self-start" onClick={() => commit(tlRef.current!)}>
                        Commit changes
                      </button>
                    </>
                  ) : (
                    <div className="text-[11px] text-muted leading-relaxed flex flex-col gap-3">
                      <p>Select a clip on the timeline to inspect it. Drag clips to move them, drag edges to trim, drag between V1 and V2 to layer.</p>
                      <div className="grid grid-cols-2 gap-y-1.5">
                        <span><Kbd>Space</Kbd> Play</span>
                        <span><Kbd>S</Kbd> Split</span>
                        <span><Kbd>T</Kbd> Title</span>
                        <span><Kbd>Del</Kbd> Delete</span>
                        <span><Kbd>⇧Del</Kbd> Ripple</span>
                        <span><Kbd>⌘Z</Kbd> Undo</span>
                        <span><Kbd>←</Kbd><Kbd>→</Kbd> Frame</span>
                        <span><Kbd>⌘</Kbd>+scroll Zoom</span>
                      </div>
                    </div>
                  )
                ) : null}

                {tab === "color" ? (
                  selected && selected.kind !== "audio" && selected.kind !== "title" ? (
                    <>
                      <Section title="Clip look" right={<button className="btn btn-xs btn-ghost" onClick={() => updateClip(selected.id, { grade: { ...DEFAULT_GRADE }, lookId: null })}>Reset</button>}>
                        <LookStrip active={selected.lookId ?? "natural"} onPick={(id) => updateClip(selected.id, { lookId: id === "natural" ? null : id })} extra={custom} compact />
                        <p className="text-[10px] text-muted">{resolve(selected.lookId)?.description ?? "No look — clip grade only. Looks stack under your manual adjustments."}</p>
                      </Section>
                      {(["Light", "Color", "Tone", "Film", "Texture"] as const).map((group) => (
                        <Section key={group} title={group}>
                          <div className="flex flex-col gap-2.5">
                            {GRADE_CONTROLS.filter((c) => c.group === group).map((c) => (
                              <Slider key={c.key} label={c.label} value={clipGradeValue(c.key)} min={c.min} max={c.max} step={c.step} onChange={(v) => updateClip(selected.id, { grade: { ...selected.grade, [c.key]: v } }, false)} onReset={() => updateClip(selected.id, { grade: { ...selected.grade, [c.key]: DEFAULT_GRADE[c.key] } })} />
                            ))}
                          </div>
                        </Section>
                      ))}
                      <Section title="Shot match">
                        <p className="text-[10px] text-muted">Park the playhead on a reference shot and capture it; then select another clip, park on it and match. The engine aligns luminance, contrast, temperature, tint, saturation, toe and shoulder.</p>
                        <div className="flex gap-2">
                          <button
                            className="btn btn-xs btn-ghost flex-1"
                            onClick={() => {
                              const d = engineRef.current?.sampleComposite();
                              if (d) {
                                setRefStats(computeStats(d, 192, 108));
                                toast("Reference captured");
                              }
                            }}
                          >
                            Capture reference
                          </button>
                          <button
                            className="btn btn-xs flex-1"
                            disabled={!refStats}
                            onClick={() => {
                              const d = engineRef.current?.sampleComposite();
                              if (!d || !refStats) return;
                              const src = computeStats(d, 192, 108);
                              const { grade, summary } = matchGrade(src, refStats);
                              const g = { ...selected.grade };
                              for (const [k, v] of Object.entries(grade)) if (typeof v === "number") g[k as keyof Grade] = g[k as keyof Grade] + v;
                              updateClip(selected.id, { grade: g });
                              toast(summary[0]);
                            }}
                          >
                            Match to reference
                          </button>
                        </div>
                      </Section>
                      <button className="btn btn-xs btn-ghost self-start" onClick={() => commit(tlRef.current!)}>
                        Commit grade
                      </button>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted">Select a video or image clip to grade it. Use the Master tab for the whole sequence.</p>
                  )
                ) : null}

                {tab === "title" ? (
                  selected?.kind === "title" && selected.title ? (
                    <>
                      <Section title="Text">
                        <input className="field" value={selected.title.text} onChange={(e) => updateClip(selected.id, { title: { ...selected.title!, text: e.target.value } }, false)} onBlur={() => commit(tlRef.current!)} />
                        <input className="field" placeholder="Subtitle (optional)" value={selected.title.subtitle} onChange={(e) => updateClip(selected.id, { title: { ...selected.title!, subtitle: e.target.value } }, false)} onBlur={() => commit(tlRef.current!)} />
                        <div className="flex gap-1.5">
                          {(["serif", "sans", "mono"] as const).map((f) => (
                            <button key={f} className={`chip ${selected.title!.font === f ? "active" : ""}`} onClick={() => updateClip(selected.id, { title: { ...selected.title!, font: f } })}>
                              {f}
                            </button>
                          ))}
                        </div>
                        <Slider label="Size" value={selected.title.size} min={1} max={10} step={0.1} onChange={(v) => updateClip(selected.id, { title: { ...selected.title!, size: v } }, false)} />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] tracking-[0.18em] uppercase text-ivory/70">Colour</span>
                          <div className="flex gap-1.5 items-center">
                            {["#f3e7c9", "#d4af6a", "#ffffff", "#0d0d12", "#d0323c", "#9ad0ff"].map((c) => (
                              <button key={c} className={`w-5 h-5 border ${selected.title!.color === c ? "border-gold" : "border-white/20"}`} style={{ background: c }} onClick={() => updateClip(selected.id, { title: { ...selected.title!, color: c } })} />
                            ))}
                            <input type="color" value={selected.title.color} onChange={(e) => updateClip(selected.id, { title: { ...selected.title!, color: e.target.value } }, false)} className="w-6 h-6 bg-transparent" />
                          </div>
                        </div>
                      </Section>
                      <Section title="Layout">
                        <div className="flex gap-1.5">
                          {(["left", "center", "right"] as const).map((a) => (
                            <button key={a} className={`chip ${selected.title!.align === a ? "active" : ""}`} onClick={() => updateClip(selected.id, { title: { ...selected.title!, align: a } })}>
                              {a}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          {(["upper", "center", "lower"] as const).map((p) => (
                            <button key={p} className={`chip ${selected.title!.position === p ? "active" : ""}`} onClick={() => updateClip(selected.id, { title: { ...selected.title!, position: p } })}>
                              {p}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {(["none", "bar", "box", "gradient"] as const).map((b) => (
                            <button key={b} className={`chip ${selected.title!.background === b ? "active" : ""}`} onClick={() => updateClip(selected.id, { title: { ...selected.title!, background: b } })}>
                              {b}
                            </button>
                          ))}
                        </div>
                      </Section>
                      <Section title="Animation">
                        <div className="flex gap-1.5 flex-wrap">
                          {(["none", "fade", "rise", "tracking", "typewriter"] as const).map((a) => (
                            <button key={a} className={`chip ${selected.title!.animation === a ? "active" : ""}`} onClick={() => updateClip(selected.id, { title: { ...selected.title!, animation: a } })}>
                              {a}
                            </button>
                          ))}
                        </div>
                        <Slider label="Duration" value={selected.duration} min={0.5} max={20} step={0.1} onChange={(v) => updateClip(selected.id, { duration: v }, false)} unit="s" />
                      </Section>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-[11px] text-muted">Select a title clip, or create one at the playhead.</p>
                      <button className="btn btn-sm self-start" onClick={addTitle}>
                        + Add title
                      </button>
                    </div>
                  )
                ) : null}

                {tab === "master" && tl ? (
                  <>
                    <Section title="Master look" right={<button className="btn btn-xs btn-ghost" onClick={() => commit({ ...tl, masterGrade: { ...DEFAULT_GRADE }, masterLookId: null })}>Reset</button>}>
                      <LookStrip active={tl.masterLookId ?? "natural"} onPick={(id) => commit({ ...tl, masterLookId: id === "natural" ? null : id })} extra={custom} compact />
                      <p className="text-[10px] text-muted">{resolve(tl.masterLookId)?.description ?? "Applied to the whole programme after clip grades — the final creative pass."}</p>
                    </Section>
                    {(["Light", "Color", "Tone", "Film", "Texture"] as const).map((group) => (
                      <Section key={group} title={group}>
                        <div className="flex flex-col gap-2.5">
                          {GRADE_CONTROLS.filter((c) => c.group === group).map((c) => (
                            <Slider key={c.key} label={c.label} value={tl.masterGrade[c.key]} min={c.min} max={c.max} step={c.step} onChange={(v) => preview({ ...tl, masterGrade: { ...tl.masterGrade, [c.key]: v } })} onReset={() => commit({ ...tl, masterGrade: { ...tl.masterGrade, [c.key]: DEFAULT_GRADE[c.key] } })} />
                          ))}
                        </div>
                      </Section>
                    ))}
                    <Section title="Delivery">
                      <div className="flex gap-1.5 flex-wrap">
                        {(["none", "2.39", "1.85", "4:3"] as const).map((l) => (
                          <button key={l} className={`chip ${tl.letterbox === l ? "active" : ""}`} onClick={() => commit({ ...tl, letterbox: l })}>
                            {l === "none" ? "No matte" : l}
                          </button>
                        ))}
                      </div>
                      <Slider label="Master volume" value={tl.masterVolume} min={0} max={2} step={0.01} onChange={(v) => preview({ ...tl, masterVolume: v })} format={(v) => `${(20 * Math.log10(Math.max(0.001, v))).toFixed(1)} dB`} />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Frame rate</span>
                          <select className="field" value={tl.fps} onChange={(e) => commit({ ...tl, fps: Number(e.target.value) })}>
                            {[23.976, 24, 25, 29.97, 30, 48, 50, 60].map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Canvas</span>
                          <select className="field" value={`${tl.width}x${tl.height}`} onChange={(e) => { const [w, h] = e.target.value.split("x").map(Number); commit({ ...tl, width: w, height: h }); }}>
                            {["1280x720", "1920x1080", "2560x1440", "3840x2160", "1080x1920", "1080x1080", "2048x858", "4096x1716"].map((r) => (
                              <option key={r} value={r}>
                                {r.replace("x", " × ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </Section>
                    <button className="btn btn-xs btn-ghost self-start" onClick={() => commit(tlRef.current!)}>
                      Commit master
                    </button>
                  </>
                ) : null}

                {tab === "director" && tl ? (
                  <Section title="Director · frame intelligence">
                    <AnalysisPanel
                      getSample={() => {
                        const d = engineRef.current?.sampleComposite(192, 108);
                        return d ? { data: d, w: 192, h: 108 } : null;
                      }}
                      fps={tl.fps}
                      source="editor"
                      onApplyGrade={(g) => {
                        if (selected && selected.kind !== "title" && selected.kind !== "audio") {
                          const ng = { ...selected.grade };
                          for (const [k, v] of Object.entries(g)) if (typeof v === "number") ng[k as keyof Grade] = ng[k as keyof Grade] + v;
                          updateClip(selected.id, { grade: ng });
                          toast("Correction applied to the selected clip");
                        } else {
                          const mg = { ...tl.masterGrade };
                          for (const [k, v] of Object.entries(g)) if (typeof v === "number") mg[k as keyof Grade] = mg[k as keyof Grade] + v;
                          commit({ ...tl, masterGrade: mg });
                          toast("Correction applied to the master");
                        }
                      }}
                      onApplyLook={(id) => {
                        if (selected && selected.kind !== "title" && selected.kind !== "audio") updateClip(selected.id, { lookId: id });
                        else commit({ ...tl, masterLookId: id });
                        toast(`Look applied: ${resolve(id)?.name ?? id}`);
                      }}
                    />
                  </Section>
                ) : null}

                {tab === "auto" ? (
                  <>
                    <Section title="Auto-edit · intelligent assembly">
                      <p className="text-[10px] text-muted leading-relaxed">The Director scans every selected clip for motion and detail energy, picks the strongest moments, paces them to the chosen mood and assembles titles, transitions and a master look. Replaces the current sequence (undo available).</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {(Object.keys(MOODS) as AutoEditMood[]).map((m) => (
                          <button key={m} className={`chip ${autoMood === m ? "active" : ""}`} onClick={() => setAutoMood(m)}>
                            {MOODS[m].label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gold/80">{MOODS[autoMood].tagline}</p>
                      <Slider label="Target duration" value={autoDur} min={10} max={600} step={5} onChange={setAutoDur} format={(v) => formatDuration(v)} />
                      <input className="field" placeholder="Opening title (optional)" value={autoTitle} onChange={(e) => setAutoTitle(e.target.value)} />
                    </Section>
                    <Section title="Footage" right={<button className="btn btn-xs btn-ghost" onClick={() => setAutoSel(autoSel.length === assets.length ? [] : assets.filter((a) => a.kind !== "audio").map((a) => a.id))}>{autoSel.length ? "Clear" : "All"}</button>}>
                      <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                        {assets.filter((a) => a.kind !== "audio").map((a) => (
                          <label key={a.id} className="flex items-center gap-2 panel p-1.5 cursor-pointer">
                            <input type="checkbox" checked={autoSel.includes(a.id)} onChange={(e) => setAutoSel((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} className="accent-[var(--accent)]" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={assetThumbUrl(a.id)} alt="" className="w-12 h-7 object-cover bg-black" />
                            <span className="text-[11px] truncate flex-1">{a.name}</span>
                            <span className="readout text-[9px] text-muted">{a.kind === "image" ? "still" : formatDuration(a.durationMs / 1000)}</span>
                          </label>
                        ))}
                      </div>
                      <button className="btn btn-solid" onClick={runAutoEdit} disabled={!!autoBusy || !autoSel.length}>
                        {autoBusy ? <Spinner /> : null} {autoBusy ?? "Assemble cut"}
                      </button>
                    </Section>
                  </>
                ) : null}
              </div>
            </aside>
          </div>

          {/* Timeline */}
          <div className="h-[220px] md:h-[250px] flex-none border-t border-white/[0.06] bg-[#0a0a0e]">
            {tl ? <Timeline tl={tl} playhead={playhead} selectedId={selectedId} zoom={zoom} snap={snap} onSelect={setSelectedId} onSeek={seek} onChange={(next, c) => (c ? commit(next) : preview(next))} onZoom={setZoom} /> : null}
          </div>
        </div>
      </div>

      {/* Mobile bin */}
      <div className="lg:hidden border-t border-white/[0.06] bg-[#0b0b10] p-2 flex gap-2 overflow-x-auto">
        <label className="btn btn-xs cursor-pointer flex-none">
          Import
          <input type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => importFiles(e.target.files)} />
        </label>
        {assets.map((a) => (
          <button key={a.id} className="flex-none flex items-center gap-2 panel p-1 pr-2" onClick={() => addAsset(a)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetThumbUrl(a.id)} alt="" className="w-12 h-7 object-cover bg-black" />
            <span className="text-[10px] max-w-[90px] truncate">{a.name}</span>
          </button>
        ))}
      </div>

      {/* Export dialog */}
      {exportOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !exporting && setExportOpen(false)}>
          <div className="glass-strong w-full max-w-md p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="eyebrow mb-1">Master & export</div>
              <div className="display text-2xl">Deliver the picture</div>
            </div>
            {exporting ? (
              <div className="flex flex-col gap-3">
                <div className="text-[12px] text-ivory/80">{exporting.label}</div>
                <div className="h-1 bg-white/10">
                  <div className="h-full bg-gold transition-all" style={{ width: `${Math.round(exporting.progress * 100)}%` }} />
                </div>
                <div className="readout text-[11px] text-muted">{Math.round(exporting.progress * 100)}% · {formatTimecode(playhead, fps)}</div>
                <button className="btn btn-ghost btn-sm self-end" onClick={cancelExport}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">File name</span>
                  <input className="field" value={exportCfg.name} onChange={(e) => setExportCfg({ ...exportCfg, name: e.target.value })} />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Resolution</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      ["project", `Project (${tl?.width}×${tl?.height})`],
                      ["720p", "720p"],
                      ["1080p", "1080p"],
                      ["4k", "4K UHD"],
                    ].map(([id, l]) => (
                      <button key={id} className={`chip ${exportCfg.res === id ? "active" : ""}`} onClick={() => setExportCfg({ ...exportCfg, res: id })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Codec</span>
                  <select className="field" value={exportCfg.codec} onChange={(e) => setExportCfg({ ...exportCfg, codec: e.target.value })}>
                    <option value="auto">Auto (best available)</option>
                    {codecOptions().map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.supported}>
                        {c.label}
                        {c.supported ? "" : " — unavailable"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Bitrate</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[8, 16, 25, 50, 80, 120].map((b) => (
                      <button key={b} className={`chip ${exportCfg.bitrate === b ? "active" : ""}`} onClick={() => setExportCfg({ ...exportCfg, bitrate: b })}>
                        {b} Mb/s
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-muted">Mastering renders the full sequence in real time through the GPU pipeline with mixed audio ({formatDuration(duration)}), saves to the Vault and downloads the file.</p>
                <div className="flex justify-end gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => setExportOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-solid btn-sm" onClick={startExport}>
                    Start mastering
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto glass-strong px-4 py-2.5 text-[12px] flex items-center gap-3">
            <span>{t.text}</span>
            {t.href ? (
              <Link href={t.href} className="text-gold-bright underline underline-offset-4">
                Open
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
