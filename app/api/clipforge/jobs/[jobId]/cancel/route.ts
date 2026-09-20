import { NextRequest, NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { cancelClipForgeJob } from "@/lib/clipforge/server";
import { getAdminDb } from "@/lib/firebase-admin";

// POST /api/clipforge/jobs/[jobId]/cancel — cancel queued/processing job
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

    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return NextResponse.json({ error: `Cannot cancel job in status ${job.status}` }, { status: 400 });
    }

    let remote;
    try {
      remote = await cancelClipForgeJob(jobId);
    } catch (e: any) {
      // If ClipForge doesn't support cancel, we still mark cancelled locally
      console.warn("[clipforge] cancel failed, marking cancelled locally:", e.message);
      remote = { jobId, status: "cancelled" as const };
    }

    const updates = {
      status: "cancelled" as const,
      updatedAt: new Date().toISOString(),
    };
    await docRef.set(updates, { merge: true });

    return NextResponse.json({ job: { ...job, ...updates } });
  } catch (e: any) {
    const status = e.status || 500;
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Cancel failed" }, { status: 500 });
  }
}
