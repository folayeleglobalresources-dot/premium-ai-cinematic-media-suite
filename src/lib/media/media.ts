"use client";

import type { AssetDTO, AssetMeta } from "../types";
import { jsonFetch, uid } from "../utils";

const DB_NAME = "lumiere-media";
const STORE = "blobs";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const putBlob = (id: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, id));
export const getBlob = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteBlob = (id: string) => tx("readwrite", (s) => s.delete(id));
export const listBlobKeys = () => tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());

const urlCache = new Map<string, string>();

export async function objectUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getBlob(id).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function revokeUrl(id: string) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
}

/* ───────────────────────── Probing ───────────────────────── */

function once(el: EventTarget, events: string[], timeout = 6000): Promise<string> {
  return new Promise((resolve) => {
    const handlers: Array<[string, EventListener]> = [];
    const done = (name: string) => {
      handlers.forEach(([e, h]) => el.removeEventListener(e, h));
      clearTimeout(timer);
      resolve(name);
    };
    for (const e of events) {
      const h = () => done(e);
      handlers.push([e, h]);
      el.addEventListener(e, h);
    }
    const timer = setTimeout(() => done("timeout"), timeout);
  });
}

export async function seekTo(v: HTMLVideoElement, t: number) {
  if (Math.abs(v.currentTime - t) < 0.001) return;
  const p = once(v, ["seeked", "error"], 3500);
  v.currentTime = t;
  await p;
}

async function fixInfiniteDuration(el: HTMLMediaElement, hint?: number): Promise<number> {
  if (Number.isFinite(el.duration) && el.duration > 0) return el.duration;
  const p = once(el, ["durationchange", "timeupdate"], 4000);
  el.currentTime = 1e7;
  await p;
  const d = el.duration;
  el.currentTime = 0;
  await once(el, ["seeked"], 1500);
  if (Number.isFinite(d) && d > 0) return d;
  return hint ?? 0;
}

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  thumbnail: string | null;
  filmstrip: string[];
}

export function kindFromMime(mime: string, name = ""): AssetMeta["kind"] {
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(name)) return "image";
  if (mime.startsWith("audio/") || /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(name)) return "audio";
  return "video";
}

export async function probe(blob: Blob, kind: AssetMeta["kind"], durationHint?: number): Promise<ProbeResult> {
  const url = URL.createObjectURL(blob);
  try {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      const tw = 320;
      c.width = tw;
      c.height = Math.round((tw * img.naturalHeight) / Math.max(1, img.naturalWidth));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const thumb = c.toDataURL("image/jpeg", 0.7);
      return { duration: 5, width: img.naturalWidth, height: img.naturalHeight, thumbnail: thumb, filmstrip: [thumb] };
    }
    if (kind === "audio") {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.src = url;
      await once(a, ["loadedmetadata", "error"]);
      const duration = await fixInfiniteDuration(a, durationHint);
      return { duration, width: 0, height: 0, thumbnail: null, filmstrip: [] };
    }
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await once(v, ["loadeddata", "error"], 8000);
    const duration = await fixInfiniteDuration(v, durationHint);
    const width = v.videoWidth;
    const height = v.videoHeight;
    const frames: string[] = [];
    let thumbnail: string | null = null;
    if (width && height) {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d")!;
      const count = duration > 0 ? 8 : 1;
      c.width = 176;
      c.height = Math.round((176 * height) / width);
      for (let i = 0; i < count; i++) {
        const t = duration > 0 ? Math.min(duration - 0.05, (duration * (i + 0.5)) / count) : 0;
        await seekTo(v, Math.max(0, t));
        ctx.drawImage(v, 0, 0, c.width, c.height);
        frames.push(c.toDataURL("image/jpeg", 0.6));
      }
      await seekTo(v, Math.min(duration * 0.2, Math.max(0, duration - 0.05)));
      const big = document.createElement("canvas");
      big.width = 480;
      big.height = Math.round((480 * height) / width);
      big.getContext("2d")!.drawImage(v, 0, 0, big.width, big.height);
      thumbnail = big.toDataURL("image/jpeg", 0.72);
    }
    v.removeAttribute("src");
    v.load();
    return { duration, width, height, thumbnail, filmstrip: frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let decodeCtx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!decodeCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    decodeCtx = new Ctor();
  }
  return decodeCtx;
}

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();

export async function decodeBlobAudio(blob: Blob): Promise<AudioBuffer | null> {
  if (blob.size > 400 * 1024 * 1024) return null;
  try {
    const ab = await blob.arrayBuffer();
    return await audioCtx().decodeAudioData(ab);
  } catch {
    return null;
  }
}

export function decodeAssetAudio(assetId: string): Promise<AudioBuffer | null> {
  const hit = bufferCache.get(assetId);
  if (hit) return hit;
  const p = getBlob(assetId)
    .then((b) => (b ? decodeBlobAudio(b) : null))
    .catch(() => null);
  bufferCache.set(assetId, p);
  return p;
}

export function peaksFromBuffer(buf: AudioBuffer, buckets = 640): number[] {
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const size = Math.max(1, Math.floor(ch0.length / buckets));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    const startIdx = i * size;
    const end = Math.min(ch0.length, startIdx + size);
    for (let j = startIdx; j < end; j += 16) {
      const v = Math.abs(ch0[j]) + (ch1 ? Math.abs(ch1[j]) : 0);
      if (v > peak) peak = v;
    }
    out.push(peak);
    if (peak > max) max = peak;
  }
  return out.map((v) => Math.round((v / (max || 1)) * 1000) / 1000);
}

/* ───────────────────────── Ingest ───────────────────────── */

export interface IngestOptions {
  name: string;
  source: string;
  slate?: Record<string, string>;
  tags?: string[];
  durationHint?: number;
  captions?: { start: number; end: number; text: string }[];
  projectId?: string | null;
  analysis?: Record<string, unknown>;
}

export async function ingestBlob(blob: Blob, opts: IngestOptions): Promise<AssetMeta> {
  const id = uid();
  const kind = kindFromMime(blob.type, opts.name);
  await putBlob(id, blob);
  const meta = await probe(blob, kind, opts.durationHint).catch(
    (): ProbeResult => ({ duration: opts.durationHint ?? 0, width: 0, height: 0, thumbnail: null, filmstrip: [] }),
  );
  let peaks: number[] = [];
  if (kind !== "image") {
    const buf = await decodeBlobAudio(blob);
    if (buf) {
      peaks = peaksFromBuffer(buf);
      bufferCache.set(id, Promise.resolve(buf));
    }
  }
  const record: AssetMeta = {
    id,
    name: opts.name,
    kind,
    mime: blob.type || "application/octet-stream",
    source: opts.source,
    durationSec: meta.duration,
    width: meta.width,
    height: meta.height,
    sizeBytes: blob.size,
    thumbnail: meta.thumbnail,
    filmstrip: meta.filmstrip,
    peaks,
    slate: opts.slate ?? {},
    tags: opts.tags ?? [],
    analysis: { ...(opts.analysis ?? {}), hasAudio: peaks.some((p) => p > 0.02) },
    captions: opts.captions ?? [],
    rating: 0,
    favorite: false,
    projectId: opts.projectId ?? null,
    createdAt: new Date().toISOString(),
  };
  try {
    const saved = await jsonFetch<{ asset: AssetDTO }>("/api/assets", { method: "POST", body: JSON.stringify(record) });
    const asset = dtoToAssetMeta(saved.asset);
    if (asset.id !== id) {
      await putBlob(asset.id, blob);
      await deleteBlob(id);
      const cached = bufferCache.get(id);
      if (cached) bufferCache.set(asset.id, cached);
      bufferCache.delete(id);
    }
    return asset;
  } catch (e) {
    console.warn("Asset registry unavailable, keeping local record", e);
    return record;
  }
}

function dtoToAssetMeta(dto: AssetDTO): AssetMeta {
  const meta = dto.metadata ?? {};
  const stringArray = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const numberArray = (v: unknown): number[] => Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  const captions = Array.isArray(meta.captions) ? meta.captions.filter((x): x is { start: number; end: number; text: string } => !!x && typeof x === "object" && typeof (x as { start?: unknown }).start === "number" && typeof (x as { end?: unknown }).end === "number" && typeof (x as { text?: unknown }).text === "string") : [];
  return {
    id: String(dto.id), name: dto.name, kind: dto.kind, mime: dto.mime, source: dto.source,
    durationSec: dto.durationMs / 1000, width: dto.width, height: dto.height, sizeBytes: dto.size,
    thumbnail: typeof meta.thumbnail === "string" ? meta.thumbnail : null,
    filmstrip: stringArray(meta.filmstrip), peaks: numberArray(meta.peaks),
    slate: meta.slate && typeof meta.slate === "object" ? meta.slate as Record<string, string> : {},
    tags: dto.tags ?? [], analysis: meta.analysis && typeof meta.analysis === "object" ? meta.analysis as Record<string, unknown> : {},
    captions, rating: typeof meta.rating === "number" ? meta.rating : 0, favorite: dto.favorite,
    projectId: dto.projectId == null ? null : String(dto.projectId), createdAt: dto.createdAt,
  };
}

export async function fetchAssets(): Promise<AssetMeta[]> {
  const res = await jsonFetch<{ assets: AssetDTO[] }>("/api/assets");
  return res.assets.map(dtoToAssetMeta);
}

export async function updateAsset(id: string, patch: Partial<AssetMeta>): Promise<AssetMeta | null> {
  try {
    const res = await jsonFetch<{ asset: AssetDTO }>(`/api/assets/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    return dtoToAssetMeta(res.asset);
  } catch {
    return null;
  }
}

export async function removeAsset(id: string) {
  await fetch(`/api/assets/${id}`, { method: "DELETE" }).catch(() => null);
  await deleteBlob(id).catch(() => null);
  revokeUrl(id);
}

export async function localAvailability(ids: string[]): Promise<Set<string>> {
  const keys = await listBlobKeys().catch(() => [] as IDBValidKey[]);
  const set = new Set(keys.map(String));
  return new Set(ids.filter((i) => set.has(i)));
}
