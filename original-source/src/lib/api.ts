import fixWebmDuration from "fix-webm-duration";
import type { AssetDTO } from "./types";

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const assetFileUrl = (id: number) => `/api/assets/${id}/file`;
export const assetThumbUrl = (id: number) => `/api/assets/${id}/thumb`;

export function formatBytes(b: number) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatTimecode(sec: number, fps = 24) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const f = Math.floor((s - Math.floor(s)) * fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(ss)}:${p(f)}`;
}

export function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type CodecOption = { id: string; label: string; mime: string; ext: string; supported: boolean };

export function codecOptions(): CodecOption[] {
  const list: Omit<CodecOption, "supported">[] = [
    { id: "h264-mp4", label: "H.264 / MP4 (universal)", mime: "video/mp4;codecs=avc1.640028,mp4a.40.2", ext: "mp4" },
    { id: "hevc-mp4", label: "HEVC / MP4 (10-bit class)", mime: "video/mp4;codecs=hvc1.1.6.L153.B0,mp4a.40.2", ext: "mp4" },
    { id: "av1-mp4", label: "AV1 / MP4 (next-gen)", mime: "video/mp4;codecs=av01.0.08M.08,mp4a.40.2", ext: "mp4" },
    { id: "vp9-webm", label: "VP9 / WebM (high quality)", mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { id: "av1-webm", label: "AV1 / WebM", mime: "video/webm;codecs=av01,opus", ext: "webm" },
    { id: "h264-webm", label: "H.264 / WebM", mime: "video/webm;codecs=h264,opus", ext: "webm" },
    { id: "vp8-webm", label: "VP8 / WebM (compatibility)", mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  ];
  const has = typeof MediaRecorder !== "undefined";
  return list.map((c) => ({ ...c, supported: has && MediaRecorder.isTypeSupported(c.mime) }));
}

export function pickCodec(preferred: string): CodecOption | null {
  const opts = codecOptions();
  if (preferred !== "auto") {
    const p = opts.find((o) => o.id === preferred && o.supported);
    if (p) return p;
  }
  return opts.find((o) => o.supported) ?? null;
}

export async function finalizeRecording(blob: Blob, durationMs: number, mime: string): Promise<Blob> {
  if (mime.includes("webm") && durationMs > 0) {
    try {
      const fixed = await fixWebmDuration(blob, durationMs, { logger: false });
      return fixed;
    } catch {
      return blob;
    }
  }
  return blob;
}

export function probeVideo(url: string): Promise<{ durationMs: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve({
        durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
        width: v.videoWidth,
        height: v.videoHeight,
      });
      v.src = "";
    };
    v.onloadedmetadata = () => {
      if (v.duration === Infinity) {
        v.currentTime = 1e101;
        v.ontimeupdate = () => {
          v.ontimeupdate = null;
          v.currentTime = 0;
          finish();
        };
      } else finish();
    };
    v.onerror = () => finish();
    setTimeout(finish, 6000);
    v.src = url;
  });
}

export function probeImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export function probeAudio(url: string): Promise<{ durationMs: number }> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve({ durationMs: Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0 });
    a.onerror = () => resolve({ durationMs: 0 });
    setTimeout(() => resolve({ durationMs: 0 }), 5000);
    a.src = url;
  });
}

export function thumbFromSource(src: CanvasImageSource, w: number, h: number): string | null {
  try {
    const c = document.createElement("canvas");
    const tw = 480;
    const th = Math.max(1, Math.round((tw * h) / Math.max(1, w)));
    c.width = tw;
    c.height = th;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, tw, th);
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

export function thumbFromVideoUrl(url: string, atSec = 0.5): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    let done = false;
    const finish = (val: string | null) => {
      if (done) return;
      done = true;
      resolve(val);
      v.src = "";
    };
    v.onloadeddata = () => {
      const t = Number.isFinite(v.duration) && v.duration > atSec ? atSec : 0;
      if (t > 0) v.currentTime = t;
      else finish(thumbFromSource(v, v.videoWidth, v.videoHeight));
    };
    v.onseeked = () => finish(thumbFromSource(v, v.videoWidth, v.videoHeight));
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
    v.src = url;
  });
}

export type UploadInput = {
  blob: Blob;
  name: string;
  kind: "video" | "image" | "audio";
  mime: string;
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  lookId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
  thumbDataUrl?: string | null;
  projectId?: number | null;
  onProgress?: (p: number) => void;
};

export async function uploadAsset(input: UploadInput): Promise<AssetDTO> {
  const meta = await fetchJSON<AssetDTO>("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      kind: input.kind,
      mime: input.mime,
      size: input.blob.size,
      durationMs: input.durationMs ?? 0,
      width: input.width ?? 0,
      height: input.height ?? 0,
      fps: input.fps ?? 0,
      lookId: input.lookId ?? null,
      source: input.source ?? "studio",
      metadata: input.metadata ?? {},
      thumbDataUrl: input.thumbDataUrl ?? null,
      projectId: input.projectId ?? null,
    }),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/assets/${meta.id}/file`);
    xhr.setRequestHeader("Content-Type", input.mime || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) input.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(input.blob);
  });
  return fetchJSON<AssetDTO>(`/api/assets/${meta.id}`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
