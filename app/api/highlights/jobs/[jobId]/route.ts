import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { pollHighlightsJob } from "@/lib/highlights/server";

export const dynamic = "force-dynamic";

// GET /api/highlights/jobs/[jobId] — get/poll job status (short, Netlify-safe)
// Updates progress from ClipForge and triggers highlight generation when completed
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const jobId = params.jobId;

    const _db = await getAdminDb();
    const path = `users/${uid}/jobs/${jobId}`;
    const snap = await _db.doc(path).get();
    if (!snap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const job = snap.data() as any;
    if (job.ownerId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Poll ClipForge for latest status (short operation)
    const updated = await pollHighlightsJob(uid, jobId);
    return NextResponse.json({ job: updated });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    if (status === 404) return NextResponse.json({ error: e.message || "Job not found" }, { status: 404 });
    console.error("[highlights/jobs] poll error", e);
    return NextResponse.json({ error: e.message || "Failed to poll job" }, { status: 500 });
  }
}

// PATCH /api/highlights/jobs/[jobId] — update job (for worker)
// Body: { status, progress, error, lockedAt, lockedBy } — worker only, verify via internal secret or same user?
export async function PATCH(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const jobId = params.jobId;
    const body = await req.json().catch(() => ({}));

    const _db = await getAdminDb();
    const path = `users/${uid}/jobs/${jobId}`;
    const snap = await _db.doc(path).get();
    if (!snap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const job = snap.data() as any;
    if (job.ownerId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updates: any = { updatedAt: new Date().toISOString() };
    if (body.status) updates.status = body.status.toUpperCase();
    if (body.progress !== undefined) updates.progress = Number(body.progress);
    if (body.error !== undefined) updates.error = body.error;
    if (body.lockedAt !== undefined) updates.lockedAt = body.lockedAt;
    if (body.lockedBy !== undefined) updates.lockedBy = body.lockedBy;

    await _db.doc(path).set(updates, { merge: true });
    const fresh = await _db.doc(path).get();
    return NextResponse.json({ job: fresh.data() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update" }, { status: 500 });
  }
}
