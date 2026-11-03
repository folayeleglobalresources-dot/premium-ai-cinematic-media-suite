"use client";

import { BUILTIN_LOOKS } from "@/lib/looks";
import type { Look } from "@/lib/types";
import { useEffect, useRef } from "react";

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group">
      {label ? (
        <span className="flex flex-col">
          <span className="text-[11px] tracking-[0.12em] uppercase text-ivory/85 group-hover:text-ivory">{label}</span>
          {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
        </span>
      ) : null}
      <button type="button" className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on} />
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onReset,
  format,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  format?: (v: number) => string;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" onDoubleClick={onReset}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.18em] uppercase text-ivory/70">{label}</span>
        <span className="readout text-[10px] text-gold-bright">
          {format ? format(value) : value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}
          {unit ?? ""}
        </span>
      </div>
      <input type="range" className="slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

export function Section({ title, children, right, className = "" }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between hairline pb-2">
        <span className="eyebrow">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export function LookStrip({
  active,
  onPick,
  extra = [],
  compact,
}: {
  active: string | null;
  onPick: (id: string | null) => void;
  extra?: Look[];
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const all = [...BUILTIN_LOOKS, ...extra];
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <div ref={ref} className="flex gap-2 overflow-x-auto pb-2 snap-x">
      {all.map((l) => {
        const isActive = active === l.id;
        return (
          <button
            key={l.id}
            data-active={isActive}
            onClick={() => onPick(isActive && l.id !== "natural" ? "natural" : l.id)}
            title={l.description}
            className={`snap-start flex-none text-left transition-all ${compact ? "w-[84px]" : "w-[112px]"} group`}
          >
            <div
              className={`relative ${compact ? "h-12" : "h-16"} overflow-hidden border transition-all ${isActive ? "border-gold shadow-[0_0_18px_rgba(var(--accent-rgb),0.45)]" : "border-white/10 group-hover:border-white/30"}`}
              style={{ background: `linear-gradient(135deg, ${l.swatch[0]} 0%, ${l.swatch[1]} 55%, ${l.swatch[2]} 100%)` }}
            >
              {isActive ? <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-gold-bright rounded-full shadow-[0_0_8px_rgba(var(--accent-rgb),1)]" /> : null}
              <span className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
            </div>
            <div className={`mt-1 ${compact ? "text-[9px]" : "text-[10px]"} tracking-[0.08em] uppercase truncate ${isActive ? "text-gold-bright" : "text-ivory/70"}`}>{l.name}</div>
            {!compact ? <div className="text-[9px] text-muted truncate">{l.category}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

export function AudioMeter({ levels, vertical = true }: { levels: { rms: number; peak: number }[]; vertical?: boolean }) {
  const toDb = (v: number) => (v <= 0 ? -60 : Math.max(-60, 20 * Math.log10(v)));
  const pct = (db: number) => ((db + 60) / 60) * 100;
  return (
    <div className={`flex ${vertical ? "flex-row h-full gap-1" : "flex-col w-full gap-1"}`}>
      {levels.map((l, i) => {
        const rms = pct(toDb(l.rms));
        const peak = pct(toDb(l.peak));
        return (
          <div key={i} className={`relative ${vertical ? "w-2 h-full" : "h-2 w-full"} bg-white/5 border border-white/10 overflow-hidden`}>
            <div
              className="absolute"
              style={
                vertical
                  ? { left: 0, right: 0, bottom: 0, height: `${rms}%`, background: "linear-gradient(0deg,#3ddc97 0%,#3ddc97 60%,#e8c25a 80%,#ff3b47 100%)" }
                  : { top: 0, bottom: 0, left: 0, width: `${rms}%`, background: "linear-gradient(90deg,#3ddc97 0%,#3ddc97 60%,#e8c25a 80%,#ff3b47 100%)" }
              }
            />
            <div className="absolute bg-white" style={vertical ? { left: 0, right: 0, bottom: `${peak}%`, height: 1 } : { top: 0, bottom: 0, left: `${peak}%`, width: 1 }} />
          </div>
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="px-1.5 py-0.5 border border-white/15 bg-white/5 text-[10px] font-mono text-ivory/80">{children}</kbd>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block w-3.5 h-3.5 border border-gold/40 border-t-gold-bright rounded-full animate-spin ${className}`} />;
}
