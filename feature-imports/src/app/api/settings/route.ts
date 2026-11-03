import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [row] = await db.select().from(settings).where(eq(settings.key, "default"));
  return Response.json({ ...DEFAULT_SETTINGS, ...(row?.data ?? {}) });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const [existing] = await db.select().from(settings).where(eq(settings.key, "default"));
  const merged = { ...DEFAULT_SETTINGS, ...(existing?.data ?? {}), ...body };
  if (existing) {
    await db.update(settings).set({ data: merged, updatedAt: new Date() }).where(eq(settings.id, existing.id));
  } else {
    await db.insert(settings).values({ key: "default", data: merged });
  }
  return Response.json(merged);
}
