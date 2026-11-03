"use client";

import { AudioLines, ClipboardCopy, ClipboardPaste, Download, FileText, Film, Layers, Palette, Send, SlidersHorizontal, Sparkles, Trash2, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DELIVER_PRESETS, type DirectorAction } from "@/lib/ai/director";
import { supportedCodecs, type CodecOption } from "@/lib/camera/engine";
import type { Compositor } from "@/lib/editor/compositor";
import { resolveOverlaps, useEditor } from "@/lib/editor/store";
import { exportCDL, exportEDL, exportProject, exportSRT, runActions } from "@/lib/editor/tools";
import { ingestBlob } from "@/lib/media/media";
import { defaultGrade, FORMAT_PRESETS, LETTERBOX_RATIOS, MOTIONS, timelineDuration, TITLE_FONTS, TITLE_PRESETS, TRANSITIONS, type Clip, type Grade, type TitleSpec } from "@/lib/types";
import { cn, downloadBlob, downloadText, safeFileName, timecode, uid } from "@/lib/utils";
import { ColorWheel, Empty, Section, Segmented, Slider, Toggle, toast } from "../ui";
import { LookBrowser, QuickGrade, ScopePanel } from "../studio/monitor";

const TABS = [
  { id: "clip", label: "Clip", icon: Film },
  { id: "color", label: "Colour", icon: Palette },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "titles", label: "Titles", icon: Type },
  { id: "fx", label: "Finish", icon: Layers },
  { id: "deliver", label: "Deliver", icon: Send },
] as const;

const visual = (c: Clip) => c.kind === "video" || c.kind === "image";
let gradeClipboard: Grade | null = null;

function editor(ids: string[]) {
  return {
    start: () => useEditor.getState().beginGesture(),
    apply: (fn: (c: Clip) => void) => useEditor.getState().mutateLive((tl) => tl.clips.filter((c) => ids.includes(c.id)).forEach(fn)),
    commit: (fn: (c: Clip) => void) => useEditor.getState().updateClips(ids, fn),
  };
}

export function Inspector({ compositor }: { compositor: Compositor | null }) {
  const tab = useEditor((s) => s.inspector);
  const selection = useEditor((s) => s.selection);
  const clips = useEditor((s) => s.timeline.clips);
  const selected = useMemo(() => clips.filter((c) => selection.includes(c.id)), [clips, selection]);
  const primary = selected[0];
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line">
      <div className="grid grid-cols-6 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => useEditor.getState().set("inspector", t.id)} className={cn("flex flex-col items-center gap-0.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] transition", tab === t.id ? "bg-gold/[0.07] text-gold-hi shadow-[inset_0_-2px_0_#d8b57a]" : "text-smoke hover:text-ivory")}>
            <t.icon size={14} strokeWidth={1.4} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 scroll-thin">
        {tab === "clip" && <ClipTab clip={primary} selected={selected} />}
        {tab === "color" && <ColorTab selected={selected.filter(visual)} compositor={compositor} />}
        {tab === "audio" && <AudioTab selected={selected} />}
        {tab === "titles" && <TitlesTab clip={primary?.kind === "title" ? primary : undefined} />}
        {tab === "fx" && <FinishTab />}
        {tab === "deliver" && <DeliverTab compositor={compositor} />}
      </div>
    </aside>
  );
}

/* ───────────────────────── Clip ───────────────────────── */

function ClipTab({ clip, selected }: { clip?: Clip; selected: Clip[] }) {
  const fps = useEditor((s) => s.settings.fps);
  const clips = useEditor((s) => s.timeline.clips);
  if (!clip) {
    return (
      <Empty
        icon={<SlidersHorizontal size={26} strokeWidth={1} />}
        title="Nothing selected"
        body="Select a clip on the timeline to shape its timing, framing, motion and transitions. Shift-click for multiple. Double-click media in the bin to append it."
      />
    );
  }
  const ids = selected.map((c) => c.id);
  const ed = editor(ids);
  const hasPrev = clips.some((o) => o.trackId === clip.trackId && o.id !== clip.id && Math.abs(o.start + o.duration - clip.start) < 0.05);
  const media = clip.kind === "video" || clip.kind === "audio";
  const setSpeed = (v: number) =>
    useEditor.getState().commit((tl) => {
      for (const c of tl.clips.filter((x) => ids.includes(x.id))) {
        c.duration = (c.duration * c.speed) / v;
        c.speed = v;
        resolveOverlaps(tl, c.id);
      }
    });
  return (
    <>
      <Section title={selected.length > 1 ? `${selected.length} clips` : clip.kind}>
        <input value={clip.name} onChange={(e) => ed.commit((c) => (c.name = e.target.value))} className="field font-display !text-[17px] italic" />
        <div className="tc mt-2 grid grid-cols-3 gap-2 text-[10px]">
          {[["In", clip.start], ["Duration", clip.duration], ["Source", clip.sourceIn]].map(([k, v]) => (
            <div key={String(k)} className="rounded-md border border-line px-2 py-1.5">
              <div className="text-[8.5px] uppercase tracking-[0.2em] text-smoke">{k}</div>
              <div className="text-ivory/90">{timecode(Number(v), fps)}</div>
            </div>
          ))}
        </div>
      </Section>
      {media && (
        <Section title="Speed">
          <div className="grid grid-cols-6 gap-1">
            {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cn("rounded-md border py-1 text-[10.5px] font-semibold transition", Math.abs(clip.speed - s) < 0.001 ? "border-gold/60 bg-gold/10 text-gold-hi" : "border-line text-mist hover:text-ivory")}>
                {s * 100}%
              </button>
            ))}
          </div>
          <Slider className="mt-2" label="Retime" value={clip.speed} min={0.1} max={4} step={0.05} reset={1} onStart={ed.start} onChange={(v) => ed.apply((c) => { c.duration = (c.duration * c.speed) / v; c.speed = v; })} format={(v) => `${Math.round(v * 100)}%`} />
        </Section>
      )}
      {clip.kind !== "audio" && clip.kind !== "title" && (
        <Section title="Transform">
          <Segmented size="sm" className="mb-3 w-full" value={clip.transform.fit} onChange={(v) => ed.commit((c) => (c.transform.fit = v))} options={[{ value: "contain", label: "Fit" }, { value: "cover", label: "Fill" }, { value: "fill", label: "Stretch" }]} />
          <div className="space-y-2.5">
            <Slider label="Scale" value={clip.transform.scale} min={0.1} max={3} reset={1} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.transform.scale = v))} format={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-3">
              <Slider label="Position X" value={clip.transform.x} min={-1} max={1} reset={0} bipolar onStart={ed.start} onChange={(v) => ed.apply((c) => (c.transform.x = v))} />
              <Slider label="Position Y" value={clip.transform.y} min={-1} max={1} reset={0} bipolar onStart={ed.start} onChange={(v) => ed.apply((c) => (c.transform.y = v))} />
            </div>
            <Slider label="Rotation" value={clip.transform.rotation} min={-180} max={180} step={0.5} reset={0} bipolar onStart={ed.start} onChange={(v) => ed.apply((c) => (c.transform.rotation = v))} format={(v) => `${v.toFixed(1)}°`} />
            <div className="grid grid-cols-2 gap-3">
              <Slider label="Crop top" value={clip.transform.cropTop} min={0} max={0.45} reset={0} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.transform.cropTop = v))} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Crop bottom" value={clip.transform.cropBottom} min={0} max={0.45} reset={0} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.transform.cropBottom = v))} format={(v) => `${Math.round(v * 100)}%`} />
            </div>
            <Slider label="Opacity" value={clip.opacity} min={0} max={1} reset={1} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.opacity = v))} format={(v) => `${Math.round(v * 100)}%`} />
            <div className="flex items-center gap-2">
              <select value={clip.blend} onChange={(e) => ed.commit((c) => (c.blend = e.target.value as GlobalCompositeOperation))} className="field !py-1.5 !text-[11.5px]">
                {[["source-over", "Normal"], ["screen", "Screen"], ["multiply", "Multiply"], ["overlay", "Overlay"], ["soft-light", "Soft light"], ["lighter", "Add"], ["difference", "Difference"], ["luminosity", "Luminosity"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <button onClick={() => ed.commit((c) => (c.transform.flipH = !c.transform.flipH))} className={cn("btn px-3 py-1.5", clip.transform.flipH ? "btn-gold" : "btn-ghost")}>Flip</button>
            </div>
          </div>
        </Section>
      )}
      {clip.kind !== "audio" && (
        <Section title="Virtual camera">
          <div className="grid grid-cols-4 gap-1">
            {MOTIONS.map((m) => (
              <button key={m.id} onClick={() => ed.commit((c) => { c.motion = m.id; if (m.id !== "none" && c.transform.fit === "contain" && c.kind !== "title") c.transform.fit = "cover"; })} className={cn("rounded-md border px-1 py-1.5 text-[9.5px] font-semibold leading-tight transition", clip.motion === m.id ? "border-gold/60 bg-gold/10 text-gold-hi" : "border-line text-mist hover:text-ivory")}>
                {m.label}
              </button>
            ))}
          </div>
        </Section>
      )}
      {clip.kind !== "audio" && (
        <Section title="Transition in">
          <select value={clip.transitionIn?.type ?? ""} onChange={(e) => ed.commit((c) => (c.transitionIn = e.target.value ? { type: e.target.value as NonNullable<Clip["transitionIn"]>["type"], duration: c.transitionIn?.duration ?? 0.8 } : null))} className="field !py-1.5 !text-[11.5px]">
            <option value="">Straight cut</option>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          {clip.transitionIn && (
            <Slider className="mt-2" label="Duration" value={clip.transitionIn.duration} min={0.1} max={Math.max(0.2, Math.min(4, clip.duration))} reset={0.8} onStart={ed.start} onChange={(v) => ed.apply((c) => c.transitionIn && (c.transitionIn.duration = v))} format={(v) => `${v.toFixed(2)}s`} />
          )}
          {clip.transitionIn && !hasPrev && <p className="mt-1.5 text-[10px] text-smoke">No adjacent shot — this will transition from black.</p>}
        </Section>
      )}
      <Section title="Fades">
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Fade in" value={clip.fadeIn} min={0} max={Math.min(6, clip.duration)} reset={0} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.fadeIn = v))} format={(v) => `${v.toFixed(1)}s`} />
          <Slider label="Fade out" value={clip.fadeOut} min={0} max={Math.min(6, clip.duration)} reset={0} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.fadeOut = v))} format={(v) => `${v.toFixed(1)}s`} />
        </div>
      </Section>
      {clip.reframe && (
        <Section title="Smart reframe" right={<button onClick={() => ed.commit((c) => (c.reframe = null))} className="text-[10px] uppercase tracking-[0.15em] text-smoke hover:text-ruby">Clear</button>}>
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Focus X" value={clip.reframe.x} min={0} max={1} reset={0.5} onStart={ed.start} onChange={(v) => ed.apply((c) => c.reframe && (c.reframe.x = v))} />
            <Slider label="Focus Y" value={clip.reframe.y} min={0} max={1} reset={0.5} onStart={ed.start} onChange={(v) => ed.apply((c) => c.reframe && (c.reframe.y = v))} />
          </div>
        </Section>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={() => useEditor.getState().duplicateSelection()} className="btn btn-ghost flex-1 py-2">Duplicate</button>
        <button onClick={() => useEditor.getState().deleteSelection(true)} className="btn btn-ghost flex-1 py-2 hover:!border-ruby/50 hover:!text-[#ff9aa9]"><Trash2 size={12} /> Ripple delete</button>
      </div>
    </>
  );
}

/* ───────────────────────── Colour ───────────────────────── */

function ColorTab({ selected, compositor }: { selected: Clip[]; compositor: Compositor | null }) {
  const allClips = useEditor((s) => s.timeline.clips);
  const all = useMemo(() => allClips.filter(visual), [allClips]);
  const [scope, setScope] = useState<"selected" | "all">(selected.length ? "selected" : "all");
  useEffect(() => setScope(selected.length ? "selected" : "all"), [selected.length]);
  const targets = scope === "selected" && selected.length ? selected : all;
  const primary = targets[0];
  const [busy, setBusy] = useState(false);
  if (!primary) return <Empty icon={<Palette size={26} strokeWidth={1} />} title="No picture yet" body="Add footage or stills to the timeline, then return to grade." />;
  const ids = targets.map((c) => c.id);
  const ed = editor(ids);
  const g = primary.grade;
  const setGrade = (ng: Grade) => ed.apply((c) => (c.grade = { ...ng }));
  const commitGrade = (ng: Grade) => ed.commit((c) => (c.grade = { ...ng }));
  const ai = async (a: DirectorAction) => {
    setBusy(true);
    const log = await runActions([a]);
    setBusy(false);
    log.forEach((l) => toast(l, "success"));
  };
  return (
    <>
      <Section title="Target">
        <Segmented size="sm" className="w-full" value={scope} onChange={setScope} options={[{ value: "selected", label: `Selected (${selected.length})` }, { value: "all", label: `All shots (${all.length})` }]} />
      </Section>
      <Section title="Look library">
        <LookBrowser grade={g} onChange={commitGrade} />
      </Section>
      <Section title="Colour wheels">
        <div className="grid grid-cols-3 gap-2">
          {(["lift", "gamma", "gain"] as const).map((k) => (
            <ColorWheel key={k} label={k} size={88} value={g[k]} onStart={ed.start} onChange={(w) => setGrade({ ...g, [k]: w })} />
          ))}
        </div>
      </Section>
      <Section title="Primaries">
        <QuickGrade grade={g} onStart={ed.start} onChange={setGrade} />
      </Section>
      <Section title="Refine">
        <div className="space-y-2.5">
          <Slider label="Vibrance" value={g.vibrance} min={-1} max={1} reset={0} bipolar onStart={ed.start} onChange={(v) => setGrade({ ...g, vibrance: v })} />
          <Slider label="Hue rotate" value={g.hue} min={-180} max={180} step={1} reset={0} bipolar onStart={ed.start} onChange={(v) => setGrade({ ...g, hue: v })} format={(v) => `${v.toFixed(0)}°`} />
          <Slider label="Contrast pivot" value={g.pivot} min={0.2} max={0.7} reset={0.45} onStart={ed.start} onChange={(v) => setGrade({ ...g, pivot: v })} />
          <Slider label="Matte (fade)" value={g.fade} min={0} max={1} reset={0} onStart={ed.start} onChange={(v) => setGrade({ ...g, fade: v })} />
          <Slider label="Detail" value={g.sharpen} min={0} max={1} reset={0} onStart={ed.start} onChange={(v) => setGrade({ ...g, sharpen: v })} />
          <Slider label="Lens fringing" value={g.chromatic} min={0} max={1} reset={0} onStart={ed.start} onChange={(v) => setGrade({ ...g, chromatic: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Shadow hue" value={g.splitShadowHue} min={0} max={360} step={1} onStart={ed.start} onChange={(v) => setGrade({ ...g, splitShadowHue: v })} format={(v) => `${v.toFixed(0)}°`} />
            <Slider label="Amount" value={g.splitShadowAmt} min={0} max={1} reset={0} onStart={ed.start} onChange={(v) => setGrade({ ...g, splitShadowAmt: v })} />
            <Slider label="Highlight hue" value={g.splitHighHue} min={0} max={360} step={1} onStart={ed.start} onChange={(v) => setGrade({ ...g, splitHighHue: v })} format={(v) => `${v.toFixed(0)}°`} />
            <Slider label="Amount" value={g.splitHighAmt} min={0} max={1} reset={0} onStart={ed.start} onChange={(v) => setGrade({ ...g, splitHighAmt: v })} />
          </div>
          <Toggle label="Monochrome" checked={g.mono} onChange={(v) => commitGrade({ ...g, mono: v })} />
        </div>
      </Section>
      <Section title="ASC CDL">
        <div className="grid grid-cols-[48px_1fr_1fr_1fr] items-center gap-1 text-[10px]">
          <span />
          {["R", "G", "B"].map((c) => (
            <span key={c} className="text-center font-bold text-smoke">{c}</span>
          ))}
          {(["slope", "offset", "power"] as const).map((k) => (
            <Row key={k} name={k} values={g[k]} onChange={(vals) => commitGrade({ ...g, [k]: vals })} />
          ))}
        </div>
      </Section>
      <Section title="AI colourist">
        <div className="grid grid-cols-2 gap-1.5">
          <button disabled={busy} onClick={() => ai({ type: "autoColor", target: scope })} className="btn btn-ghost py-2"><Sparkles size={12} /> Auto balance</button>
          <button disabled={busy} onClick={() => ai({ type: "matchColor" })} className="btn btn-ghost py-2"><Sparkles size={12} /> Shot match</button>
          <button onClick={() => { gradeClipboard = JSON.parse(JSON.stringify(g)); toast("Grade copied"); }} className="btn btn-ghost py-2"><ClipboardCopy size={12} /> Copy grade</button>
          <button disabled={!gradeClipboard} onClick={() => gradeClipboard && commitGrade(gradeClipboard)} className="btn btn-ghost py-2"><ClipboardPaste size={12} /> Paste grade</button>
        </div>
        <button onClick={() => commitGrade(defaultGrade())} className="mt-2 text-[10px] uppercase tracking-[0.2em] text-smoke hover:text-ruby">Reset to camera original</button>
      </Section>
      <Section title="Scopes">
        <ScopePanel source={() => compositor?.canvas ?? null} />
      </Section>
    </>
  );
}

function Row({ name, values, onChange }: { name: string; values: [number, number, number]; onChange: (v: [number, number, number]) => void }) {
  return (
    <>
      <span className="text-[9.5px] uppercase tracking-[0.15em] text-mist">{name}</span>
      {values.map((v, i) => (
        <input
          key={i}
          type="number"
          step={0.01}
          value={Number(v.toFixed(3))}
          onChange={(e) => {
            const next = [...values] as [number, number, number];
            next[i] = Number(e.target.value);
            onChange(next);
          }}
          className="field tc !px-1.5 !py-1 text-center !text-[10.5px]"
        />
      ))}
    </>
  );
}

/* ───────────────────────── Audio ───────────────────────── */

function AudioTab({ selected }: { selected: Clip[] }) {
  const tracks = useEditor((s) => s.timeline.tracks);
  const sound = selected.filter((c) => c.kind === "audio" || c.kind === "video");
  const primary = sound[0];
  const ed = editor(sound.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const ai = async (a: DirectorAction) => {
    setBusy(true);
    const log = await runActions([a]);
    setBusy(false);
    log.forEach((l) => toast(l, "success"));
  };
  const db = (v: number) => (v <= 0.0001 ? "-∞" : `${(20 * Math.log10(v)).toFixed(1)} dB`);
  return (
    <>
      {primary ? (
        <Section title="Clip audio">
          <Slider label="Gain" value={primary.volume <= 0.001 ? -60 : 20 * Math.log10(primary.volume)} min={-60} max={12} step={0.5} reset={0} bipolar onStart={ed.start} onChange={(v) => ed.apply((c) => (c.volume = v <= -59.5 ? 0 : Math.pow(10, v / 20)))} format={(v) => (v <= -59.5 ? "-∞" : `${v.toFixed(1)} dB`)} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Slider label="Fade in" value={primary.fadeIn} min={0} max={6} reset={0} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.fadeIn = v))} format={(v) => `${v.toFixed(1)}s`} />
            <Slider label="Fade out" value={primary.fadeOut} min={0} max={6} reset={0} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.fadeOut = v))} format={(v) => `${v.toFixed(1)}s`} />
          </div>
          <Toggle label="Mute clip" checked={primary.muted} onChange={(v) => ed.commit((c) => (c.muted = v))} />
        </Section>
      ) : (
        <p className="pt-4 text-[11.5px] text-smoke">Select a video or audio clip to adjust its gain and fades.</p>
      )}
      <Section title="Mixer">
        <div className="space-y-3">
          {tracks.filter((t) => t.kind !== "text").map((t) => (
            <div key={t.id}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className={t.kind === "audio" ? "text-jade/90" : "text-ivory/80"}>{t.name}</span>
                <span className="flex gap-1">
                  <button onClick={() => useEditor.getState().commit((tl) => { const x = tl.tracks.find((y) => y.id === t.id); if (x) x.muted = !x.muted; })} className={cn("rounded px-1.5 text-[9px] font-black", t.muted ? "bg-ruby text-white" : "border border-line text-mist")}>M</button>
                  <button onClick={() => useEditor.getState().commit((tl) => { const x = tl.tracks.find((y) => y.id === t.id); if (x) x.solo = !x.solo; })} className={cn("rounded px-1.5 text-[9px] font-black", t.solo ? "bg-gold text-ink" : "border border-line text-mist")}>S</button>
                </span>
              </div>
              <Slider value={t.volume} min={0} max={2} reset={1} onStart={() => useEditor.getState().beginGesture()} onChange={(v) => useEditor.getState().mutateLive((tl) => { const x = tl.tracks.find((y) => y.id === t.id); if (x) x.volume = v; })} format={db} label="Fader" />
            </div>
          ))}
        </div>
      </Section>
      <Section title="AI sound">
        <div className="grid grid-cols-2 gap-1.5">
          <button disabled={busy} onClick={() => ai({ type: "removeSilences" })} className="btn btn-ghost py-2">Cut silences</button>
          <button disabled={busy} onClick={() => ai({ type: "beatSync" })} className="btn btn-ghost py-2">Beat sync</button>
          <button disabled={busy} onClick={() => ai({ type: "volume", gainDb: -10, track: "music" })} className="btn btn-ghost py-2">Duck score −10 dB</button>
          <button disabled={busy} onClick={() => ai({ type: "fades", fadeIn: 1.2, fadeOut: 1.8 })} className="btn btn-ghost py-2">Head & tail fades</button>
        </div>
      </Section>
    </>
  );
}

/* ───────────────────────── Titles ───────────────────────── */

function TitlesTab({ clip }: { clip?: Clip }) {
  const ed = editor(clip ? [clip.id] : []);
  const t = clip?.title;
  const set = (patch: Partial<TitleSpec>) => ed.commit((c) => c.title && Object.assign(c.title, patch));
  const live = (patch: Partial<TitleSpec>) => ed.apply((c) => c.title && Object.assign(c.title, patch));
  return (
    <>
      <Section title="Title designs">
        <div className="grid grid-cols-2 gap-1.5">
          {TITLE_PRESETS.map((p) => (
            <button key={p.id} onClick={() => useEditor.getState().addTitle(p.id)} className="rounded-lg border border-line p-2.5 text-left transition hover:border-gold/50">
              <div className={cn("truncate text-[15px] text-ivory", p.id === "epic" ? "font-cinzel tracking-[0.2em]" : p.id === "kinetic" ? "font-sans font-black uppercase" : p.id === "minimal" ? "font-sans font-light tracking-[0.3em]" : p.id === "documentary" ? "font-mono text-[12px]" : "font-display italic")}>{p.label}</div>
              <div className="truncate text-[9.5px] text-smoke">{p.hint}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-smoke">Placed at the playhead on the Titles track · T for a quick title.</p>
      </Section>
      {t && clip && (
        <>
          <Section title="Copy">
            <textarea value={t.text} onChange={(e) => set({ text: e.target.value })} rows={2} className="field font-display !text-[17px]" />
            <input value={t.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Subtitle / role" className="field mt-1.5 !text-[12px]" />
          </Section>
          <Section title="Typography">
            <select value={t.font} onChange={(e) => set({ font: e.target.value })} className="field !py-1.5 !text-[12px]" style={{ fontFamily: t.font }}>
              {TITLE_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
            <div className="mt-2.5 space-y-2.5">
              <Slider label="Size" value={t.size} min={0.02} max={0.3} step={0.002} onStart={ed.start} onChange={(v) => live({ size: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Tracking" value={t.tracking} min={-0.05} max={0.8} reset={0} onStart={ed.start} onChange={(v) => live({ tracking: v })} format={(v) => `${v.toFixed(2)} em`} />
              <Segmented size="sm" className="w-full" value={t.weight} onChange={(v) => set({ weight: v })} options={[300, 400, 500, 600, 700, 800].map((w) => ({ value: w, label: String(w) }))} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-mist">Colour <input type="color" value={t.color} onChange={(e) => set({ color: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" /></label>
                <label className="flex items-center gap-1.5 text-[11px] text-mist">Accent <input type="color" value={t.accent} onChange={(e) => set({ accent: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" /></label>
              </div>
              <div className="grid grid-cols-2 gap-x-3">
                <Toggle label="Italic" checked={t.italic} onChange={(v) => set({ italic: v })} />
                <Toggle label="Uppercase" checked={t.uppercase} onChange={(v) => set({ uppercase: v })} />
                <Toggle label="Shadow" checked={t.shadow} onChange={(v) => set({ shadow: v })} />
                <Toggle label="Plate" checked={t.box} onChange={(v) => set({ box: v })} />
              </div>
            </div>
          </Section>
          <Section title="Layout & motion">
            <Segmented size="sm" className="w-full" value={t.align} onChange={(v) => set({ align: v })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <Slider label="X" value={t.x} min={0} max={1} reset={0.5} onStart={ed.start} onChange={(v) => live({ x: v })} />
              <Slider label="Y" value={t.y} min={0} max={1} reset={0.5} onStart={ed.start} onChange={(v) => live({ y: v })} />
            </div>
            <select value={t.animation} onChange={(e) => set({ animation: e.target.value as TitleSpec["animation"] })} className="field mt-2.5 !py-1.5 !text-[12px]">
              {[["tracking", "Slow tracking expand"], ["fade", "Fade"], ["rise", "Rise"], ["zoom", "Slow push"], ["blur", "Focus pull"], ["typewriter", "Typewriter"], ["wipe", "Wipe on"], ["none", "Static"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <Slider className="mt-2.5" label="Duration" value={clip.duration} min={0.5} max={20} reset={4} onStart={ed.start} onChange={(v) => ed.apply((c) => (c.duration = v))} format={(v) => `${v.toFixed(1)}s`} />
          </Section>
        </>
      )}
    </>
  );
}

/* ───────────────────────── Finishing ───────────────────────── */

function FinishTab() {
  const fin = useEditor((s) => s.timeline.finishing);
  const captions = useEditor((s) => s.timeline.captions);
  const settings = useEditor((s) => s.settings);
  const playhead = useEditor((s) => s.playhead);
  const st = useEditor.getState;
  const liveFin = (patch: Partial<typeof fin>) => st().mutateLive((tl) => Object.assign(tl.finishing, patch));
  const fmt = FORMAT_PRESETS.find((f) => f.width === settings.width && f.height === settings.height)?.id ?? "";
  return (
    <>
      <Section title="Project format">
        <select value={fmt} onChange={(e) => { const p = FORMAT_PRESETS.find((f) => f.id === e.target.value); if (p) st().setSettings({ width: p.width, height: p.height, aspect: p.aspect }); }} className="field !py-1.5 !text-[12px]">
          {!fmt && <option value="">Custom · {settings.width}×{settings.height}</option>}
          {FORMAT_PRESETS.map((f) => (
            <option key={f.id} value={f.id}>{f.group} · {f.label} — {f.width}×{f.height}</option>
          ))}
        </select>
        <Segmented size="sm" className="mt-2 w-full" value={settings.fps} onChange={(v) => st().setSettings({ fps: v })} options={[23.976, 24, 25, 29.97, 30, 50, 60].map((f) => ({ value: f, label: String(f) }))} />
      </Section>
      <Section title="Matte">
        <Segmented size="sm" className="w-full" value={fin.letterbox ?? 0} onChange={(v) => st().commit((tl) => (tl.finishing.letterbox = v || null))} options={LETTERBOX_RATIOS.map((r) => ({ value: r.value ?? 0, label: r.label }))} />
      </Section>
      <Section title="Film finish">
        <div className="space-y-2.5">
          <Slider label="Global grain" value={fin.grain} min={0} max={1} reset={0} onStart={() => st().beginGesture()} onChange={(v) => liveFin({ grain: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Optical vignette" value={fin.vignette} min={0} max={1} reset={0} onStart={() => st().beginGesture()} onChange={(v) => liveFin({ vignette: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <label className="flex items-center justify-between text-[11.5px] text-mist">Canvas colour <input type="color" value={fin.background} onChange={(e) => st().commit((tl) => (tl.finishing.background = e.target.value))} className="h-6 w-8 cursor-pointer bg-transparent" /></label>
        </div>
      </Section>
      <Section title="Captions" right={<span className="tc text-[10px] text-smoke">{captions.length}</span>}>
        <Toggle label="Burn captions into picture" checked={fin.captionsVisible} onChange={(v) => st().commit((tl) => (tl.finishing.captionsVisible = v))} />
        <Segmented size="sm" className="mt-2 w-full" value={fin.captionStyle} onChange={(v) => st().commit((tl) => (tl.finishing.captionStyle = v))} options={[{ value: "cinema", label: "Cinema" }, { value: "social", label: "Social" }, { value: "broadcast", label: "Broadcast" }]} />
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => st().commit((tl) => tl.captions.push({ id: uid("cap"), start: playhead, end: playhead + 3, text: "New caption" }))} className="btn btn-ghost flex-1 py-1.5">+ At playhead</button>
          <button onClick={() => runActions([{ type: "captions", visible: true }])} className="btn btn-ghost flex-1 py-1.5">From recordings</button>
        </div>
        <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1 scroll-thin">
          {captions.slice().sort((a, b) => a.start - b.start).map((c) => (
            <div key={c.id} className="rounded-md border border-line p-2">
              <div className="tc mb-1 flex items-center justify-between text-[9.5px] text-smoke">
                <button onClick={() => st().setPlayhead(c.start)} className="hover:text-gold">{timecode(c.start, settings.fps)} → {timecode(c.end, settings.fps)}</button>
                <button onClick={() => st().commit((tl) => (tl.captions = tl.captions.filter((x) => x.id !== c.id)))} className="hover:text-ruby"><Trash2 size={10} /></button>
              </div>
              <input value={c.text} onChange={(e) => st().commit((tl) => { const x = tl.captions.find((y) => y.id === c.id); if (x) x.text = e.target.value; })} className="w-full bg-transparent text-[11.5px] text-ivory outline-none" />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ───────────────────────── Deliver ───────────────────────── */

function DeliverTab({ compositor }: { compositor: Compositor | null }) {
  const presetFromAI = useEditor((s) => s.deliverPreset);
  const name = useEditor((s) => s.name);
  const settings = useEditor((s) => s.settings);
  const duration = useEditor((s) => timelineDuration(s.timeline));
  const playhead = useEditor((s) => s.playhead);
  const [presetId, setPresetId] = useState(presetFromAI ?? "master");
  const [codecs, setCodecs] = useState<CodecOption[]>([]);
  const [codecId, setCodecId] = useState("");
  const [mbps, setMbps] = useState(40);
  const [scale, setScale] = useState<1 | 0.5>(1);
  const [range, setRange] = useState<"all" | "playhead">("all");
  const [progress, setProgress] = useState<number | null>(null);
  const [cancel] = useState(() => ({ cancelled: false }));
  const [toVault, setToVault] = useState(true);

  useEffect(() => {
    const list = supportedCodecs();
    setCodecs(list);
    setCodecId(list[0]?.id ?? "");
  }, []);
  useEffect(() => {
    if (presetFromAI) setPresetId(presetFromAI);
  }, [presetFromAI]);
  const preset = DELIVER_PRESETS.find((p) => p.id === presetId) ?? DELIVER_PRESETS[0];
  useEffect(() => {
    setMbps(preset.mbps);
    setScale(preset.scale === 0.5 ? 0.5 : 1);
  }, [preset]);
  const target = preset.format ? FORMAT_PRESETS.find((f) => f.id === preset.format) : null;
  const mismatch = target && Math.abs(target.width / target.height - settings.width / settings.height) > 0.01;
  const exportScale = target && !mismatch ? Math.min(1, target.width / settings.width) * (scale === 0.5 ? 0.5 : 1) : scale;
  const codec = codecs.find((c) => c.id === codecId) ?? codecs[0];
  const from = range === "playhead" ? Math.min(playhead, duration) : 0;
  const len = Math.max(0, duration - from);

  const render = async () => {
    if (!compositor || !codec) return toast("This browser can't encode video — try Chrome or Edge.", "error");
    if (len < 0.2) return toast("Nothing to render — the timeline is empty.", "error");
    useEditor.getState().setPlaying(false);
    cancel.cancelled = false;
    setProgress(0);
    try {
      const blob = await compositor.export({ from, to: duration, scale: exportScale, mbps, codec, onProgress: setProgress, signal: cancel });
      if (cancel.cancelled) {
        toast("Render cancelled");
        return;
      }
      downloadBlob(blob, `${safeFileName(name)}_${preset.id}.${codec.ext}`);
      if (toVault) {
        const a = await ingestBlob(blob, { name: `${name} · ${preset.label}`, source: "export", durationHint: len, tags: ["master", preset.id] });
        useEditor.getState().addAsset(a);
      }
      toast(`Delivered ${preset.label}`, "success");
    } catch (e) {
      toast(`Render failed: ${(e as Error).message}`, "error");
    } finally {
      setProgress(null);
    }
  };

  const st = useEditor.getState;
  const base = safeFileName(name);
  return (
    <>
      <Section title="Delivery presets">
        <div className="space-y-1.5">
          {DELIVER_PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPresetId(p.id)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition", presetId === p.id ? "border-gold/60 bg-gold/[0.08]" : "border-line hover:border-line-2")}>
              <span>
                <span className="block text-[12px] font-semibold text-ivory">{p.label}</span>
                <span className="block text-[10px] text-smoke">{p.detail}</span>
              </span>
              {presetId === p.id && <span className="h-1.5 w-1.5 rotate-45 bg-gold" />}
            </button>
          ))}
        </div>
        {mismatch && target && (
          <div className="mt-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-[11px] text-gold-hi">
            This preset is {target.aspect}; your project is {settings.aspect}.
            <button onClick={() => runActions([{ type: "setFormat", preset: target.id }, { type: "smartReframe" }])} className="btn btn-gold mt-2 w-full py-1.5">Conform & smart-reframe to {target.aspect}</button>
          </div>
        )}
      </Section>
      <Section title="Encoder">
        <select value={codecId} onChange={(e) => setCodecId(e.target.value)} className="field !py-1.5 !text-[12px]">
          {codecs.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <Slider className="mt-2.5" label="Bitrate" value={mbps} min={2} max={80} step={1} onChange={setMbps} format={(v) => `${v} Mbps`} />
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Segmented size="sm" value={scale} onChange={setScale} options={[{ value: 1, label: "Full res" }, { value: 0.5, label: "Half" }]} />
          <Segmented size="sm" value={range} onChange={setRange} options={[{ value: "all", label: "Whole" }, { value: "playhead", label: "From ▸" }]} />
        </div>
        <div className="tc mt-3 grid grid-cols-3 gap-2 text-[10px]">
          {[["Output", `${Math.round(settings.width * exportScale)}×${Math.round(settings.height * exportScale)}`], ["Length", timecode(len, settings.fps).slice(3)], ["Est. size", `${((mbps * len) / 8).toFixed(0)} MB`]].map(([k, v]) => (
            <div key={k} className="rounded-md border border-line px-2 py-1.5">
              <div className="text-[8.5px] uppercase tracking-[0.2em] text-smoke">{k}</div>
              <div className="text-ivory/90">{v}</div>
            </div>
          ))}
        </div>
        <Toggle label="Also archive master in the Vault" checked={toVault} onChange={setToVault} />
        {progress === null ? (
          <button onClick={render} className="btn btn-gold mt-3 w-full py-3"><Download size={14} /> Render & download</button>
        ) : (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-gold-lo to-gold-hi transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-mist">
              <span className="gold-shimmer font-semibold">Rendering in real time · {Math.round(progress * 100)}%</span>
              <button onClick={() => (cancel.cancelled = true)} className="hover:text-ruby">Cancel</button>
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-smoke">Frames are composited on your GPU and encoded with the browser&apos;s hardware encoder. Keep this tab visible while rendering.</p>
      </Section>
      <Section title="Interchange">
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => downloadText(exportEDL(st()), `${base}.edl`)} className="btn btn-ghost py-2"><FileText size={12} /> EDL · CMX 3600</button>
          <button onClick={() => downloadText(exportCDL(st()), `${base}.ccc`, "application/xml")} className="btn btn-ghost py-2"><Palette size={12} /> ASC CDL</button>
          <button onClick={() => (st().timeline.captions.length ? downloadText(exportSRT(st()), `${base}.srt`) : toast("No captions on this timeline yet.", "error"))} className="btn btn-ghost py-2"><Type size={12} /> Captions · SRT</button>
          <button onClick={() => downloadText(exportProject(st()), `${base}.lumiere.json`, "application/json")} className="btn btn-ghost py-2"><Layers size={12} /> Project</button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-smoke">Conform in DaVinci Resolve, Premiere Pro or Avid with the EDL; hand the CDL to your colourist or DIT.</p>
      </Section>
    </>
  );
}
