import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { discoverEligibleHighlights, autoQueueShortsForVideo } from "@/lib/shorts/server";

export const dynamic = "force-dynamic";

// GET /api/shorts/discover?limit=10 — list eligible highlights without shorts
export async function GET(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);
    const eligible = await discoverEligibleHighlights(uid, limit);
    return NextResponse.json({ eligible, count: eligible.length });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to discover" }, { status: 500 });
  }
}

// POST /api/shorts/discover — bulk auto-queue shorts for eligible highlights (idempotent)
// Body: { limit?: number, captionStyle?: string, maxPerVideo?: number }
export async function POST(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit || 10, 50);
    const captionStyle = body.captionStyle || "Clean";
    const maxPerVideo = body.maxPerVideo || 1;
    const { discoverEligibleHighlights } = await import("@/lib/shorts/server");
    const eligible = await discoverEligibleHighlights(uid, limit);
    const results: any[] = [];
    let queued = 0;
    for (const { videoId, highlight } of eligible) {
      try {
        const { autoQueueShortsForVideo } = await import("@/lib/shorts/server");
        const res = await autoQueueShortsForVideo(uid, videoId, { captionStyle, maxPerVideo });
        results.push({ videoId, highlightId: highlight.highlightId, queued: res.queued, shorts: res.shorts.map((s) => s.shortId) });
        queued += res.queued;
      } catch (err: any) {
        results.push({ videoId, highlightId: highlight.highlightId, error: err.message });
      }
      if (queued >= limit) break;
    }
    return NextResponse.json({ queued, eligibleCount: eligible.length, results });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to auto-queue" }, { status: 500 });
  }
}
