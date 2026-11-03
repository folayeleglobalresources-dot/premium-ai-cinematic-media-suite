import { db } from "@/db";
import { streamDestinations, streamSessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (kind === "session") {
    const patch: Partial<typeof streamSessions.$inferInsert> = {};
    if (typeof b.status === "string") patch.status = b.status;
    if (typeof b.durationSec === "number") patch.durationSec = b.durationSec;
    if (typeof b.peakKbps === "number") patch.peakKbps = b.peakKbps;
    if (typeof b.avgFps === "number") patch.avgFps = b.avgFps;
    if (typeof b.notes === "string") patch.notes = b.notes.slice(0, 1000);
    if (b.ended) patch.endedAt = new Date();
    await db.update(streamSessions).set(patch).where(eq(streamSessions.id, id));
    return Response.json({ ok: true });
  }
  const patch: Partial<typeof streamDestinations.$inferInsert> = {};
  if (typeof b.name === "string") patch.name = b.name.slice(0, 80);
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (typeof b.streamKey === "string" && b.streamKey && !b.streamKey.startsWith("••")) patch.streamKey = b.streamKey.trim();
  if (typeof b.whipUrl === "string" && b.whipUrl.startsWith("https://")) patch.whipUrl = b.whipUrl.trim();
  await db.update(streamDestinations).set(patch).where(eq(streamDestinations.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind === "session") await db.delete(streamSessions).where(eq(streamSessions.id, id));
  else await db.delete(streamDestinations).where(eq(streamDestinations.id, id));
  return Response.json({ ok: true });
}
