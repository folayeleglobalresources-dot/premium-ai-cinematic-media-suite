import { db } from "@/db";
import { aiSessions } from "@/db/schema";
import type { FrameStats } from "@/lib/analysis";
import { composeReport } from "@/lib/intelligence";
import { enrichWithLLM } from "@/lib/server/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const stats = body.stats as FrameStats | undefined;
    if (!stats || typeof stats.meanLuma !== "number") {
      return Response.json({ error: "Frame statistics are required" }, { status: 400 });
    }
    const report = composeReport(stats, { intent: body.intent, fps: body.fps });
    const prose = await enrichWithLLM(
      "You are an Academy-calibre cinematographer and senior colorist. Write 120-170 words of director's notes based ONLY on the measured frame data and the engine's findings provided. Be specific, confident, and practical. No bullet points, no headings.",
      JSON.stringify({ measured: { meanLuma: stats.meanLuma, std: stats.std, clipHigh: stats.clipHigh, clipLow: stats.clipLow, castTemp: stats.castTemp, castTint: stats.castTint, satMean: stats.satMean, edgeDensity: stats.edgeDensity, skinRatio: stats.skinRatio }, findings: { scene: report.scene.label, exposure: report.exposure, whiteBalance: report.whiteBalance, looks: report.looks.slice(0, 2), lighting: report.lighting }, intent: body.intent ?? "cinematic" }),
    );
    if (prose) {
      report.notes = prose.trim();
      report.generatedBy = "llm+aurum-engine";
    }
    const [row] = await db
      .insert(aiSessions)
      .values({
        kind: "analysis",
        title: String(body.title ?? report.headline).slice(0, 200),
        input: { stats, intent: body.intent ?? null, source: body.source ?? "studio" },
        output: report as unknown as Record<string, unknown>,
      })
      .returning();
    return Response.json({ ...report, sessionId: row.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}
