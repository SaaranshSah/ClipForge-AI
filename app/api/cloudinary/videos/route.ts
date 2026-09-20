import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/cloudinary/videos — list current user's videos
export async function GET(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(limitParam, 1), 100);

    const db = await getAdminDb();
    const colPath = `users/${uid}/videos`;

    // Try admin query; for mock we just get all
    const colRef = db.collection(colPath);
    let snap: any;
    try {
      // Firestore orderBy if available
      snap = await (colRef as any).orderBy?.("createdAt", "desc")?.limit?.(limit)?.get?.() ?? await colRef.get();
    } catch {
      snap = await colRef.get();
    }

    const docs: any[] = snap.docs || [];
    let videos = docs.map((d: any) => {
      const data = d.data();
      return { id: d.id, ...data };
    });

    // Sort by createdAt desc if not already
    videos.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (videos.length > limit) videos = videos.slice(0, limit);

    return NextResponse.json({ videos, count: videos.length });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) {
      return NextResponse.json({ error: e.message || "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[cloudinary/videos] list error", e.message);
    return NextResponse.json({ error: e.message || "Failed to list videos" }, { status: 500 });
  }
}
