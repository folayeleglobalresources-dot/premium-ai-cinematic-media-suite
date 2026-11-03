/**
 * Optional LLM enrichment. The built-in Aurum engine produces the structured
 * analysis; if an API key is configured we ask a model to write the prose
 * layer on top of the measured data (never to invent measurements).
 */
export async function enrichWithLLM(system: string, user: string): Promise<string | null> {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!openai && !anthropic) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
          max_tokens: 900,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      const text = Array.isArray(j.content) ? j.content.map((c: { text?: string }) => c.text ?? "").join("") : null;
      return text || null;
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
