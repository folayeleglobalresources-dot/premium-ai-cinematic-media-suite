import { db } from "@/db";
import { projects, timelines } from "@/db/schema";
import { emptyTimeline } from "@/lib/types";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const width = Number(body.width ?? 1920);
  const height = Number(body.height ?? 1080);
  const fps = Number(body.fps ?? 24);
  const [project] = await db
    .insert(projects)
    .values({
      name: String(body.name ?? "Untitled Picture").slice(0, 160),
      description: String(body.description ?? ""),
      aspect: String(body.aspect ?? "16:9"),
      fps,
      width,
      height,
      lookId: body.lookId ?? null,
    })
    .returning();
  const data = body.timeline ?? emptyTimeline(width, height, fps);
  const [timeline] = await db
    .insert(timelines)
    .values({ projectId: project.id, name: "Main Sequence", data, durationMs: Number(body.durationMs ?? 0) })
    .returning();
  return Response.json({ project, timeline }, { status: 201 });
}
