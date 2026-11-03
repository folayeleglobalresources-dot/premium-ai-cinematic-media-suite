import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ project: row });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
  if (typeof body.logline === "string") patch.logline = body.logline.slice(0, 600);
  if (typeof body.status === "string") patch.status = body.status.slice(0, 40);
  if (typeof body.width === "number") patch.width = Math.round(body.width);
  if (typeof body.height === "number") patch.height = Math.round(body.height);
  if (typeof body.fps === "number") patch.fps = body.fps;
  if (typeof body.aspect === "string") patch.aspect = body.aspect;
  if (typeof body.durationSec === "number") patch.durationSec = body.durationSec;
  if (typeof body.poster === "string" && body.poster.length < 400_000) patch.poster = body.poster;
  if (body.timeline && typeof body.timeline === "object") patch.timeline = body.timeline as Record<string, unknown>;
  const [row] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning({ id: projects.id, updatedAt: projects.updatedAt });
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, updatedAt: row.updatedAt });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(projects).where(eq(projects.id, id));
  return Response.json({ ok: true });
}
