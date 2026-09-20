import { NextRequest, NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getClipForgeJobStatus, normalizeClipForgeStatus } from "@/lib/clipforge/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";

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

    // If completed and we have a resultUrl, move clip to Firebase Storage
    // Path: users/{uid}/videos/{videoId}/clips/{clipId}.mp4
    if (normalized === "completed" && remote.resultUrl && !job.clipStoragePath) {
      const videoId = job.sourceVideoId;
      const clipId = remote.clips?.[0]?.clipId || `clip_${jobId}_${Date.now().toString(36)}`;
      const storagePath = `users/${user.uid}/videos/${videoId}/clips/${clipId}.mp4`;

      // Only download/upload if not mock and we have storage
      if (!remote.resultUrl.includes("storage.mock")) {
        try {
          const storage = await getAdminStorage();
          if (storage) {
            const resp = await fetch(remote.resultUrl);
            if (!resp.ok) throw new Error(`Failed to fetch ClipForge result: ${resp.status}`);
            const buffer = Buffer.from(await resp.arrayBuffer());
            const bucket = storage.bucket();
            const file = bucket.file(storagePath);
            await file.save(buffer, { contentType: "video/mp4", resumable: false });
            // Make file downloadable via Firebase Storage download URL (optional, not public)
            const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 1000 * 60 * 60 * 24 * 7 } as any).catch(() => [null]);
            updates.clipStoragePath = storagePath;
            updates.resultUrl = url || remote.resultUrl;
          } else {
            updates.clipStoragePath = storagePath;
            updates.resultUrl = remote.resultUrl;
          }
        } catch (e: any) {
          console.error("[clipforge] failed to move clip to Firebase Storage:", e);
          // Don't fail the whole request; keep resultUrl as ClipForge URL
          updates.clipStoragePath = storagePath;
          updates.resultUrl = remote.resultUrl;
          updates.error = `Clip stored at ClipForge but failed to copy to Firebase: ${e.message}`;
        }
      } else {
        // Mock mode: just pretend we stored it
        updates.clipStoragePath = storagePath;
        updates.resultUrl = remote.resultUrl;
      }

      // Also create a completed clip entry for dashboard (optional)
      // We keep job as source of truth; dashboard reads jobs collection
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
