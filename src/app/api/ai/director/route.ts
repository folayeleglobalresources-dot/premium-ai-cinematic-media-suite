import { directorSystemPrompt, localDirector, sanitizeActions, type DirectorContext } from "@/lib/ai/director";
import { llmJSON, llmLabel, llmProvider } from "@/lib/ai/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ engine: llmLabel(), llm: Boolean(llmProvider()) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: string; context?: DirectorContext; history?: { role: string; content: string }[] };
  const message = (body.message || "").slice(0, 2000);
  if (!message.trim()) return Response.json({ error: "message required" }, { status: 400 });
  const ctx: DirectorContext = body.context ?? {
    projectName: "Untitled", aspect: "16:9", width: 1920, height: 1080, fps: 24, duration: 0, clipCount: 0, videoClips: 0,
    audioClips: 0, titleCount: 0, selectedCount: 0, looks: [], hasMusic: false, letterbox: null, captions: 0, transitions: 0,
  };
  const local = localDirector(message, ctx);
  if (llmProvider()) {
    const history = (body.history ?? []).slice(-6).map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const out = (await llmJSON(directorSystemPrompt(ctx), `${history ? `Conversation so far:\n${history}\n\n` : ""}USER: ${message}`)) as
      | { reply?: string; actions?: unknown; suggestions?: unknown }
      | null;
    if (out && typeof out.reply === "string") {
      const actions = sanitizeActions(out.actions);
      return Response.json({
        reply: out.reply,
        actions: actions.length || !local.actions.length ? actions : local.actions,
        suggestions: Array.isArray(out.suggestions) ? (out.suggestions as string[]).slice(0, 5) : local.suggestions,
        engine: llmLabel(),
      });
    }
  }
  return Response.json(local);
}
