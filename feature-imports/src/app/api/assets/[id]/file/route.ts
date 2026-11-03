import { db } from "@/db";
import { assets } from "@/db/schema";
import { UPLOAD_DIR, ensureDirs, extForMime, safeName, writeBodyToFile } from "@/lib/server/storage";
import { eq } from "drizzle-orm";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(assets).where(eq(assets.id, Number(id)));
  if (!row?.filePath || !existsSync(row.filePath)) return new Response("Not found", { status: 404 });
  const total = statSync(row.filePath).size;
  const range = req.headers.get("range");
  const headers: Record<string, string> = {
    "Content-Type": row.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${safeName(row.name)}.${extForMime(row.mime)}"`,
  };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (start >= total || start < 0) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    end = Math.min(end, total - 1);
    const stream = createReadStream(row.filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = createReadStream(row.filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(total) } });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(assets).where(eq(assets.id, Number(id)));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  ensureDirs();
  const mime = req.headers.get("content-type") || row.mime;
  const filePath = path.join(UPLOAD_DIR, `${row.id}_${safeName(row.name)}.${extForMime(mime)}`);
  try {
    await writeBodyToFile(req.body, filePath);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
  const size = statSync(filePath).size;
  const [updated] = await db
    .update(assets)
    .set({ filePath, size, mime: mime || row.mime, status: "ready" })
    .where(eq(assets.id, row.id))
    .returning();
  return Response.json({ ok: true, id: updated.id, size });
}
