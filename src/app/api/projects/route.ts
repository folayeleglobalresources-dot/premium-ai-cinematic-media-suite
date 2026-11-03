import { db } from "@/db";
import { assets, projects } from "@/db/schema";
import { defaultTimeline } from "@/lib/types";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      logline: projects.logline,
      width: projects.width,
      height: projects.height,
      fps: projects.fps,
      aspect: projects.aspect,
      poster: projects.poster,
      status: projects.status,
      durationSec: projects.durationSec,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(assets);
  return Response.json({ projects: rows, assetCount: count });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<{
    name: string;
    logline: string;
    width: number;
    height: number;
    fps: number;
    aspect: string;
  }>;
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(projects)
    .values({
      id,
      name: (body.name || "Untitled Production").slice(0, 120),
      logline: (body.logline || "").slice(0, 600),
      width: Math.round(body.width || 1920),
      height: Math.round(body.height || 1080),
      fps: body.fps || 24,
      aspect: body.aspect || "16:9",
      timeline: defaultTimeline() as unknown as Record<string, unknown>,
    })
    .returning();
  return Response.json({ project: row }, { status: 201 });
}
