import { db } from "@/db";
import { looks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db.select({ cubeText: looks.cubeText, name: looks.name }).from(looks).where(eq(looks.id, Number(id)));
  if (!row?.cubeText) return new Response("Not found", { status: 404 });
  return new Response(row.cubeText, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=86400" },
  });
}
