import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSignedUploadUrl } from "@/lib/storage";
import { ALLOWED_VIDEO_EXT, ALLOWED_VIDEO_MIME, MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES } from "@/lib/validations";

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { filename, fileSize, mimeType } = await req.json();

    if (!filename || typeof filename !== "string") return NextResponse.json({ error: "filename required" }, { status: 400 });
    if (!fileSize || typeof fileSize !== "number") return NextResponse.json({ error: "fileSize required" }, { status: 400 });
    if (!mimeType || typeof mimeType !== "string") return NextResponse.json({ error: "mimeType required" }, { status: 400 });

    if (fileSize < MIN_UPLOAD_BYTES) return NextResponse.json({ error: "File too small" }, { status: 400 });
    if (fileSize > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File exceeds 2GB limit" }, { status: 400 });

    const ext = "." + filename.split(".").pop()?.toLowerCase();
    if (!(ALLOWED_VIDEO_EXT as readonly string[]).includes(ext)) {
      return NextResponse.json({ error: `Unsupported extension. Allowed: ${ALLOWED_VIDEO_EXT.join(", ")}` }, { status: 400 });
    }
    // allow video/* generally, but flag non-video
    if (!mimeType.startsWith("video/")) {
      return NextResponse.json({ error: "File must be a video" }, { status: 400 });
    }

    // Create DB record in PENDING state
    const video = await prisma.video.create({
      data: {
        userId: session.id,
        filename: filename.slice(0, 255),
        fileSize,
        mimeType,
        status: "UPLOADING",
      },
      select: { id: true },
    });

    const signed = await createSignedUploadUrl({
      userId: session.id,
      filename,
      fileSize,
      mimeType,
    });

    // update storageKey immediately so we know expected key
    await prisma.video.update({
      where: { id: video.id },
      data: { storageKey: signed.storageKey },
    });

    return NextResponse.json({
      videoId: video.id,
      uploadUrl: signed.uploadUrl,
      storageKey: signed.storageKey,
      expiresAt: signed.expiresAt,
      headers: signed.headers,
    });
  } catch (e) {
    console.error("signed-url error", e);
    return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
  }
}
