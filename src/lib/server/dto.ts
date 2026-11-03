import type { Asset } from "@/db/schema";
import type { AssetDTO } from "@/lib/types";

export function toAssetDTO(a: Asset): AssetDTO {
  return {
    id: a.id,
    projectId: a.projectId,
    name: a.name,
    kind: a.kind as AssetDTO["kind"],
    mime: a.mime,
    size: Number(a.size),
    durationMs: a.durationMs,
    width: a.width,
    height: a.height,
    fps: a.fps,
    lookId: a.lookId,
    tags: a.tags ?? [],
    favorite: a.favorite,
    source: a.source,
    status: a.status,
    metadata: a.metadata ?? {},
    createdAt: a.createdAt.toISOString(),
    hasThumb: !!a.thumbPath,
  };
}
