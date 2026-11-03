export const dynamic = "force-dynamic";

/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) proxy.
 * Forwards the browser's SDP offer to the ingest endpoint (Cloudflare Stream,
 * Twitch, MediaMTX, Dolby.io, etc.) so CORS and bearer tokens stay server-side.
 */
export async function POST(req: Request) {
  try {
    const { endpoint, token, sdp } = await req.json();
    if (!endpoint || !sdp) return Response.json({ error: "endpoint and sdp are required" }, { status: 400 });
    let target: URL;
    try {
      target = new URL(endpoint);
    } catch {
      return Response.json({ error: "Invalid WHIP endpoint URL" }, { status: 400 });
    }
    if (!/^https?:$/.test(target.protocol)) return Response.json({ error: "Endpoint must be http(s)" }, { status: 400 });
    const headers: Record<string, string> = { "Content-Type": "application/sdp" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(target, { method: "POST", headers, body: sdp, redirect: "follow" });
    const answer = await res.text();
    if (!res.ok) {
      return Response.json({ error: `Ingest rejected the offer (${res.status}): ${answer.slice(0, 300)}` }, { status: 502 });
    }
    let location = res.headers.get("location") ?? "";
    if (location && !/^https?:/i.test(location)) location = new URL(location, target).toString();
    return Response.json({ sdp: answer, location });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "WHIP negotiation failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { location, token } = await req.json();
    if (!location) return Response.json({ ok: true });
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch(location, { method: "DELETE", headers }).catch(() => null);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true });
  }
}
