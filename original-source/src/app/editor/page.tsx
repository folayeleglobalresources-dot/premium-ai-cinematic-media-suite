import { db } from "@/db";
import { assets, projects, timelines } from "@/db/schema";
import { DEFAULT_GRADE, emptyTimeline, newClipId, type Clip } from "@/lib/types";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ProjectsPanel } from "@/components/editor/ProjectsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cutting Room — Obsidian" };

export default async function EditorIndex({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const sp = await searchParams;
  if (sp.asset) {
    const [asset] = await db.select().from(assets).where(eq(assets.id, Number(sp.asset)));
    if (asset) {
      const width = asset.width || 1920;
      const height = asset.height || 1080;
      const fps = asset.fps && asset.fps > 0 ? Math.round(asset.fps * 1000) / 1000 : 24;
      const tl = emptyTimeline(width, height, fps);
      const clip: Clip = {
        id: newClipId(),
        assetId: asset.id,
        kind: asset.kind as Clip["kind"],
        name: asset.name,
        track: asset.kind === "audio" ? 2 : 0,
        start: 0,
        inPoint: 0,
        duration: asset.kind === "image" ? 4 : asset.durationMs > 0 ? asset.durationMs / 1000 : 5,
        sourceDuration: asset.durationMs / 1000,
        speed: 1,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        opacity: 1,
        transitionIn: { type: "none", duration: 0 },
        grade: { ...DEFAULT_GRADE },
        lookId: null,
        motion: "none",
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        width: asset.width,
        height: asset.height,
      };
      tl.clips = [clip];
      const [project] = await db.insert(projects).values({ name: asset.name, fps, width, height, aspect: `${width}:${height}` }).returning();
      const [timeline] = await db.insert(timelines).values({ projectId: project.id, name: "Main Sequence", data: tl, durationMs: Math.round(clip.duration * 1000) }).returning();
      await db.update(assets).set({ projectId: project.id }).where(eq(assets.id, asset.id));
      redirect(`/editor/${timeline.id}`);
    }
  }
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  const tls = await db.select({ id: timelines.id, projectId: timelines.projectId, durationMs: timelines.durationMs, updatedAt: timelines.updatedAt }).from(timelines);
  const list = rows.map((p) => {
    const t = tls.filter((x) => x.projectId === p.id).sort((a, b) => a.id - b.id)[0];
    return { id: p.id, name: p.name, description: p.description, fps: p.fps, width: p.width, height: p.height, updatedAt: p.updatedAt.toISOString(), timelineId: t?.id ?? null, durationMs: t?.durationMs ?? 0 };
  });
  return <ProjectsPanel initial={list} />;
}
