import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getHighlightsForVideo, discoverEligibleVideos } from "@/lib/highlights/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/highlights?videoId=xxx  -> highlights for that video
// GET /api/highlights               -> all highlights for user (aggregate)
// GET /api/highlights?discover=1   -> eligible videos not yet processed (for auto pipeline)
export async function GET(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId");
    const discover = url.searchParams.get("discover");
    const all = url.searchParams.get("all");

    if (discover) {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);
      const eligible = await discoverEligibleVideos(uid, limit);
      return NextResponse.json({ eligible, count: eligible.length });
    }

    if (videoId) {
      const highlights = await getHighlightsForVideo(uid, videoId);
      return NextResponse.json({ videoId, highlights, count: highlights.length });
    }

    // All highlights across all videos for this user
    // Aggregate by listing all highlights subcollections — we scan jobs + videos
    // For performance, we list videos then fetch each highlights collection
    const _db = await getAdminDb();
    const videosSnap = await _db.collection(`users/${uid}/videos`).get();
    const videoIds = (videosSnap.docs as any[]).map((d) => d.id);
    // Also check jobs for videoIds that may not be in videos collection yet
    const jobsSnap = await _db.collection(`users/${uid}/jobs`).get();
    const jobVideoIds = (jobsSnap.docs as any[]).filter((d) => (d.data() as any).jobType === "highlights").map((d) => (d.data() as any).videoId);
    const allVideoIds = Array.from(new Set([...videoIds, ...jobVideoIds]));

    let allHighlights: any[] = [];
    for (const vid of allVideoIds) {
      try {
        const hl = await getHighlightsForVideo(uid, vid);
        allHighlights.push(...hl.map((h) => ({ ...h, videoId: vid })));
      } catch {}
    }
    // Sort by score desc
    allHighlights.sort((a, b) => b.score - a.score);

    // Optional filter ?all keeps all, else could limit
    const limit = url.searchParams.get("limit");
    if (limit) {
      const n = Math.min(parseInt(limit, 10), 100);
      allHighlights = allHighlights.slice(0, n);
    }

    return NextResponse.json({ highlights: allHighlights, count: allHighlights.length, videoCount: allVideoIds.length });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    if (status === 404) return NextResponse.json({ error: e.message || "Video not found" }, { status: 404 });
    console.error("[highlights] GET error", e);
    return NextResponse.json({ error: e.message || "Failed to fetch highlights" }, { status: 500 });
  }
}
