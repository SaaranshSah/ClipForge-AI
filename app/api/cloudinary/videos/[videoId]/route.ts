import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { deleteCloudinaryAsset } from "@/lib/cloudinary/server";

export const dynamic = "force-dynamic";

// GET /api/cloudinary/videos/[videoId] — single video (owner check)
export async function GET(req: Request, { params }: { params: { videoId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const videoId = params.videoId;

    const db = await getAdminDb();
    const docPath = `users/${uid}/videos/${videoId}`;
    const snap = await db.doc(docPath).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    const data = snap.data();
    // Extra owner check (defense in depth)
    if (data.ownerId && data.ownerId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ video: { id: snap.id, ...data } });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to fetch video" }, { status: 500 });
  }
}

// DELETE /api/cloudinary/videos/[videoId] — delete Cloudinary asset + Firestore doc
export async function DELETE(req: Request, { params }: { params: { videoId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const videoId = params.videoId;

    const db = await getAdminDb();
    const docPath = `users/${uid}/videos/${videoId}`;
    const snap = await db.doc(docPath).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    const data = snap.data();
    if (data.ownerId && data.ownerId !== uid) {
      return NextResponse.json({ error: "Forbidden — not your video" }, { status: 403 });
    }

    const publicId: string | undefined = data.cloudinaryPublicId || data.public_id;
    const resourceType: string = data.resourceType || "video";

    // Delete from Cloudinary first (server-side, uses api_secret)
    if (publicId) {
      try {
        await deleteCloudinaryAsset(publicId, resourceType as any);
        console.log(`[cloudinary/delete] deleted ${publicId} for ${uid}`);
      } catch (err: any) {
        console.warn(`[cloudinary/delete] Cloudinary delete failed for ${publicId}: ${err.message} — continuing to delete Firestore doc`);
        // Don't fail whole request if Cloudinary delete fails; still remove Firestore doc to keep UX consistent
        // Optionally return 502 if you want strict
      }
    }

    // Delete Firestore doc and try to delete sub-collections folders (clips/shorts/thumbnails) if any were tracked separately
    // For now, Firestore doc deletion is enough; Cloudinary folders are logical
    await db.doc(docPath).delete();

    // Also attempt to clean related Cloudinary folders? List and delete derived assets if needed — not required for V2
    // We log folders for future
    // delete assets in clips/shorts/thumbnails folders: try to delete with prefix
    // For mock, no-op

    return NextResponse.json({ ok: true, deleted: videoId });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    console.error("[cloudinary/videos] delete error", e.message);
    return NextResponse.json({ error: e.message || "Failed to delete video" }, { status: 500 });
  }
}
