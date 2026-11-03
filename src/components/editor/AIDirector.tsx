"use client";

import { ArrowUp, AudioWaveform, Crop, Film, Mic, Palette, Rows3, ScanLine, Scissors, Smartphone, Undo2, Wand2, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { DirectorAction, DirectorReply } from "@/lib/ai/director";
import { getLook } from "@/lib/looks";
import { useEditor } from "@/lib/editor/store";
import { buildContext, runActions } from "@/lib/editor/tools";
import { cn, jsonFetch, uid } from "@/lib/utils";
import { Spinner } from "../ui";

interface Msg {
  id: string;
  role: "user" | "director";
  text: string;
  actions?: DirectorAction[];
  log?: string[];
  undo?: number;
  engine?: string;
}

const TOOLS: { label: string; icon: typeof Wand2; action: DirectorAction }[] = [
  { label: "Auto colour", icon: Palette, action: { type: "autoColor" } },
  { label: "Match shots", icon: Rows3, action: { type: "matchColor" } },
  { label: "Cut silences", icon: Scissors, action: { type: "removeSilences" } },
  { label: "Beat sync", icon: AudioWaveform, action: { type: "beatSync" } },
  { label: "Find scenes", icon: ScanLine, action: { type: "detectScenes" } },
  { label: "Smart reframe", icon: Crop, action: { type: "smartReframe" } },
  { label: "Trailer · 30s", icon: Film, action: { type: "autoEdit", style: "trailer", seconds: 30 } },
  { label: "Go vertical", icon: Smartphone, action: { type: "setFormat", preset: "vertical" } },
];

function describe(a: DirectorAction): string {
  switch (a.type) {
    case "applyLook": return `Look · ${getLook(a.look)?.name ?? a.look}`;
    case "adjustGrade": return `Grade · ${Object.keys(a.patch).join(", ")}`;
    case "setFormat": return `Format · ${a.preset}`;
    case "letterbox": return a.ratio ? `Letterbox · ${a.ratio}:1` : "Letterbox off";
    case "addTitle": return `Title · “${a.text}”`;
    case "transitions": return `Transitions · ${a.transition}`;
    case "autoEdit": return `Auto-edit · ${a.style}`;
    case "deliver": return `Deliver · ${a.preset}`;
    default: return a.type.replace(/([A-Z])/g, " $1").toLowerCase();
  }
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-gold-hi">{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export function AIDirector({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "hello",
      role: "director",
      text: "The suite is yours. Describe a feeling, cite a film, or name an operation — “grade it like **Dune**, add a scope matte, then cut to the beat”. I'll make the decisions a seasoned editor and colourist would, and you can undo any of them.",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [engine, setEngine] = useState("lumiere-local");
  const [suggestions, setSuggestions] = useState<string[]>(["Make it cinematic", "Grade it like Blade Runner 2049", "Remove the silences", "Build a 30 second trailer", "Fix the colours and match all shots"]);
  const [listening, setListening] = useState(false);
  const busy = useEditor((s) => s.busy);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai/director")
      .then((r) => r.json())
      .then((d: { engine: string }) => setEngine(d.engine))
      .catch(() => null);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, thinking, busy]);

  const execute = async (id: string, actions: DirectorAction[]) => {
    const before = useEditor.getState().past.length;
    const log = await runActions(actions);
    const after = useEditor.getState().past.length;
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, log, undo: Math.max(0, after - before) } : x)));
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput("");
    setMsgs((m) => [...m, { id: uid(), role: "user", text }]);
    setThinking(true);
    try {
      const st = useEditor.getState();
      const res = await jsonFetch<DirectorReply>("/api/ai/director", {
        method: "POST",
        body: JSON.stringify({ message: text, context: buildContext(st), history: msgs.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })) }),
      });
      const id = uid();
      setMsgs((m) => [...m, { id, role: "director", text: res.reply, actions: res.actions, engine: res.engine }]);
      if (res.suggestions?.length) setSuggestions(res.suggestions);
      setThinking(false);
      if (res.actions.length) await execute(id, res.actions);
    } catch (e) {
      setMsgs((m) => [...m, { id: uid(), role: "director", text: `I lost the signal — ${(e as Error).message}` }]);
      setThinking(false);
    }
  };

  const tool = async (t: (typeof TOOLS)[number]) => {
    const id = uid();
    setMsgs((m) => [...m, { id, role: "director", text: `Running **${t.label}**…`, actions: [t.action] }]);
    await execute(id, [t.action]);
  };

  const undo = (m: Msg) => {
    for (let i = 0; i < (m.undo ?? 0); i++) useEditor.getState().undo();
    setMsgs((ms) => ms.map((x) => (x.id === m.id ? { ...x, undo: 0, log: [...(x.log ?? []), "Reverted."] } : x)));
  };

  const dictate = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      void send(t);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const engineLabel = engine === "lumiere-local" ? "LUMIÈRE Neural · on-device" : engine;

  return (
    <div className="lux-glass absolute inset-y-0 right-0 z-30 flex w-[392px] flex-col border-l border-gold/20 shadow-[-30px_0_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <div className="flex items-center gap-2 font-display text-2xl text-ivory">
            <Wand2 size={16} className="text-gold" /> AI Director
          </div>
          <div className="text-[9.5px] uppercase tracking-[0.22em] text-smoke">{engineLabel}</div>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 text-mist hover:text-ivory"><X size={15} /></button>
      </div>

      <div className="grid grid-cols-4 gap-1 border-b border-line p-3">
        {TOOLS.map((t) => (
          <button key={t.label} onClick={() => tool(t)} disabled={Boolean(busy)} className="flex flex-col items-center gap-1 rounded-lg border border-line px-1 py-2 text-[9.5px] font-semibold text-mist transition hover:border-gold/50 hover:text-gold-hi disabled:opacity-40">
            <t.icon size={14} strokeWidth={1.4} />
            <span className="text-center leading-tight">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin">
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-10 rounded-2xl rounded-tr-sm border border-line-2 bg-white/[0.04] px-4 py-2.5 text-[12.5px] leading-relaxed text-ivory">{m.text}</div>
          ) : (
            <div key={m.id} className="animate-rise">
              <div className="mb-1 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.25em] text-gold/70">
                <span className="h-px w-4 bg-gold/50" /> Director
              </div>
              <div className="font-display text-[16px] leading-[1.45] text-ivory/90"><Rich text={m.text} /></div>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.actions.map((a, i) => (
                    <span key={i} className="rounded-full border border-gold/25 bg-gold/[0.06] px-2 py-0.5 text-[9.5px] text-gold-hi">◆ {describe(a)}</span>
                  ))}
                </div>
              )}
              {m.log && m.log.length > 0 && (
                <div className="mt-2 space-y-0.5 border-l border-gold/30 pl-3 text-[11px] text-mist">
                  {m.log.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}
              {Boolean(m.undo) && (
                <button onClick={() => undo(m)} className="mt-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-smoke hover:text-gold">
                  <Undo2 size={11} /> Undo this direction
                </button>
              )}
            </div>
          ),
        )}
        {(thinking || busy) && (
          <div className="flex items-center gap-2 text-[12px]">
            <Spinner />
            <span className="gold-shimmer font-display text-[15px] italic">{busy ?? "Considering the frame…"}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scroll-thin">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="chip shrink-0 transition hover:!border-gold/50 hover:!text-gold-hi">{s}</button>
          ))}
        </div>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Direct the edit…  e.g. moody teal night, slower, add title 'Nocturne'"
            className="field resize-none !rounded-xl !pr-20 !text-[12.5px]"
          />
          <div className="absolute bottom-2 right-2 flex gap-1">
            <button onClick={dictate} className={cn("rounded-full p-2 transition", listening ? "bg-ruby text-white" : "text-mist hover:text-gold")} title="Speak to your Director"><Mic size={14} /></button>
            <button onClick={() => send(input)} disabled={!input.trim() || thinking} className="rounded-full bg-gradient-to-b from-gold-hi to-gold p-2 text-ink disabled:opacity-30"><ArrowUp size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SpeechLike {
  lang: string;
  interimResults: boolean;
  start(): void;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
}
