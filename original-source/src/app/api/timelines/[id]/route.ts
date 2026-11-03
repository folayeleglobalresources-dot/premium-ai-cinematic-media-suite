import { db } from "@/db";
import { projects, timelines } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(timelines).where(eq(timelines.id, Number(id)));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  const [project] = row.projectId ? await db.select().from(projects).where(eq(projects.id, row.projectId)) : [null];
  return Response.json({ timeline: row, project });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Partial<typeof timelines.$inferInsert> = { updatedAt: new Date() };
  if (body.data && typeof body.data === "object") patch.data = body.data;
  if (typeof body.name === "string") patch.name = body.name.slice(0, 160);
  if (typeof body.durationMs === "number") patch.durationMs = Math.round(body.durationMs);
  const [row] = await db.update(timelines).set(patch).where(eq(timelines.id, Number(id))).returning();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  if (row.projectId) await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, row.projectId));
  return Response.json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(timelines).where(eq(timelines.id, Number(id)));
  return Response.json({ ok: true });
}
