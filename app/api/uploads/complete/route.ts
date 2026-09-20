import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/storage";

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { videoId, storageKey } = await req.json();
    if (!videoId || !storageKey) return NextResponse.json({ error: "videoId and storageKey required" }, { status: 400 });

    const video = await prisma.video.findFirst({
      where: { id: videoId, userId: session.id },
    });
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
    if (video.storageKey && video.storageKey !== storageKey) {
      // storageKey mismatch — but allow if user is owner (defense: ensure key belongs to user prefix)
      if (!storageKey.startsWith(`uploads/${session.id}/`)) {
        return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
      }
    }
    if (!storageKey.startsWith(`uploads/${session.id}/`)) {
      return NextResponse.json({ error: "Storage key must be scoped to your user" }, { status: 400 });
    }

    const publicUrl = getPublicUrl(storageKey);

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        storageKey,
        storageUrl: publicUrl,
        status: "UPLOADED",
      },
    });

    // Create an initial processing job (V2 worker will pick it up)
    const job = await prisma.processingJob.create({
      data: {
        userId: session.id,
        videoId: updated.id,
        type: "TRANSCODE",
        status: "QUEUED",
        progress: 0,
      },
    });

    // V3 Automatic Highlights: enqueue ClipForge AI job for this video (fire-and-forget, idempotent)
    // Do NOT block response; do short enqueue (<2s) and let worker / polling handle long processing
    let highlightsJob: any = null;
    try {
      // For Firestore we also create a video doc for V3 discovery (so highlights can be listed via Firestore)
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const { createHighlightsJob } = await import("@/lib/highlights/server");
      const db = await getAdminDb();
      // Mirror Prisma video into Firestore for unified V3 pipeline (so Cloudinary + Storage videos share same path)
      // Firestore path users/{uid}/videos/{videoId}
      try {
        await db.doc(`users/${session.id}/videos/${videoId}`).set(
          {
            videoId,
            fileName: updated.filename,
            cloudinaryUrl: publicUrl,
            cloudinaryPublicId: storageKey, // use storageKey as publicId for Firebase Storage videos
            storageUrl: publicUrl,
            storageKey,
            resourceType: "video",
            format: updated.mimeType?.split("/")[1] || "mp4",
            fileSize: updated.fileSize,
            duration: updated.duration,
            width: null,
            height: null,
            status: "ready",
            ownerId: session.id,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch {}

      // Auto-queue highlights (idempotent) — this will create ClipForge job fpq
      const sourceUrl = publicUrl || `https://storage.mock/${storageKey}`;
      const res = await createHighlightsJob({
        uid: session.id,
        videoId,
        sourceUrl,
        filename: updated.filename,
        duration: updated.duration,
      });
      highlightsJob = res.job;
    } catch (err: any) {
      console.warn("[uploads/complete] highlights auto-queue failed (non-blocking)", err.message);
      // Don't fail the upload — highlights can be queued later via /api/highlights/discover
    }

    return NextResponse.json({ video: updated, processingJob: job, highlightsJob });
  } catch (e) {
    console.error("upload complete error", e);
    return NextResponse.json({ error: "Failed to finalize upload" }, { status: 500 });
  }
}
