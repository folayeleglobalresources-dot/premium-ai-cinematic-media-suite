import { db } from "@/db";
import { shotlists } from "@/db/schema";
import { llmJSON, llmLabel, llmProvider } from "@/lib/ai/llm";
import { localShotPlan, shotPlanPrompt, type ShotPlan } from "@/lib/ai/shotlist";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(shotlists).orderBy(desc(shotlists.createdAt)).limit(30);
  return Response.json({ shotlists: rows, engine: llmLabel() });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { title?: string; logline?: string; genre?: string; tone?: string; shots?: number };
  const logline = (b.logline || "").trim().slice(0, 1200);
  if (logline.length < 8) return Response.json({ error: "Give me a logline of at least a sentence." }, { status: 400 });
  let plan: ShotPlan = localShotPlan({ title: b.title, logline, genre: b.genre || undefined, tone: b.tone, shots: b.shots });
  if (llmProvider()) {
    const out = (await llmJSON(shotPlanPrompt(), JSON.stringify({ title: b.title, logline, genre: b.genre, tone: b.tone }))) as Partial<ShotPlan> | null;
    if (out && Array.isArray(out.scenes) && out.scenes.length) {
      plan = { ...plan, ...out, engine: llmLabel() } as ShotPlan;
    }
  }
  const [row] = await db
    .insert(shotlists)
    .values({
      id: crypto.randomUUID(),
      title: plan.title.slice(0, 160),
      logline,
      genre: plan.genre,
      tone: plan.tone,
      engine: plan.engine,
      data: plan as unknown as Record<string, unknown>,
    })
    .returning();
  return Response.json({ shotlist: row }, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) await db.delete(shotlists).where(eq(shotlists.id, id));
  return Response.json({ ok: true });
}
