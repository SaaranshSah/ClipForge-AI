import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { pollShort } from "@/lib/shorts/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/shorts/[shortId]?videoId=xxx — poll short (progresses through EDITING→CAPTIONING→QUALITY_CHECK→COMPLETED)
export async function GET(req: Request, { params }: { params: { shortId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const shortId = params.shortId;
    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId");
    if (!videoId) return NextResponse.json({ error: "videoId query required" }, { status: 400 });

    // Try pollShort (will lock and process if QUEUED)
    try {
      const short = await pollShort(uid, videoId, shortId);
      return NextResponse.json({ short });
    } catch (e: any) {
      if (e.status === 404) {
        // Fallback: try to find short without videoId by scanning all videos' shorts subcollections
        const _db = await getAdminDb();
        const vsnap = await _db.collection(`users/${uid}/videos`).get();
        for (const vdoc of (vsnap.docs as any[])) {
          const vid = vdoc.id;
          const snap = await _db.doc(`users/${uid}/videos/${vid}/shorts/${shortId}`).get();
          if (snap.exists) {
            const short = await pollShort(uid, vid, shortId);
            return NextResponse.json({ short });
          }
        }
        return NextResponse.json({ error: "Short not found" }, { status: 404 });
      }
      throw e;
    }
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    if (status === 404) return NextResponse.json({ error: e.message || "Short not found" }, { status: 404 });
    console.error("[shorts/[shortId]] error", e);
    return NextResponse.json({ error: e.message || "Failed to poll short" }, { status: 500 });
  }
}
