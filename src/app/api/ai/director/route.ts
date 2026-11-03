import { db } from "@/db";
import { aiSessions } from "@/db/schema";
import { generateDirectorPlan, type DirectorInput } from "@/lib/intelligence";
import { enrichWithLLM } from "@/lib/server/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input: DirectorInput = {
      logline: String(body.logline ?? "").trim() || "A stranger arrives in a town that remembers them.",
      genre: String(body.genre ?? "drama"),
      mood: String(body.mood ?? "restrained"),
      format: String(body.format ?? "short film"),
      durationSec: Number(body.durationSec ?? 90),
      aspect: String(body.aspect ?? "2.39:1"),
    };
    const plan = generateDirectorPlan(input);
    const prose = await enrichWithLLM(
      "You are a celebrated film director and screenwriter. Given a logline, genre, mood and a beat sheet, write a vivid 140-200 word treatment synopsis in present tense. No headings, no bullets.",
      JSON.stringify({ input, beats: plan.beats, palette: plan.palette }),
    );
    if (prose) {
      plan.synopsis = prose.trim();
      plan.generatedBy = "llm+aurum-engine";
    }
    const [row] = await db
      .insert(aiSessions)
      .values({
        kind: "director",
        title: plan.titles[0] ?? "Director plan",
        input: input as unknown as Record<string, unknown>,
        output: plan as unknown as Record<string, unknown>,
      })
      .returning();
    return Response.json({ ...plan, sessionId: row.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Director failed" }, { status: 500 });
  }
}
