import { db } from "@/db";
import { streamDestinations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * WHIP (RFC 9725) signalling proxy. The browser sends its SDP offer here; we attach the
 * destination's bearer token server-side (stream keys never return to the client) and relay
 * the SDP answer. Media then flows directly browser → ingest over SRTP/UDP.
 */
async function destination(id: string | null) {
  if (!id) return null;
  const [d] = await db.select().from(streamDestinations).where(eq(streamDestinations.id, id));
  return d ?? null;
}

export async function POST(req: Request) {
  const dest = await destination(new URL(req.url).searchParams.get("destination"));
  if (!dest) return new Response("Unknown destination", { status: 404 });
  const offer = await req.text();
  if (!offer.startsWith("v=0")) return new Response("Invalid SDP offer", { status: 400 });
  const headers: Record<string, string> = { "Content-Type": "application/sdp", Accept: "application/sdp" };
  if (dest.streamKey) headers.Authorization = `Bearer ${dest.streamKey}`;
  let res: Response;
  try {
    res = await fetch(dest.whipUrl, { method: "POST", headers, body: offer, redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return new Response(`Could not reach ${dest.name} ingest: ${(e as Error).message}`, { status: 502 });
  }
  const answer = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? " — check the stream key" : "";
    return new Response(`${dest.name} refused the stream (${res.status})${hint}. ${answer.slice(0, 200)}`, { status: 502 });
  }
  const loc = res.headers.get("location");
  const resource = loc ? new URL(loc, dest.whipUrl).toString() : "";
  return new Response(answer, {
    status: 201,
    headers: { "Content-Type": "application/sdp", "x-whip-resource": resource, "Access-Control-Expose-Headers": "x-whip-resource" },
  });
}

export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const dest = await destination(params.get("destination"));
  const resource = params.get("resource");
  if (!dest || !resource) return new Response("Missing destination or resource", { status: 400 });
  try {
    const r = new URL(resource);
    const base = new URL(dest.whipUrl);
    const root = (h: string) => h.split(".").slice(-2).join(".");
    if (r.protocol !== "https:" || root(r.hostname) !== root(base.hostname)) return new Response("Resource host mismatch", { status: 400 });
    await fetch(r, { method: "DELETE", headers: dest.streamKey ? { Authorization: `Bearer ${dest.streamKey}` } : {}, signal: AbortSignal.timeout(8000) });
  } catch {
    /* session already gone */
  }
  return Response.json({ ok: true });
}
