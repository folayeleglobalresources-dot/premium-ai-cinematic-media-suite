import { db } from "@/db";
import { assets, projects, shotlists, streamSessions } from "@/db/schema";
import { Atelier, type ProjectCard } from "@/components/home/Atelier";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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
      durationSec: projects.durationSec,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .limit(24);
  const [[a], [s], [w]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${assets.sizeBytes}),0)::float` }).from(assets),
    db.select({ n: sql<number>`count(*)::int` }).from(streamSessions),
    db.select({ n: sql<number>`count(*)::int` }).from(shotlists),
  ]);
  const cards: ProjectCard[] = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  return <Atelier projects={cards} stats={{ assets: a.n, bytes: a.bytes, sessions: s.n, boards: w.n }} />;
}
