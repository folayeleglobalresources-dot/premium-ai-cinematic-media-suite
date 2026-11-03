import { db } from "@/db";
import { assets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(assets).where(eq(assets.id, Number(id)));
  if (!row?.thumbPath || !existsSync(row.thumbPath)) {
    // Elegant SVG placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0d0d12"/><stop offset="1" stop-color="#1a1711"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/><rect x="20" y="20" width="440" height="230" fill="none" stroke="#d4af6a" stroke-opacity="0.35" stroke-width="1"/><text x="240" y="142" font-family="Georgia, serif" font-size="22" fill="#d4af6a" text-anchor="middle" letter-spacing="6">${(row?.kind ?? "MEDIA").toUpperCase()}</text></svg>`;
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  }
  const buf = await readFile(row.thumbPath);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
