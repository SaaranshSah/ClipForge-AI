import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getShortsForVideo, getAllShortsForUser } from "@/lib/shorts/server";
import { discoverEligibleHighlights } from "@/lib/shorts/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/shorts?videoId=xxx -> shorts for that video
// GET /api/shorts -> all shorts for user
// GET /api/shorts?discover=1 -> eligible highlights without shorts
export async function GET(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId");
    const discover = url.searchParams.get("discover");

    if (discover) {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);
      const eligible = await discoverEligibleHighlights(uid, limit);
      return NextResponse.json({ eligible, count: eligible.length });
    }

    if (videoId) {
      const shorts = await getShortsForVideo(uid, videoId);
      return NextResponse.json({ videoId, shorts, count: shorts.length });
    }

    // All shorts
    const all = await getAllShortsForUser(uid, 50);
    // Optional limit
    const limit = url.searchParams.get("limit");
    let shorts = all;
    if (limit) {
      const n = Math.min(parseInt(limit, 10), 100);
      shorts = shorts.slice(0, n);
    }
    // Include video count for UI
    const _db = await getAdminDb();
    const vsnap = await _db.collection(`users/${uid}/videos`).get();
    const videoCount = vsnap.docs.length;
    return NextResponse.json({ shorts, count: shorts.length, videoCount });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    if (status === 404) return NextResponse.json({ error: e.message || "Not found" }, { status: 404 });
    console.error("[shorts] GET error", e);
    return NextResponse.json({ error: e.message || "Failed to fetch shorts" }, { status: 500 });
  }
}
