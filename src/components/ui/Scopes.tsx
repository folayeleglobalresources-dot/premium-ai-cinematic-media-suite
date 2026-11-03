"use client";

import { useEffect, useRef, useState } from "react";

export type ScopeMode = "histogram" | "waveform" | "parade" | "vectorscope";

type Props = {
  /** RGBA sample buffer (e.g. 192×108) */
  data: Uint8ClampedArray | null;
  width: number;
  height: number;
  mode?: ScopeMode;
  compact?: boolean;
  onModeChange?: (m: ScopeMode) => void;
};

const MODES: ScopeMode[] = ["histogram", "waveform", "parade", "vectorscope"];

export function Scopes({ data, width, height, mode: controlled, compact, onModeChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [internal, setInternal] = useState<ScopeMode>("waveform");
  const mode = controlled ?? internal;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return;
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(6,6,9,0.9)";
    ctx.fillRect(0, 0, W, H);

    const n = width * height;
    const grid = (lines: number) => {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let i = 1; i < lines; i++) {
        const y = (H * i) / lines;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
      }
    };

    if (mode === "histogram") {
      const r = new Float32Array(64);
      const g = new Float32Array(64);
      const b = new Float32Array(64);
      const l = new Float32Array(64);
      for (let i = 0; i < n; i++) {
        const R = data[i * 4];
        const G = data[i * 4 + 1];
        const B = data[i * 4 + 2];
        r[R >> 2]++;
        g[G >> 2]++;
        b[B >> 2]++;
        l[Math.min(63, Math.round((0.2126 * R + 0.7152 * G + 0.0722 * B) / 4))]++;
      }
      const max = Math.max(1, ...Array.from(l), ...Array.from(r), ...Array.from(g), ...Array.from(b)) * 0.9;
      grid(4);
      const draw = (arr: Float32Array, color: string) => {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i < 64; i++) {
          const x = (i / 63) * W;
          const y = H - Math.min(H, (arr[i] / max) * H);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      ctx.globalCompositeOperation = "lighter";
      draw(r, "rgba(255,70,70,0.35)");
      draw(g, "rgba(80,255,120,0.35)");
      draw(b, "rgba(90,140,255,0.35)");
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      for (let i = 0; i < 64; i++) {
        const x = (i / 63) * W;
        const y = H - Math.min(H, (l[i] / max) * H);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(243,239,230,0.9)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (mode === "waveform" || mode === "parade") {
      grid(5);
      const img = ctx.createImageData(W, H);
      const px = img.data;
      const plot = (x: number, y: number, r: number, g: number, b: number, a: number) => {
        const xi = Math.max(0, Math.min(W - 1, x | 0));
        const yi = Math.max(0, Math.min(H - 1, y | 0));
        const o = (yi * W + xi) * 4;
        px[o] = Math.min(255, px[o] + r);
        px[o + 1] = Math.min(255, px[o + 1] + g);
        px[o + 2] = Math.min(255, px[o + 2] + b);
        px[o + 3] = Math.min(255, px[o + 3] + a);
      };
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const R = data[i];
          const G = data[i + 1];
          const B = data[i + 2];
          if (mode === "waveform") {
            const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
            plot((x / width) * W, H - (L / 255) * H, 60, 220, 120, 70);
          } else {
            const third = W / 3;
            plot((x / width) * third, H - (R / 255) * H, 255, 50, 50, 60);
            plot(third + (x / width) * third, H - (G / 255) * H, 50, 255, 90, 60);
            plot(third * 2 + (x / width) * third, H - (B / 255) * H, 70, 120, 255, 60);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ["100", "75", "50", "25", "0"].forEach((lbl, i) => ctx.fillText(lbl, 3, (H * i) / 4 + (i === 0 ? 10 : i === 4 ? -3 : 3)));
    } else {
      // vectorscope
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2 - 4;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();
      // skin tone line (~123° in vectorscope convention: between red and yellow)
      const skinA = (-33 * Math.PI) / 180;
      ctx.strokeStyle = "rgba(212,175,106,0.7)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(skinA) * R, cy + Math.sin(skinA) * R);
      ctx.stroke();
      ctx.setLineDash([]);
      const targets: [string, number, number][] = [
        ["R", 0.615, -0.515],
        ["Mg", 0.615, 0.475],
        ["B", -0.1, 0.99],
        ["Cy", -0.615, 0.515],
        ["G", -0.615, -0.475],
        ["Yl", 0.1, -0.99],
      ];
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (const [lbl, cr, cb] of targets) {
        const x = cx + cb * R * 0.75;
        const y = cy - cr * R * 0.75;
        ctx.strokeRect(x - 4, y - 4, 8, 8);
        ctx.fillText(lbl, x + 6, y - 6);
      }
      const img = ctx.getImageData(0, 0, W, H);
      const px = img.data;
      for (let i = 0; i < n; i += 1) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const cb = (-0.1146 * r - 0.3854 * g + 0.5 * b) / 255;
        const cr = (0.5 * r - 0.4542 * g - 0.0458 * b) / 255;
        const x = Math.round(cx + cb * R * 1.5);
        const y = Math.round(cy - cr * R * 1.5);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const o = (y * W + x) * 4;
        px[o] = Math.min(255, px[o] + 40 + r * 0.3);
        px[o + 1] = Math.min(255, px[o + 1] + 40 + g * 0.3);
        px[o + 2] = Math.min(255, px[o + 2] + 40 + b * 0.3);
        px[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
  }, [data, width, height, mode]);

  return (
    <div className="flex flex-col gap-1.5">
      <canvas ref={ref} width={compact ? 240 : 320} height={compact ? 120 : 160} className="w-full h-auto border border-white/10" />
      <div className="flex gap-1 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m}
            className={`chip ${mode === m ? "active" : ""}`}
            onClick={() => {
              setInternal(m);
              onModeChange?.(m);
            }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
