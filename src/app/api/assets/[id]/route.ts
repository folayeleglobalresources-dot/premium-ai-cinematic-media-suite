import { db } from "@/db";
import { assets } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<typeof assets.$inferInsert> = {};
  if (typeof b.name === "string") patch.name = b.name.slice(0, 200);
  if (typeof b.rating === "number") patch.rating = Math.max(0, Math.min(5, Math.round(b.rating)));
  if (typeof b.favorite === "boolean") patch.favorite = b.favorite;
  if (Array.isArray(b.tags)) patch.tags = (b.tags as string[]).slice(0, 30);
  if (b.slate && typeof b.slate === "object") patch.slate = b.slate as Record<string, string>;
  if (b.analysis && typeof b.analysis === "object") patch.analysis = b.analysis as Record<string, unknown>;
  if (Array.isArray(b.captions)) patch.captions = b.captions as { start: number; end: number; text: string }[];
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to update" }, { status: 400 });
  const [row] = await db.update(assets).set(patch).where(eq(assets.id, id)).returning();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ asset: row });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(assets).where(eq(assets.id, id));
  return Response.json({ ok: true });
}
