import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { pollHighlightsJob, lockHighlightsJob, createHighlightsJob, discoverEligibleVideos } from "@/lib/highlights/server";
import type { HighlightsJobDoc } from "@/lib/highlights/types";

export const dynamic = "force-dynamic";

// POST /api/worker/highlights/tick — worker tick, processes next queued job
// Protected by worker secret: header x-worker-secret == WORKER_SECRET or CLIPFORGE_API_KEY fallback
// Long-running work delegated here so Netlify Functions stay short (<8s) — heavy lifting in Python worker

function isAuthorized(req: NextRequest | Request): boolean {
  // In development, allow worker tick without secret for testing
  if (process.env.NODE_ENV === "development") return true;
  const secret = req.headers.get("x-worker-secret") || req.headers.get("authorization")?.replace("Bearer ", "") || req.headers.get("x-api-key") || "";
  const expected = process.env.WORKER_SECRET || process.env.CLIPFORGE_API_KEY || process.env.CLIPFORGE_WEBHOOK_SECRET;
  if (!expected) return true; // if no secret configured, allow (dev)
  if (!secret) return false;
  // Trim and compare
  return secret.trim() === expected.trim();
}

// Helper to scan all highlights jobs across users — Firestore collection group scan simulated by listing users
async function findNextPendingJob(): Promise<{ uid: string; job: HighlightsJobDoc } | null> {
  const db = await getAdminDb();
  // Firestore doesn't have easy collectionGroup for users/{uid}/jobs without enabling index;
  // we instead list via Admin SDK: try to list all users/{uid}/jobs by scanning users collection
  // For mock DB (in-memory), we can fallback to scanning db directly

  // Attempt to use our mock-aware db: we can try to get all docs via db.collectionGroup if available
  try {
    // Try real Firestore collectionGroup
    const cg = (db as any).collectionGroup?.("jobs");
    if (cg) {
      const snap = await cg.get();
      const jobs: Array<{ uid: string; job: HighlightsJobDoc }> = [];
      for (const doc of snap.docs as any[]) {
        const data = doc.data() as HighlightsJobDoc;
        if (data.jobType !== "highlights") continue;
        if (!["QUEUED", "RETRYING", "PROCESSING"].includes(data.status)) continue;
        // Extract uid from path: users/{uid}/jobs/{jobId}
        const path: string = doc.ref.path || doc.ref._path?.segments?.join("/") || "";
        const match = path.match(/^users\/([^/]+)\/jobs\/([^/]+)$/);
        const uid = match ? match[1] : (data.ownerId as string);
        if (!uid) continue;
        jobs.push({ uid, job: data });
      }
      if (jobs.length === 0) return null;
      // Sort by createdAt asc (oldest first) for FIFO
      jobs.sort((a, b) => new Date(a.job.createdAt).getTime() - new Date(b.job.createdAt).getTime());
      // Prefer QUEUED/RETRYING over PROCESSING, and oldest
      const queued = jobs.find((j) => j.job.status === "QUEUED" || j.job.status === "RETRYING");
      return queued || jobs[0];
    }
  } catch {}

  // Fallback: scan users collection (and mockStore if users empty)
  try {
    const usersSnap = await db.collection("users").get();
    let uids: string[] = (usersSnap.docs as any[]).map((d: any) => d.id);
    // If users collection empty (mock), scan mockStore for user ids from jobs/videos collections
    if (uids.length === 0) {
      try {
        const { __getMockStore } = await import("@/lib/firebase-admin");
        const store = __getMockStore();
        const uidSet = new Set<string>();
        for (const colPath of store.keys()) {
          const m = colPath.match(/^users\/([^/]+)\//);
          if (m) uidSet.add(m[1]);
        }
        uids = Array.from(uidSet);
      } catch {}
    }
    let best: { uid: string; job: HighlightsJobDoc } | null = null;
    for (const uid of uids) {
      const jobsSnap = await db.collection(`users/${uid}/jobs`).get();
      for (const jobDoc of (jobsSnap.docs as any[])) {
        const data = jobDoc.data() as HighlightsJobDoc;
        if (data.jobType !== "highlights") continue;
        if (!["QUEUED", "RETRYING", "PROCESSING"].includes(data.status)) continue;
        const candidate = { uid, job: data };
        if (!best) best = candidate;
        else {
          // Prefer QUEUED/RETRYING
          const aPending = ["QUEUED", "RETRYING"].includes(candidate.job.status);
          const bPending = ["QUEUED", "RETRYING"].includes(best.job.status);
          if (aPending && !bPending) best = candidate;
          else if (aPending === bPending) {
            if (new Date(candidate.job.createdAt).getTime() < new Date(best.job.createdAt).getTime()) best = candidate;
          }
        }
      }
    }
    return best;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized worker", code: "UNAUTHORIZED_WORKER" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const workerId = body.workerId || req.headers.get("x-worker-id") || `worker_${Date.now().toString(36)}`;
  const discoverMode = body.discover === true || req.nextUrl.searchParams.get("discover") === "1";

  try {
    // Optionally also discover eligible videos and auto-queue them (helps catch videos uploaded before V3)
    if (discoverMode) {
      const db = await getAdminDb();
      let discovered = 0;
      let queued = 0;
      // Find users with videos but no job
      try {
        const usersSnap = await db.collection("users").get();
        for (const userDoc of (usersSnap.docs as any[])) {
          const uid = userDoc.id;
          // Limit per tick to avoid long execution
          const eligible = await discoverEligibleVideos(uid, 3);
          for (const v of eligible) {
            discovered++;
            try {
              const { created } = await createHighlightsJob({ uid, videoId: v.videoId, sourceUrl: v.sourceUrl, filename: v.filename, duration: v.duration ?? null });
              if (created) queued++;
            } catch {}
            if (queued >= 3) break;
          }
          if (queued >= 5) break;
        }
      } catch {}
      if (queued > 0) {
        return NextResponse.json({ ok: true, mode: "discover", discovered, queued });
      }
    }

    const next = await findNextPendingJob();
    if (!next) {
      return NextResponse.json({ ok: true, message: "No pending highlights jobs", idle: true }, { status: 200 });
    }

    const { uid, job } = next;

    // Lock job
    const locked = await lockHighlightsJob(uid, job.jobId, workerId);
    if (!locked) {
      return NextResponse.json({ ok: true, message: `Job ${job.jobId} locked by another worker`, locked: true }, { status: 200 });
    }

    // Poll ClipForge and generate highlights — this is short (<2s) but covers scoring
    const updated = await pollHighlightsJob(uid, job.jobId);

    return NextResponse.json({ ok: true, job: updated, workerId });
  } catch (e: any) {
    console.error("[worker/highlights/tick] error", e);
    return NextResponse.json({ error: e.message || "Worker tick failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const next = await findNextPendingJob();
  if (!next) return NextResponse.json({ ok: true, pending: 0, idle: true });
  return NextResponse.json({ ok: true, pending: 1, next: { uid: next.uid, jobId: next.job.jobId, videoId: next.job.videoId, status: next.job.status, progress: next.job.progress } });
}
