import { mkdirSync, existsSync, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const THUMB_DIR = path.join(DATA_DIR, "thumbs");

export function ensureDirs() {
  for (const d of [DATA_DIR, UPLOAD_DIR, THUMB_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export function extForMime(mime: string, fallback = "bin") {
  const m = mime.toLowerCase();
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("matroska")) return "mkv";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("aac")) return "aac";
  return fallback;
}

export async function writeBodyToFile(body: ReadableStream<Uint8Array> | null, filePath: string) {
  ensureDirs();
  if (!body) throw new Error("Empty body");
  const nodeStream = Readable.fromWeb(body as import("stream/web").ReadableStream<Uint8Array>);
  await pipeline(nodeStream, createWriteStream(filePath));
}

export async function removeQuietly(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    /* ignore */
  }
}

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { buffer: Buffer.from(m[2], "base64"), mime: m[1] };
}
