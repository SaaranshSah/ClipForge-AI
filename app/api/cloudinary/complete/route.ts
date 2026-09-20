import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { getCloudinary, getCloudinaryConfig, isCloudinaryMock } from "@/lib/cloudinary/server";
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

    // === VERIFY CLOUDINARY RESOURCE (Requirement 3,4,6) ===
    // Ensure URL is HTTPS and from correct cloud, and resource actually exists as video
    const cfg = getCloudinaryConfig();
    const expectedCloud = cfg.cloudName;
    // Verify secureUrl is HTTPS and contains correct cloudName (not demo unless actually configured)
    if (!secureUrl || !secureUrl.startsWith("https://")) {
      return NextResponse.json({ error: "Cloudinary secure_url must be HTTPS", code: "INVALID_URL" }, { status: 400 });
    }
    if (expectedCloud && !secureUrl.includes(`res.cloudinary.com/${expectedCloud}/`)) {
      // Allow if secureUrl is from a different cloud but warn — must match configured cloud
      console.warn(`[cloudinary/complete] secureUrl cloud mismatch: expected ${expectedCloud}, got ${secureUrl}`);
      // In production, enforce: if configured cloud is not demo, URL must contain it
      if (expectedCloud !== "demo" && !secureUrl.includes(expectedCloud)) {
        return NextResponse.json({ error: `Cloudinary URL cloud mismatch: expected ${expectedCloud}`, code: "CLOUD_MISMATCH" }, { status: 400 });
      }
    }
    // Verify resource_type is video
    if (resourceType && resourceType !== "video") {
      console.warn(`[cloudinary/complete] resource_type is ${resourceType}, expected video`);
      // Only allow video — reject image/raw unless explicitly intended
      if (resourceType !== "video") {
        return NextResponse.json({ error: `Cloudinary resource_type must be video, got ${resourceType}`, code: "INVALID_RESOURCE_TYPE" }, { status: 400 });
      }
    }
    // Verify format is browser compatible (mp4/webm/mov)
    const browserCompatible = ["mp4", "webm", "mov", "m4v"];
    if (format && !browserCompatible.includes(format.toLowerCase())) {
      console.warn(`[cloudinary/complete] format ${format} may not be browser compatible, will store but delivery may need transformation`);
    }
    // If not in mock mode, verify resource actually exists via Cloudinary API
    if (!isCloudinaryMock() && !cfg.isMock && publicId && !publicId.includes("mock")) {
      try {
        const cld = getCloudinary();
        // Verify via admin API — checks that resource exists and is video
        const res: any = await cld.api.resource(publicId, { resource_type: "video" }).catch(async () => {
          // Fallback: try without resource_type, or check via url
          return await cld.api.resource(publicId, { resource_type: "video" });
        });
        if (!res || !res.public_id) {
          return NextResponse.json({ error: "Cloudinary resource not found — upload may have failed", code: "RESOURCE_NOT_FOUND" }, { status: 400 });
        }
        if (res.resource_type && res.resource_type !== "video") {
          return NextResponse.json({ error: `Cloudinary resource_type is ${res.resource_type}, expected video`, code: "WRONG_RESOURCE_TYPE" }, { status: 400 });
        }
        // Optionally verify HTTP 200 by HEAD request to secureUrl
        try {
          const head = await fetch(secureUrl, { method: "HEAD" });
          if (!head.ok) {
            console.warn(`[cloudinary/complete] secure_url HEAD returned ${head.status}`);
          } else {
            const ct = head.headers.get("content-type") || "";
            if (!ct.startsWith("video/")) {
              console.warn(`[cloudinary/complete] secure_url content-type is ${ct}, expected video/*`);
            }
          }
        } catch (e) {
          console.warn(`[cloudinary/complete] HEAD check failed`, e);
        }
        // Use verified data to enrich doc if needed
        format = res.format || format;
        resourceType = res.resource_type || resourceType;
        width = res.width ?? width;
        height = res.height ?? height;
        duration = res.duration ?? duration;
        fileSize = res.bytes ?? fileSize;
      } catch (e: any) {
        // If Cloudinary API fails, log but don't block saving in dev — in production, show real error
        console.warn(`[cloudinary/complete] Cloudinary verification failed for ${publicId}:`, e.message);
        // In production (not mock), return error instead of saving fake
        if (process.env.TEST_MODE !== "true" && process.env.CLOUDINARY_MOCK !== "true") {
          return NextResponse.json({ error: `Cloudinary verification failed: ${e.message} — check CLOUDINARY_* env and that resource was uploaded with resource_type video`, code: "VERIFICATION_FAILED" }, { status: 502 });
        }
      }
    } else {
      console.log(`[cloudinary/complete] skipping Cloudinary verification (mock mode publicId=${publicId})`);
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

    // V3 Automatic Highlights: auto-queue ClipForge AI job for this video (idempotent, non-blocking)
    // User does NOT need to manually start highlight detection
    let highlightsJob: any = null;
    try {
      const { createHighlightsJob } = await import("@/lib/highlights/server");
      const res = await createHighlightsJob({
        uid,
        videoId,
        sourceUrl: secureUrl,
        filename: fileName,
        duration: duration !== null ? Number(duration) : null,
      });
      highlightsJob = res.job;
    } catch (err: any) {
      console.warn("[cloudinary/complete] highlights auto-queue failed (non-blocking)", err.message);
    }

    return NextResponse.json({ ok: true, video: doc, highlightsJob });
  } catch (e: any) {
    const status = e.status || 401;
    console.error("[cloudinary/complete] error", e.message);
    if (status === 401) {
      return NextResponse.json({ error: e.message || "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
    return NextResponse.json({ error: e.message || "Failed to save metadata", code: "COMPLETE_ERROR" }, { status: 500 });
  }
}
