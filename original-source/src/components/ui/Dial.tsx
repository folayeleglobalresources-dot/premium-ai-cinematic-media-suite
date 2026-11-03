"use client";

import { useCallback, useRef } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (v: number) => void;
  onReset?: () => void;
  size?: number;
  disabled?: boolean;
  accent?: boolean;
};

export function Dial({ label, value, min, max, step = 0.01, display, onChange, onReset, size = 72, disabled, accent = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; v: number } | null>(null);
  const range = max - min;
  const t = Math.max(0, Math.min(1, (value - min) / range));
  const startAngle = -135;
  const sweep = 270;
  const angle = startAngle + t * sweep;
  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const polar = (deg: number, rad: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from, r);
    const [x2, y2] = polar(to, r);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const zeroT = min < 0 && max > 0 ? -min / range : 0;
  const zeroAngle = startAngle + zeroT * sweep;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      start.current = { y: e.clientY, v: value };
    },
    [value, disabled],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || disabled) return;
      const dy = start.current.y - e.clientY;
      const fine = e.shiftKey ? 0.25 : 1;
      let v = start.current.v + (dy / 160) * range * fine;
      v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      onChange(+v.toFixed(4));
    },
    [range, step, min, max, onChange, disabled],
  );
  const onPointerUp = useCallback(() => {
    start.current = null;
  }, []);

  const [kx, ky] = polar(angle, r - 9);

  return (
    <div
      ref={ref}
      className={`flex flex-col items-center gap-1 select-none ${disabled ? "opacity-35" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onReset?.()}
      onWheel={(e) => {
        if (disabled) return;
        e.preventDefault();
        const dir = e.deltaY > 0 ? -1 : 1;
        const v = Math.max(min, Math.min(max, value + dir * step * (e.shiftKey ? 1 : 5)));
        onChange(+v.toFixed(4));
      }}
      title={`${label} — drag vertically, scroll, double-click to reset`}
      style={{ touchAction: "none", cursor: disabled ? "default" : "ns-resize" }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <path d={arc(startAngle, startAngle + sweep)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
        {Array.from({ length: 11 }).map((_, i) => {
          const a = startAngle + (i / 10) * sweep;
          const [x1, y1] = polar(a, r + 3);
          const [x2, y2] = polar(a, r + (i % 5 === 0 ? 7 : 5));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />;
        })}
        {zeroT > 0 ? (
          <path
            d={angle > zeroAngle ? arc(zeroAngle, angle) : arc(angle, zeroAngle)}
            fill="none"
            stroke={accent ? "var(--accent)" : "#9ad"}
            strokeWidth={2}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 6px rgba(var(--accent-rgb),0.6))" }}
          />
        ) : (
          <path d={arc(startAngle, Math.max(startAngle + 0.01, angle))} fill="none" stroke={accent ? "var(--accent)" : "#9ad"} strokeWidth={2} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(var(--accent-rgb),0.6))" }} />
        )}
        <circle cx={cx} cy={cy} r={r - 12} fill="url(#dialFace)" stroke="rgba(255,255,255,0.08)" />
        <defs>
          <radialGradient id="dialFace" cx="40%" cy="35%">
            <stop offset="0" stopColor="#23232c" />
            <stop offset="1" stopColor="#0c0c10" />
          </radialGradient>
        </defs>
        <circle cx={kx} cy={ky} r={2.4} fill="var(--accent-bright)" style={{ filter: "drop-shadow(0 0 4px rgba(var(--accent-rgb),0.9))" }} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.15} fill="#f3efe6" fontFamily="var(--font-mono)" style={{ letterSpacing: "0.02em" }}>
          {display ?? value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}
        </text>
      </svg>
      <span className="eyebrow !text-[8px] !tracking-[0.22em] text-center leading-tight">{label}</span>
    </div>
  );
}
