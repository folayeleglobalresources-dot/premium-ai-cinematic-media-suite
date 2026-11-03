import { db } from "@/db";
import { assets } from "@/db/schema";
import { toAssetDTO } from "@/lib/server/dto";
import { THUMB_DIR, dataUrlToBuffer, ensureDirs } from "@/lib/server/storage";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { writeFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const projectId = url.searchParams.get("projectId");
  const conds: SQL[] = [];
  if (kind) conds.push(eq(assets.kind, kind));
  if (projectId) conds.push(eq(assets.projectId, Number(projectId)));
  const rows = await db
    .select()
    .from(assets)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(assets.createdAt));
  return Response.json(rows.map(toAssetDTO));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    ensureDirs();
    const [row] = await db
      .insert(assets)
      .values({
        name: String(body.name ?? "Untitled").slice(0, 200),
        kind: ["video", "image", "audio"].includes(body.kind) ? body.kind : "video",
        mime: String(body.mime ?? "application/octet-stream"),
        size: Number(body.size ?? body.sizeBytes ?? 0),
        durationMs: Math.round(Number(body.durationMs ?? Number(body.durationSec ?? 0) * 1000)),
        width: Math.round(Number(body.width ?? 0)),
        height: Math.round(Number(body.height ?? 0)),
        fps: Number(body.fps ?? 0),
        lookId: body.lookId ?? null,
        source: String(body.source ?? "studio"),
        metadata: {
          ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
          slate: body.slate ?? {},
          filmstrip: body.filmstrip ?? [],
          peaks: body.peaks ?? [],
          analysis: body.analysis ?? {},
          captions: body.captions ?? [],
          rating: Number(body.rating ?? 0),
          thumbnail: typeof body.thumbnail === "string" ? body.thumbnail : null,
        },
        projectId: body.projectId ? Number(body.projectId) : null,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        status: "pending",
      })
      .returning();
    let thumbPath: string | null = null;
    if (typeof body.thumbDataUrl === "string" || typeof body.thumbnail === "string") {
      const parsed = dataUrlToBuffer(String(body.thumbDataUrl ?? body.thumbnail));
      if (parsed) {
        thumbPath = path.join(THUMB_DIR, `${row.id}.jpg`);
        await writeFile(thumbPath, parsed.buffer);
      }
    }
    if (thumbPath) {
      const [updated] = await db.update(assets).set({ thumbPath }).where(eq(assets.id, row.id)).returning();
      const dto = toAssetDTO(updated);
      return Response.json({ ...dto, asset: dto }, { status: 201 });
    }
    const dto = toAssetDTO(row);
    return Response.json({ ...dto, asset: dto }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to create asset" }, { status: 400 });
  }
}
