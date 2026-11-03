import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(50);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(broadcasts)
    .values({
      title: String(body.title ?? "Live Session").slice(0, 160),
      protocol: String(body.protocol ?? "whip"),
      endpoint: String(body.endpoint ?? ""),
      status: "live",
      settings: body.settings ?? {},
      stats: {},
    })
    .returning();
  return Response.json(row, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const patch: Partial<typeof broadcasts.$inferInsert> = {};
  if (body.stats) patch.stats = body.stats;
  if (body.status) {
    patch.status = String(body.status);
    if (body.status !== "live") patch.endedAt = new Date();
  }
  const [row] = await db.update(broadcasts).set(patch).where(eq(broadcasts.id, id)).returning();
  return Response.json(row ?? { error: "Not found" }, { status: row ? 200 : 404 });
}
