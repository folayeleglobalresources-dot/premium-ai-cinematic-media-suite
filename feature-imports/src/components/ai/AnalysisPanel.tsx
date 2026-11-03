"use client";

import { computeStats, type FrameStats } from "@/lib/analysis";
import { fetchJSON } from "@/lib/api";
import type { AnalysisReport } from "@/lib/intelligence";
import type { Grade } from "@/lib/types";
import { useState } from "react";
import { Spinner } from "../ui/Controls";

type Props = {
  /** Returns an RGBA sample of the current frame (pre-grade or post-grade is caller's choice). */
  getSample: () => { data: Uint8ClampedArray; w: number; h: number } | null;
  onApplyGrade?: (g: Partial<Grade>) => void;
  onApplyLook?: (id: string) => void;
  fps?: number;
  source?: string;
};

export function AnalysisPanel({ getSample, onApplyGrade, onApplyLook, fps, source }: Props) {
  const [report, setReport] = useState<(AnalysisReport & { sessionId?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState("cinematic");
  const [stats, setStats] = useState<FrameStats | null>(null);

  const run = async () => {
    setError(null);
    const s = getSample();
    if (!s) {
      setError("No frame available to analyse yet.");
      return;
    }
    setBusy(true);
    try {
      const st = computeStats(s.data, s.w, s.h);
      setStats(st);
      const r = await fetchJSON<AnalysisReport & { sessionId?: number }>("/api/ai/analyze", {
        method: "POST",
        body: JSON.stringify({ stats: st, intent, fps, source }),
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select className="field !py-1.5 !text-[11px] flex-1" value={intent} onChange={(e) => setIntent(e.target.value)}>
          {["cinematic", "commercial", "documentary", "editorial", "music video", "broadcast", "wedding", "horror"].map((i) => (
            <option key={i} value={i}>
              Intent: {i}
            </option>
          ))}
        </select>
        <button className="btn btn-solid btn-sm" onClick={run} disabled={busy}>
          {busy ? <Spinner /> : null} Analyse frame
        </button>
      </div>
      {error ? <div className="text-[11px] text-crimson">{error}</div> : null}
      {!report && !busy ? (
        <p className="text-[11px] text-muted leading-relaxed">
          The Director reads the live frame — luminance distribution, clipping, colour cast, chroma, skin presence, micro-contrast and tonal weight — then returns an exposure verdict, white-balance correction, lighting fixes, camera settings and a ranked set of looks with an automatic corrective grade.
        </p>
      ) : null}
      {report ? (
        <div className="flex flex-col gap-3 text-[12px] leading-relaxed">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Reading · {report.scene.confidence}% confidence</div>
              <div className="display text-[20px] text-ivory">{report.headline}</div>
            </div>
            <div className="flex flex-col items-center flex-none">
              <div className="relative w-14 h-14">
                <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray={`${report.score * 0.974} 100`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center readout text-[13px] text-gold-bright">{report.score}</span>
              </div>
              <span className="eyebrow !text-[7px]">readiness</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Card label="Exposure" value={report.exposure.verdict} sub={`${report.exposure.ev > 0 ? "+" : ""}${report.exposure.ev.toFixed(2)} EV`} body={report.exposure.detail} />
            <Card label="White balance" value={report.whiteBalance.verdict} sub={`${report.whiteBalance.kelvinShift > 0 ? "+" : ""}${report.whiteBalance.kelvinShift}K`} body={report.whiteBalance.detail} />
          </div>

          <Block label="Director's notes" body={report.notes} />
          <Block label="Colour" body={report.color} />
          <Block label="Focus & texture" body={report.focus} />
          <Block label="Composition" body={report.composition} />

          <div className="panel p-3">
            <div className="eyebrow mb-2">Lighting plan</div>
            <ol className="flex flex-col gap-1.5">
              {report.lighting.map((l, i) => (
                <li key={i} className="flex gap-2 text-ivory/85">
                  <span className="readout text-gold-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span>{l}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel p-3 grid grid-cols-5 gap-2">
            {Object.entries(report.camera).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="eyebrow !text-[7px]">{k}</div>
                <div className="readout text-[10px] text-ivory/90 break-words">{v}</div>
              </div>
            ))}
          </div>

          <div className="panel p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Corrective grade</div>
              {onApplyGrade && Object.keys(report.grade).length ? (
                <button className="btn btn-xs" onClick={() => onApplyGrade(report.grade)}>
                  Apply correction
                </button>
              ) : null}
            </div>
            {report.gradeReasons.length ? (
              <ul className="flex flex-col gap-1 text-ivory/80">
                {report.gradeReasons.map((r, i) => (
                  <li key={i}>— {r}</li>
                ))}
              </ul>
            ) : (
              <div className="text-muted">No technical correction needed.</div>
            )}
          </div>

          <div className="panel p-3 flex flex-col gap-2">
            <div className="eyebrow">Recommended looks</div>
            {report.looks.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-ivory">{l.name}</div>
                  <div className="text-muted text-[11px]">{l.why}</div>
                </div>
                {onApplyLook ? (
                  <button className="btn btn-xs btn-ghost flex-none" onClick={() => onApplyLook(l.id)}>
                    Use
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {stats ? (
            <div className="text-[10px] text-muted readout grid grid-cols-3 gap-x-3 gap-y-1">
              <span>mean {(stats.meanLuma * 100).toFixed(1)}%</span>
              <span>σ {(stats.std * 100).toFixed(1)}</span>
              <span>skin {(stats.skinRatio * 100).toFixed(1)}%</span>
              <span>clip▲ {(stats.clipHigh * 100).toFixed(2)}%</span>
              <span>clip▼ {(stats.clipLow * 100).toFixed(2)}%</span>
              <span>edges {(stats.edgeDensity * 100).toFixed(1)}%</span>
            </div>
          ) : null}
          <div className="text-[9px] text-muted tracking-[0.2em] uppercase">engine · {report.generatedBy}</div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ label, value, sub, body }: { label: string; value: string; sub: string; body: string }) {
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <div className="eyebrow !text-[7px]">{label}</div>
      <div className="flex items-baseline justify-between">
        <span className="text-ivory text-[13px]">{value}</span>
        <span className="readout text-[10px] text-gold-bright">{sub}</span>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <p className="text-ivory/85">{body}</p>
    </div>
  );
}
