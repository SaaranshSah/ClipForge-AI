import { NextRequest, NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { retryClipForgeJob } from "@/lib/clipforge/server";
import { getAdminDb } from "@/lib/firebase-admin";

// POST /api/clipforge/jobs/[jobId]/retry — retry failed job
export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const jobId = params.jobId;
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  try {
    const user = await getClipForgeUser();
    const db = await getAdminDb();
    const docRef = (db as any).doc(`users/${user.uid}/jobs/${jobId}`);
    const snap = await docRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const job = snap.data();

    if (!["failed", "cancelled"].includes(job.status)) {
      return NextResponse.json({ error: `Cannot retry job in status ${job.status}`, code: "INVALID_STATUS" }, { status: 400 });
    }

    let remote;
    try {
      remote = await retryClipForgeJob(jobId);
    } catch (e: any) {
      return NextResponse.json({ error: e.message, code: e.code || "CLIPFORGE_FAILURE", retryable: !!e.retryable }, { status: e.status || 502 });
    }

    const now = new Date().toISOString();
    const updates = {
      status: "queued" as const,
      updatedAt: now,
      error: null,
      progress: 0,
      attempts: (job.attempts || 1) + 1,
    };
    await docRef.set(updates, { merge: true });

    return NextResponse.json({ job: { ...job, ...updates } });
  } catch (e: any) {
    const status = e.status || 500;
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Retry failed" }, { status: 500 });
  }
}
