"use client";

import { fetchJSON, formatDuration } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../ui/Controls";

type Row = { id: number; name: string; description: string; fps: number; width: number; height: number; updatedAt: string; timelineId: number | null; durationMs: number };

const PRESETS = [
  { label: "Cinema 4K DCI", width: 4096, height: 1716, fps: 24 },
  { label: "UHD 4K", width: 3840, height: 2160, fps: 24 },
  { label: "HD 1080p", width: 1920, height: 1080, fps: 24 },
  { label: "Broadcast 1080p50", width: 1920, height: 1080, fps: 50 },
  { label: "Social 9:16", width: 1080, height: 1920, fps: 30 },
  { label: "Square", width: 1080, height: 1080, fps: 30 },
];

export function ProjectsPanel({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(2);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const p = PRESETS[preset];
      const r = await fetchJSON<{ project: { id: number }; timeline: { id: number } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: name || "Untitled Picture", width: p.width, height: p.height, fps: p.fps, aspect: `${p.width}:${p.height}` }),
      });
      router.push(`/editor/${r.timeline.id}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this project and its sequences? Footage stays in the Vault.")) return;
    await fetchJSON(`/api/projects/${id}`, { method: "DELETE" });
    setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <div className="backdrop-cine min-h-screen px-6 md:px-12 py-10 md:py-16">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_380px] gap-10">
        <div>
          <div className="eyebrow mb-3 reveal">Cutting Room</div>
          <h1 className="display text-5xl md:text-7xl mb-10 reveal reveal-2">
            Your <span className="gold-text italic">pictures</span>
          </h1>
          {rows.length ? (
            <div className="grid sm:grid-cols-2 gap-4 reveal reveal-3">
              {rows.map((p) => (
                <div key={p.id} className="group glass p-5 flex flex-col gap-3 hover:border-gold/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="display text-2xl truncate">{p.name}</div>
                      <div className="readout text-[10px] text-muted mt-1">
                        {p.width}×{p.height} · {p.fps} fps · {formatDuration(p.durationMs / 1000)}
                      </div>
                    </div>
                    <button className="text-muted hover:text-crimson text-[10px] tracking-[0.2em] uppercase font-mono opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => remove(p.id)}>
                      Delete
                    </button>
                  </div>
                  <div className="text-[11px] text-muted">Updated {new Date(p.updatedAt).toLocaleString()}</div>
                  {p.timelineId ? (
                    <Link href={`/editor/${p.timelineId}`} className="btn btn-sm self-start">
                      Open sequence
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="glass p-10 text-center text-muted text-sm">No projects yet — create one on the right, or open a take from the Studio.</div>
          )}
        </div>
        <aside className="glass-strong p-6 flex flex-col gap-4 self-start reveal reveal-3">
          <div className="eyebrow">New picture</div>
          <input className="field" placeholder="Working title" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            {PRESETS.map((p, i) => (
              <button key={p.label} className={`flex items-center justify-between px-3 py-2 border text-left transition-colors ${preset === i ? "border-gold/70 bg-gold/10" : "border-white/10 hover:border-white/30"}`} onClick={() => setPreset(i)}>
                <span className="text-[12px]">{p.label}</span>
                <span className="readout text-[10px] text-muted">
                  {p.width}×{p.height} · {p.fps}
                </span>
              </button>
            ))}
          </div>
          <button className="btn btn-solid" onClick={create} disabled={busy}>
            {busy ? <Spinner /> : null} Create & open
          </button>
          <p className="text-[10px] text-muted leading-relaxed">Sequences autosave. Footage from the Studio and imports live in the Vault and can be used across every project.</p>
        </aside>
      </div>
    </div>
  );
}
