"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Wheel } from "@/lib/types";
import { wheelToRgb } from "@/lib/looks";
import { clamp, cn } from "@/lib/utils";

export function toast(text: string, tone: "info" | "success" | "error" = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("lumiere:toast", { detail: { text, tone } }));
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("py-3", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h4 className="eyebrow flex items-center gap-2">
          <span className="inline-block h-1 w-1 rotate-45 bg-gold" />
          {title}
        </h4>
        {right}
      </div>
      {children}
    </section>
  );
}

interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  format?: (v: number) => string;
  reset?: number;
  bipolar?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Slider({ label, value, min, max, step = 0.01, onChange, onStart, format, reset, bipolar, disabled, className }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const pct = clamp((value - min) / (max - min), 0, 1);
  const zero = bipolar ? clamp(((reset ?? 0) - min) / (max - min), 0, 1) : 0;
  const update = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    const raw = min + p * (max - min);
    const v = Math.round(raw / step) * step;
    onChange(Number(clamp(v, min, max).toFixed(4)));
  };
  return (
    <div className={cn("group select-none", disabled && "pointer-events-none opacity-40", className)}>
      {label && (
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="text-mist transition group-hover:text-ivory">{label}</span>
          <span className={cn("tc text-[10.5px]", drag ? "text-gold-hi" : "text-smoke")}>{format ? format(value) : value.toFixed(2)}</span>
        </div>
      )}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        className="focus-ring relative h-4 cursor-ew-resize touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          onStart?.();
          setDrag(true);
          update(e.clientX);
        }}
        onPointerMove={(e) => drag && update(e.clientX)}
        onPointerUp={() => setDrag(false)}
        onDoubleClick={() => {
          if (reset !== undefined) {
            onStart?.();
            onChange(reset);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            onStart?.();
            const d = (e.key === "ArrowRight" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(Number(clamp(value + d, min, max).toFixed(4)));
          }
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <div
          className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-gold-lo to-gold-hi"
          style={{ left: `${Math.min(zero, pct) * 100}%`, width: `${Math.abs(pct - zero) * 100}%` }}
        />
        {bipolar && <div className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/25" style={{ left: `${zero * 100}%` }} />}
        <div
          className={cn(
            "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold-hi/80 bg-ink shadow-[0_0_12px_rgba(216,181,122,0.35)] transition-transform",
            drag && "scale-125 bg-gold",
          )}
          style={{ left: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export function Knob({ label, value, min, max, onChange, onStart, format, reset, size = 46 }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onStart?: () => void; format?: (v: number) => string; reset?: number; size?: number }) {
  const start = useRef<{ y: number; v: number } | null>(null);
  const p = clamp((value - min) / (max - min), 0, 1);
  const ang = -135 + p * 270;
  const r = size / 2 - 4;
  const arc = (from: number, to: number) => {
    const a0 = ((from - 90) * Math.PI) / 180, a1 = ((to - 90) * Math.PI) / 180;
    const x0 = size / 2 + r * Math.cos(a0), y0 = size / 2 + r * Math.sin(a0);
    const x1 = size / 2 + r * Math.cos(a1), y1 = size / 2 + r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <div className="flex select-none flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        className="cursor-ns-resize touch-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          onStart?.();
          start.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const d = (start.current.y - e.clientY) / 160;
          onChange(Number(clamp(start.current.v + d * (max - min), min, max).toFixed(3)));
        }}
        onPointerUp={() => (start.current = null)}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
      >
        <circle cx={size / 2} cy={size / 2} r={r - 5} fill="url(#knobfill)" stroke="rgba(232,212,170,0.12)" />
        <defs>
          <radialGradient id="knobfill" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#2a2a30" />
            <stop offset="100%" stopColor="#0c0c0e" />
          </radialGradient>
        </defs>
        <path d={arc(-135, 135)} stroke="rgba(255,255,255,0.08)" strokeWidth={2} fill="none" strokeLinecap="round" />
        {p > 0.002 && <path d={arc(-135, ang)} stroke="#d8b57a" strokeWidth={2} fill="none" strokeLinecap="round" />}
        <line
          x1={size / 2}
          y1={size / 2}
          x2={size / 2 + (r - 9) * Math.cos(((ang - 90) * Math.PI) / 180)}
          y2={size / 2 + (r - 9) * Math.sin(((ang - 90) * Math.PI) / 180)}
          stroke="#f3dfb1"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
      <div className="text-center leading-tight">
        <div className="text-[9.5px] uppercase tracking-[0.18em] text-mist">{label}</div>
        <div className="tc text-[10px] text-gold">{format ? format(value) : value.toFixed(2)}</div>
      </div>
    </div>
  );
}

export function ColorWheel({ label, value, onChange, onStart, size = 112 }: { label: string; value: Wheel; onChange: (w: Wheel) => void; onStart?: () => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const R = size / 2 - 6;
  const set = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    let x = (cx - r.left - r.width / 2) / R;
    let y = -(cy - r.top - r.height / 2) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    onChange({ ...value, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
  };
  const rgb = wheelToRgb(value, 1, 1);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="eyebrow !text-[9px] !tracking-[0.3em] text-mist">{label}</div>
      <div
        ref={ref}
        className="relative cursor-crosshair touch-none rounded-full"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          onStart?.();
          setDrag(true);
          set(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => drag && set(e.clientX, e.clientY)}
        onPointerUp={() => setDrag(false)}
        onDoubleClick={() => {
          onStart?.();
          onChange({ x: 0, y: 0, m: value.m });
        }}
      >
        <div className="absolute inset-0 rounded-full p-[1px]" style={{ background: "linear-gradient(140deg, rgba(243,223,177,0.5), rgba(156,122,69,0.1), rgba(243,223,177,0.35))" }}>
          <div className="relative h-full w-full overflow-hidden rounded-full">
            <div className="absolute inset-0" style={{ background: "conic-gradient(from 90deg, #ff3b3b, #ff3bff, #3b5bff, #3bffff, #3bff5b, #ffff3b, #ff3b3b)", opacity: 0.55 }} />
            <div className="absolute inset-0" style={{ background: "radial-gradient(circle, rgba(22,22,26,1) 0%, rgba(22,22,26,0.82) 30%, rgba(22,22,26,0.15) 78%, rgba(22,22,26,0) 100%)" }} />
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/5" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-white/5" />
          </div>
        </div>
        <div
          className={cn("absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ivory shadow-[0_0_10px_rgba(0,0,0,0.8)]", drag && "scale-110")}
          style={{ left: size / 2 + value.x * R, top: size / 2 - value.y * R, background: `rgb(${128 + rgb[0] * 300}, ${128 + rgb[1] * 300}, ${128 + rgb[2] * 300})` }}
        />
      </div>
      <Slider value={value.m} min={-1} max={1} step={0.01} reset={0} bipolar onStart={onStart} onChange={(m) => onChange({ ...value, m })} className="w-full" />
      <div className="tc flex gap-2 text-[9.5px]">
        <span className="text-[#ff7b7b]">{(rgb[0] * 100).toFixed(0)}</span>
        <span className="text-[#7bff9b]">{(rgb[1] * 100).toFixed(0)}</span>
        <span className="text-[#7bb0ff]">{(rgb[2] * 100).toFixed(0)}</span>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="focus-ring group flex w-full items-center justify-between gap-3 py-1 text-left">
      <span className="min-w-0">
        {label && <span className="block text-[12px] text-ivory/90">{label}</span>}
        {hint && <span className="block text-[10.5px] text-smoke">{hint}</span>}
      </span>
      <span className={cn("relative h-[18px] w-[32px] shrink-0 rounded-full border transition", checked ? "border-gold/70 bg-gold/25" : "border-line-2 bg-white/5")}>
        <span className={cn("absolute top-[2px] h-3 w-3 rounded-full transition-all", checked ? "left-[16px] bg-gold-hi shadow-[0_0_10px_rgba(216,181,122,0.8)]" : "left-[2px] bg-mist")} />
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, className, size = "md" }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("inline-flex rounded-full border border-line bg-white/[0.02] p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "focus-ring flex-1 whitespace-nowrap rounded-full font-semibold tracking-wide transition",
            size === "sm" ? "px-2.5 py-1 text-[10.5px]" : "px-3.5 py-1.5 text-[11.5px]",
            o.value === value ? "bg-gradient-to-b from-gold-hi/90 to-gold/90 text-[#1a140b] shadow-[0_4px_16px_-4px_rgba(216,181,122,0.6)]" : "text-mist hover:text-ivory",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ db, peak, vertical = false, className }: { db: number; peak?: number; vertical?: boolean; className?: string }) {
  const p = clamp((db + 60) / 60, 0, 1);
  const pk = peak !== undefined ? clamp((peak + 60) / 60, 0, 1) : null;
  return (
    <div className={cn("relative overflow-hidden rounded-sm bg-white/[0.04]", vertical ? "h-full w-2" : "h-2 w-full", className)}>
      <div
        className="absolute"
        style={
          vertical
            ? { bottom: 0, left: 0, right: 0, height: `${p * 100}%`, background: "linear-gradient(0deg, #4fae7f 0%, #63c394 60%, #d8b57a 82%, #d6324a 100%)", backgroundSize: "100% calc(100% / " + Math.max(p, 0.01) + ")", backgroundPosition: "bottom" }
            : { top: 0, bottom: 0, left: 0, width: `${p * 100}%`, background: "linear-gradient(90deg, #4fae7f 0%, #63c394 60%, #d8b57a 82%, #d6324a 100%)", backgroundSize: "calc(100% / " + Math.max(p, 0.01) + ") 100%" }
        }
      />
      {pk !== null && (
        <div className={cn("absolute bg-ivory", vertical ? "left-0 right-0 h-[2px]" : "top-0 bottom-0 w-[2px]")} style={vertical ? { bottom: `${pk * 100}%` } : { left: `${pk * 100}%` }} />
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-3.5 w-3.5 animate-spin rounded-full border border-gold/30 border-t-gold", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="tc rounded border border-line-2 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-mist">{children}</kbd>;
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-gold/70">{icon}</div>}
      <div className="font-display text-2xl italic text-ivory">{title}</div>
      {body && <p className="max-w-sm text-[12.5px] leading-relaxed text-mist">{body}</p>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, children, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="lux-glass animate-rise max-h-[90vh] w-full overflow-auto rounded-2xl scroll-thin" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
