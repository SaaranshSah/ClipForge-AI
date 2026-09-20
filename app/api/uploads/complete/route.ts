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

    return NextResponse.json({ video: updated, processingJob: job });
  } catch (e) {
    console.error("upload complete error", e);
    return NextResponse.json({ error: "Failed to finalize upload" }, { status: 500 });
  }
}
