import { db } from "@/db";
import { assets } from "@/db/schema";
import { toAssetDTO } from "@/lib/server/dto";
import { removeQuietly } from "@/lib/server/storage";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(assets).where(eq(assets.id, Number(id)));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(toAssetDTO(row));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Partial<typeof assets.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 200);
  if (typeof body.favorite === "boolean") patch.favorite = body.favorite;
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);
  if (body.lookId !== undefined) patch.lookId = body.lookId;
  if (body.projectId !== undefined) patch.projectId = body.projectId ? Number(body.projectId) : null;
  if (typeof body.durationMs === "number") patch.durationMs = Math.round(body.durationMs);
  if (typeof body.width === "number") patch.width = Math.round(body.width);
  if (typeof body.height === "number") patch.height = Math.round(body.height);
  if (body.metadata && typeof body.metadata === "object") patch.metadata = body.metadata;
  const [row] = await db.update(assets).set(patch).where(eq(assets.id, Number(id))).returning();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(toAssetDTO(row));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.delete(assets).where(eq(assets.id, Number(id))).returning();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  await removeQuietly(row.filePath);
  await removeQuietly(row.thumbPath);
  return Response.json({ ok: true });
}
