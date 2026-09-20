import { NextRequest, NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getClipForgeJobStatus, normalizeClipForgeStatus } from "@/lib/clipforge/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getCloudinary, getCloudinaryConfig, isCloudinaryMock } from "@/lib/cloudinary/server";

// GET /api/clipforge/jobs/[jobId] — poll status, sync Firestore, handle clip Storage move
export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  const jobId = params.jobId;
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  try {
    const user = await getClipForgeUser();
    const db = await getAdminDb();

    // Ensure user owns this job
    const docRef = (db as any).doc(`users/${user.uid}/jobs/${jobId}`);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Job not found or not owned by you", code: "NOT_FOUND" }, { status: 404 });
    }
    const job = snap.data();

    // Fetch latest from ClipForge (server-side, with API key)
    let remote;
    try {
      remote = await getClipForgeJobStatus(jobId);
    } catch (e: any) {
      const status = e.status || 502;
      return NextResponse.json({ error: e.message, code: e.code || "CLIPFORGE_FAILURE", retryable: !!e.retryable }, { status });
    }

    const normalized = normalizeClipForgeStatus(remote.status);
    const updates: any = {
      status: normalized,
      updatedAt: new Date().toISOString(),
      progress: remote.progress ?? job.progress,
      error: remote.error || null,
    };

    // If completed and we have a resultUrl, move clip to Cloudinary — ALL video files in Cloudinary, resource_type video
    // Public ID: users/{uid}/videos/{videoId}/clips/{clipId} (Cloudinary)
    if (normalized === "completed" && remote.resultUrl && !job.clipStoragePath && !job.cloudinaryPublicId) {
      const videoId = job.sourceVideoId;
      const clipId = remote.clips?.[0]?.clipId || `clip_${jobId}_${Date.now().toString(36)}`;
      const publicId = `users/${user.uid}/videos/${videoId}/clips/${clipId}`;
      const cfg = getCloudinaryConfig();

      if (!remote.resultUrl.includes("storage.mock")) {
        try {
          if (isCloudinaryMock() || cfg.isMock) {
            // Mock: generate playable Cloudinary URL
            const hash = clipId.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
            const so = hash % 15;
            const eo = so + 5;
            const secureUrl = `https://res.cloudinary.com/${cfg.cloudName || "demo"}/video/upload/so_${so},eo_${eo}/dog.mp4`;
            updates.clipStoragePath = publicId;
            updates.cloudinaryPublicId = publicId;
            updates.cloudinarySecureUrl = secureUrl;
            updates.resultUrl = secureUrl;
            updates.resourceType = "video";
            updates.format = "mp4";
          } else {
            const cld = getCloudinary();
            const uploadResult: any = await cld.uploader.upload(remote.resultUrl, {
              resource_type: "video",
              public_id: publicId,
              overwrite: false,
              folder: `users/${user.uid}/videos/${videoId}/clips`,
            });
            updates.clipStoragePath = uploadResult.public_id;
            updates.cloudinaryPublicId = uploadResult.public_id;
            updates.cloudinarySecureUrl = uploadResult.secure_url;
            updates.resultUrl = uploadResult.secure_url;
            updates.resourceType = uploadResult.resource_type;
            updates.format = uploadResult.format;
            updates.bytes = uploadResult.bytes;
            updates.width = uploadResult.width;
            updates.height = uploadResult.height;
            updates.duration = uploadResult.duration;
          }
          // Also save to clips collection for library persistence
          try {
            await (db as any).doc(`users/${user.uid}/videos/${videoId}/clips/${clipId}`).set({
              clipId, videoId, userId: user.uid, cloudinaryPublicId: updates.cloudinaryPublicId, cloudinarySecureUrl: updates.cloudinarySecureUrl,
              resourceType: "video", format: "mp4", status: "COMPLETED", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            }, { merge: false });
          } catch {}
        } catch (e: any) {
          console.error("[clipforge] failed to move clip to Cloudinary:", e);
          const fallback = `https://res.cloudinary.com/${cfg.cloudName || "demo"}/video/upload/dog.mp4`;
          updates.clipStoragePath = publicId;
          updates.cloudinaryPublicId = publicId;
          updates.cloudinarySecureUrl = fallback;
          updates.resultUrl = fallback;
          updates.error = `Clip stored at ClipForge but failed to copy to Cloudinary: ${e.message}`;
        }
      } else {
        // Mock mode: generate Cloudinary URL instead of storage.mock
        const hash = clipId.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
        const so = hash % 15; const eo = so + 5;
        const secureUrl = `https://res.cloudinary.com/${cfg.cloudName || "demo"}/video/upload/so_${so},eo_${eo}/dog.mp4`;
        updates.clipStoragePath = publicId;
        updates.cloudinaryPublicId = publicId;
        updates.cloudinarySecureUrl = secureUrl;
        updates.resultUrl = secureUrl;
        updates.resourceType = "video";
        updates.format = "mp4";
      }
    }

    // Update Firestore if status changed (idempotent)
    if (updates.status !== job.status || updates.resultUrl || updates.error !== job.error) {
      await docRef.set(updates, { merge: true });
    }

    // Return merged job
    const merged = { ...job, ...updates, clipforgeJobId: jobId };

    // For completed jobs, include resultUrl for client to display
    return NextResponse.json({ job: merged });
  } catch (e: any) {
    const status = e.status || 500;
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[clipforge] GET /jobs/[jobId] error:", e);
    return NextResponse.json({ error: e.message || "Failed to get job" }, { status: 500 });
  }
}
