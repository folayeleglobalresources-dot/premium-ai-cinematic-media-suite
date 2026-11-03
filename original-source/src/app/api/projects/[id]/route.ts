import { db } from "@/db";
import { projects, timelines } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [project] = await db.select().from(projects).where(eq(projects.id, Number(id)));
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  const tls = await db.select().from(timelines).where(eq(timelines.projectId, project.id));
  return Response.json({ project, timelines: tls });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name.slice(0, 160);
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.fps === "number") patch.fps = body.fps;
  if (typeof body.width === "number") patch.width = body.width;
  if (typeof body.height === "number") patch.height = body.height;
  if (body.lookId !== undefined) patch.lookId = body.lookId;
  const [row] = await db.update(projects).set(patch).where(eq(projects.id, Number(id))).returning();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(projects).where(eq(projects.id, Number(id)));
  return Response.json({ ok: true });
}
