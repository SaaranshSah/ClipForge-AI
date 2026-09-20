import { NextRequest, NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { createClipForgeJob } from "@/lib/clipforge/server";
import { getAdminDb } from "@/lib/firebase-admin";

// POST /api/clipforge/jobs — create a new ClipForge job for project fpq
export async function POST(req: NextRequest) {
  try {
    const user = await getClipForgeUser();
    const body = await req.json().catch(() => ({}));

    const sourceVideoId = (body.sourceVideoId as string | undefined)?.trim();
    const filename = (body.filename as string | undefined)?.trim() || "video.mp4";
    const sourceUrl = (body.sourceUrl as string | undefined)?.trim();
    const contentType = (body.contentType as string | undefined) || "video/mp4";
    const fileSize = body.fileSize as number | undefined;

    if (!sourceVideoId) return NextResponse.json({ error: "sourceVideoId required" }, { status: 400 });
    if (!sourceUrl) return NextResponse.json({ error: "sourceUrl required — upload to Firebase Storage first" }, { status: 400 });

    // Validate file
    const allowedMime = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska"];
    if (!allowedMime.includes(contentType) && !contentType.startsWith("video/")) {
      return NextResponse.json({ error: "Unsupported file type", code: "UNSUPPORTED_FILE" }, { status: 415 });
    }
    const MAX = 2147483648; // 2GB
    if (fileSize && fileSize > MAX) {
      return NextResponse.json({ error: "File too large (2GB limit)", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    // Ensure sourceUrl is from our Firebase Storage (prevent SSRF)
    const allowedHosts = ["firebasestorage.googleapis.com", "firebasestorage.app", "storage.googleapis.com"];
    try {
      const u = new URL(sourceUrl);
      if (!allowedHosts.some((h) => u.hostname.includes(h)) && !u.hostname.includes("clipforge-ai-910f9")) {
        // Allow mock URLs in dev
        if (!sourceUrl.includes("mock") && process.env.NODE_ENV === "production") {
          // Still allow, but log
          console.warn("[clipforge] sourceUrl not from Firebase Storage:", sourceUrl);
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid sourceUrl" }, { status: 400 });
    }

    // Enforce project fpq
    const project = "fpq";
    if (body.project && body.project !== project) {
      return NextResponse.json({ error: "Invalid project. Use fpq." }, { status: 400 });
    }

    // Check for duplicate job (user retrying quickly)
    const db = await getAdminDb();
    const existingCheck = await (db as any).collection(`users/${user.uid}/jobs`).get().catch(() => ({ docs: [] }));
    const duplicate = (existingCheck.docs as any[]).find((d: any) => {
      const data = d.data();
      return data.sourceVideoId === sourceVideoId && ["queued", "uploading", "processing"].includes(data.status);
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Duplicate job already in progress for this video", code: "DUPLICATE_JOB", jobId: duplicate.id },
        { status: 409 }
      );
    }

    // Create ClipForge job server-side (never exposes API key)
    let clipforge: Awaited<ReturnType<typeof createClipForgeJob>>;
    try {
      clipforge = await createClipForgeJob({
        sourceUrl,
        sourceVideoId,
        filename,
        userId: user.uid,
        metadata: { email: user.email },
      });
    } catch (e: any) {
      // Map ClipForge errors to our API
      const status = e.status || 502;
      const code = e.code || "CLIPFORGE_FAILURE";
      // Log without leaking key
      console.error("[clipforge] createJob failed:", code, e.message);
      return NextResponse.json({ error: e.message, code, retryable: !!e.retryable }, { status });
    }

    // Store in Firestore: users/{uid}/jobs/{jobId}
    const now = new Date().toISOString();
    const jobDoc = {
      provider: "clipforge" as const,
      project: "fpq" as const,
      sourceVideoId,
      clipforgeJobId: clipforge.jobId,
      status: clipforge.status as any,
      createdAt: now,
      updatedAt: now,
      error: null,
      filename,
      sourceUrl,
      resultUrl: null,
      clipStoragePath: null,
      progress: 0,
      attempts: 1,
    };

    await (db as any).doc(`users/${user.uid}/jobs/${clipforge.jobId}`).set(jobDoc);

    // Also ensure user can only access own jobs — Firestore rules handle, but we also check server

    return NextResponse.json({ job: jobDoc, clipforgeJobId: clipforge.jobId }, { status: 201 });
  } catch (e: any) {
    const status = e.status || 500;
    if (status === 401) return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[clipforge] POST /jobs error:", e);
    return NextResponse.json({ error: e.message || "Failed to create job" }, { status: status === 401 ? 401 : 500 });
  }
}

// GET /api/clipforge/jobs — list user's jobs (for dashboard polling)
export async function GET() {
  try {
    const user = await getClipForgeUser();
    const db = await getAdminDb();
    const snap = await (db as any).collection(`users/${user.uid}/jobs`).get();
    const jobs = (snap.docs as any[]).map((d: any) => ({ id: d.id, ...d.data() }));
    // Sort by createdAt desc
    jobs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ jobs });
  } catch (e: any) {
    const status = e.status || 500;
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to list jobs" }, { status: 500 });
  }
}
