import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import type { VideoDoc } from "@/lib/cloudinary/firestore";

export const dynamic = "force-dynamic";

// POST /api/cloudinary/complete
// After direct Cloudinary upload succeeds, client posts metadata to save in Firestore
// Body: { videoId, fileName, cloudinaryPublicId, cloudinaryUrl, resourceType, format, fileSize, duration, width, height, status? }
// Or full Cloudinary upload response: { public_id, secure_url, ... }
export async function POST(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;

    const body = await req.json().catch(() => ({}));

    // Support two payload shapes: flat metadata or raw Cloudinary response
    let videoId: string | undefined = body.videoId || body.video_id;
    let fileName: string | undefined = body.fileName || body.filename || body.original_filename;
    let publicId: string | undefined = body.cloudinaryPublicId || body.public_id || body.publicId;
    let secureUrl: string | undefined = body.cloudinaryUrl || body.secure_url || body.secureUrl || body.url;
    let resourceType: string | undefined = body.resourceType || body.resource_type || "video";
    let format: string | undefined = body.format;
    let fileSize: number | undefined = body.fileSize || body.bytes || body.file_size;
    let duration: number | null = body.duration ?? null;
    let width: number | null = body.width ?? null;
    let height: number | null = body.height ?? null;

    // If body contains nested cloudinary result (e.g. { result: {...} })
    if (body.result && typeof body.result === "object") {
      const r = body.result;
      publicId = publicId || r.public_id;
      secureUrl = secureUrl || r.secure_url || r.url;
      resourceType = resourceType || r.resource_type;
      format = format || r.format;
      fileSize = fileSize || r.bytes;
      duration = duration ?? r.duration ?? null;
      width = width ?? r.width ?? null;
      height = height ?? r.height ?? null;
      fileName = fileName || r.original_filename || fileName;
      videoId = videoId || body.videoId;
    }

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }
    if (!publicId) {
      return NextResponse.json({ error: "cloudinaryPublicId (public_id) is required" }, { status: 400 });
    }
    if (!secureUrl) {
      return NextResponse.json({ error: "cloudinaryUrl (secure_url) is required" }, { status: 400 });
    }
    if (!fileName) {
      fileName = `${videoId}.${format || "mp4"}`;
    }

    // Security: verify publicId belongs to this uid's folder
    const expectedPrefix = `users/${uid}/videos/${videoId}/`;
    if (!publicId.startsWith(expectedPrefix) && !publicId.startsWith(`users/${uid}/`)) {
      // For mock mode, allow but warn
      const isMockPublicId = publicId.includes("mock") || secureUrl.includes("mock");
      if (!isMockPublicId) {
        return NextResponse.json({ error: "public_id folder does not match your uid/videoId", code: "FORBIDDEN" }, { status: 403 });
      }
    }

    const db = await getAdminDb();
    const docPath = `users/${uid}/videos/${videoId}`;

    const now = new Date().toISOString();
    const doc: VideoDoc = {
      videoId,
      fileName,
      cloudinaryPublicId: publicId,
      cloudinaryUrl: secureUrl,
      resourceType: resourceType || "video",
      format: format || "mp4",
      fileSize: Number(fileSize) || 0,
      duration: duration !== null ? Number(duration) : null,
      width: width !== null ? Number(width) : null,
      height: height !== null ? Number(height) : null,
      status: (body.status as any) || "ready",
      processingStatus: body.processingStatus || "completed",
      ownerId: uid,
      createdAt: body.createdAt || now,
      updatedAt: now,
      thumbnailUrl: body.thumbnailUrl || (secureUrl ? secureUrl.replace("/video/upload/", "/video/upload/so_1,w_320,h_180,c_fill/").replace(/\.[^/.]+$/, ".jpg") : undefined),
      originalFolder: `users/${uid}/videos/${videoId}/original`,
      version: body.version,
      error: body.error || null,
    };

    // Upsert Firestore
    await db.doc(docPath).set(doc, { merge: true });

    console.log(`[cloudinary/complete] saved ${docPath} -> ${publicId}`);

    return NextResponse.json({ ok: true, video: doc });
  } catch (e: any) {
    const status = e.status || 401;
    console.error("[cloudinary/complete] error", e.message);
    if (status === 401) {
      return NextResponse.json({ error: e.message || "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
    return NextResponse.json({ error: e.message || "Failed to save metadata", code: "COMPLETE_ERROR" }, { status: 500 });
  }
}
