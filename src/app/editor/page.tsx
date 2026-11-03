import { redirect } from "next/navigation";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { defaultTimeline } from "@/lib/types";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function EditorIndex() {
  const [latest] = await db.select({ id: projects.id }).from(projects).orderBy(desc(projects.updatedAt)).limit(1);
  if (latest) redirect(`/editor/${latest.id}`);
  const id = crypto.randomUUID();
  await db.insert(projects).values({ id, name: "Untitled Production", timeline: defaultTimeline() as unknown as Record<string, unknown> });
  redirect(`/editor/${id}`);
}
