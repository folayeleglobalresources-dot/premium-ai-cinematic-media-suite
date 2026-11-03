import { db } from "@/db";
import { streamDestinations, streamSessions } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const mask = (k: string) => (k ? `••••••${k.slice(-4)}` : "");

export async function GET() {
  const dests = await db.select().from(streamDestinations).orderBy(desc(streamDestinations.createdAt));
  const sessions = await db.select().from(streamSessions).orderBy(desc(streamSessions.startedAt)).limit(25);
  return Response.json({
    destinations: dests.map((d) => ({ ...d, streamKey: mask(d.streamKey), hasKey: Boolean(d.streamKey) })),
    sessions,
  });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.kind === "session") {
    const [row] = await db
      .insert(streamSessions)
      .values({
        id: crypto.randomUUID(),
        title: String(b.title || "Untitled broadcast").slice(0, 160),
        destinationIds: Array.isArray(b.destinationIds) ? (b.destinationIds as string[]) : [],
        status: String(b.status || "live"),
        resolution: String(b.resolution || ""),
      })
      .returning();
    return Response.json({ session: row }, { status: 201 });
  }
  const whipUrl = String(b.whipUrl || "").trim();
  try {
    const u = new URL(whipUrl);
    if (u.protocol !== "https:" && u.hostname !== "localhost") throw new Error("https required");
  } catch {
    return Response.json({ error: "A valid https WHIP endpoint URL is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(streamDestinations)
    .values({
      id: crypto.randomUUID(),
      name: String(b.name || "Destination").slice(0, 80),
      platform: String(b.platform || "custom").slice(0, 40),
      whipUrl,
      streamKey: String(b.streamKey || "").trim(),
    })
    .returning();
  return Response.json({ destination: { ...row, streamKey: mask(row.streamKey), hasKey: Boolean(row.streamKey) } }, { status: 201 });
}
