import { db } from "@/db";
import { aiSessions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 20));
  const rows = await db
    .select()
    .from(aiSessions)
    .where(kind ? eq(aiSessions.kind, kind) : undefined)
    .orderBy(desc(aiSessions.createdAt))
    .limit(limit);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(aiSessions)
    .values({
      kind: String(body.kind ?? "note"),
      title: String(body.title ?? "").slice(0, 200),
      input: body.input ?? {},
      output: body.output ?? {},
    })
    .returning();
  return Response.json(row, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await db.delete(aiSessions).where(eq(aiSessions.id, id));
  return Response.json({ ok: true });
}
