import { db } from "@/db";
import { looks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: looks.id,
      name: looks.name,
      category: looks.category,
      description: looks.description,
      grade: looks.grade,
      lutSize: looks.lutSize,
      swatch: looks.swatch,
      createdAt: looks.createdAt,
    })
    .from(looks)
    .orderBy(desc(looks.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name) return Response.json({ error: "Name is required" }, { status: 400 });
  const [row] = await db
    .insert(looks)
    .values({
      name: String(body.name).slice(0, 120),
      category: String(body.category ?? (body.cubeText ? "Imported LUT" : "Custom")),
      description: String(body.description ?? ""),
      grade: body.grade ?? {},
      cubeText: typeof body.cubeText === "string" ? body.cubeText : null,
      lutSize: Number(body.lutSize ?? 0),
      swatch: Array.isArray(body.swatch) ? body.swatch.map(String) : ["#222", "#888", "#eee"],
    })
    .returning();
  return Response.json(row, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await db.delete(looks).where(eq(looks.id, id));
  return Response.json({ ok: true });
}
