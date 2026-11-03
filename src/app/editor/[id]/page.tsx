import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { assets, projects } from "@/db/schema";
import { EditorWorkspace } from "@/components/editor/EditorWorkspace";
import { normalizeTimeline, type AssetMeta, type ProjectDoc } from "@/lib/types";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Montage — LUMIÈRE" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) notFound();
  const assetRows = await db.select().from(assets).orderBy(desc(assets.createdAt)).limit(400);
  const doc: ProjectDoc = {
    id: row.id,
    name: row.name,
    logline: row.logline,
    width: row.width,
    height: row.height,
    fps: row.fps,
    aspect: row.aspect,
    timeline: normalizeTimeline(row.timeline),
    poster: row.poster,
    status: row.status,
    durationSec: row.durationSec,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  const list: AssetMeta[] = assetRows.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind as AssetMeta["kind"],
    mime: a.mime,
    source: a.source,
    durationSec: a.durationSec,
    width: a.width,
    height: a.height,
    sizeBytes: a.sizeBytes,
    thumbnail: a.thumbnail,
    filmstrip: a.filmstrip,
    peaks: a.peaks,
    slate: a.slate,
    tags: a.tags,
    analysis: a.analysis,
    captions: a.captions,
    rating: a.rating,
    favorite: a.favorite,
    projectId: a.projectId,
    createdAt: a.createdAt.toISOString(),
  }));
  return <EditorWorkspace key={doc.id} doc={doc} assets={list} />;
}
