import { db } from "@/db";
import { assets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const rows = kind
    ? await db.select().from(assets).where(eq(assets.kind, kind)).orderBy(desc(assets.createdAt))
    : await db.select().from(assets).orderBy(desc(assets.createdAt));
  return Response.json({ assets: rows });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.id !== "string" || typeof b.name !== "string") {
    return Response.json({ error: "id and name are required" }, { status: 400 });
  }
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const values: typeof assets.$inferInsert = {
    id: b.id,
    name: b.name.slice(0, 200),
    kind: ["video", "audio", "image"].includes(String(b.kind)) ? String(b.kind) : "video",
    mime: String(b.mime ?? "").slice(0, 120),
    source: String(b.source ?? "import").slice(0, 40),
    durationSec: num(b.durationSec),
    width: Math.round(num(b.width)),
    height: Math.round(num(b.height)),
    sizeBytes: num(b.sizeBytes),
    thumbnail: typeof b.thumbnail === "string" ? b.thumbnail : null,
    filmstrip: Array.isArray(b.filmstrip) ? (b.filmstrip as string[]).slice(0, 12) : [],
    peaks: Array.isArray(b.peaks) ? (b.peaks as number[]).slice(0, 2000) : [],
    slate: (b.slate as Record<string, string>) ?? {},
    tags: Array.isArray(b.tags) ? (b.tags as string[]).slice(0, 30) : [],
    analysis: (b.analysis as Record<string, unknown>) ?? {},
    captions: Array.isArray(b.captions) ? (b.captions as { start: number; end: number; text: string }[]).slice(0, 5000) : [],
    rating: Math.round(num(b.rating)),
    favorite: Boolean(b.favorite),
    projectId: typeof b.projectId === "string" ? b.projectId : null,
  };
  const [row] = await db.insert(assets).values(values).onConflictDoUpdate({ target: assets.id, set: values }).returning();
  return Response.json({ asset: row }, { status: 201 });
}
