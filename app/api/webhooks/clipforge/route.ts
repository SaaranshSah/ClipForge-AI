import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, __getMockStore } from "@/lib/firebase-admin";
import { createHmac, timingSafeEqual } from "crypto";
import type { HighlightsJobDoc } from "@/lib/highlights/types";

export const dynamic = "force-dynamic";

// POST /api/webhooks/clipforge
// ClipForge AI -> ClipForge SaaS will POST job status when AI completes
// Body: { jobId, status, clips?, error?, progress?, resultUrl? } OR { data: {...} }
// Must be verified via HMAC with CLIPFORGE_WEBHOOK_SECRET, idempotent, retry-safe
// Documentation: Current official ClipForge AI SaaS docs should be used — this handler supports Bearer + x-api-key + HMAC

function verifyHmacSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  // ClipForge may send header `x-clipforge-signature` or `x-webhook-signature` as hex HMAC SHA256
  // We support both `sha256=` prefix and raw hex
  const cleanSig = signature.replace(/^sha256=/, "").trim();
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const a = Buffer.from(cleanSig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    // Fallback string compare if not hex
    return cleanSig === expected;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLIPFORGE_WEBHOOK_SECRET || "";
  const apiKey = process.env.CLIPFORGE_API_KEY || "";

  // Read raw body for HMAC verification — need to buffer
  const rawBody = await req.text();
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify: check HMAC header first, else check Bearer/api-key as fallback
  const signature = req.headers.get("x-clipforge-signature") || req.headers.get("x-webhook-signature") || req.headers.get("x-signature") || null;
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key") || "";

  let verified = false;
  if (secret && signature) {
    verified = verifyHmacSignature(rawBody, signature, secret);
    if (!verified) {
      console.warn("[webhooks/clipforge] HMAC verification failed");
      return NextResponse.json({ error: "Invalid signature", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
  } else if (apiKey && (authHeader.includes(apiKey) || authHeader === `Bearer ${apiKey}` || authHeader === apiKey)) {
    verified = true;
  } else if (!secret && !apiKey) {
    // No secret configured — allow in dev/mock mode but log
    console.warn("[webhooks/clipforge] no CLIPFORGE_WEBHOOK_SECRET / CLIPFORGE_API_KEY — accepting webhook in dev mode");
    verified = true;
  } else if (secret && !signature) {
    // In production, require signature if secret is set
    console.warn("[webhooks/clipforge] missing signature header");
    return NextResponse.json({ error: "Missing signature", code: "MISSING_SIGNATURE" }, { status: 401 });
  }

  // Extract jobId and status — support multiple payload shapes from ClipForge docs
  // Our lib/clipforge/server sends project fpq and expects { jobId, status, clips }
  const payload = body.data || body.result || body;
  const jobId: string | undefined = payload.jobId || payload.job_id || payload.id || body.jobId || body.job_id;
  const status: string | undefined = payload.status || body.status;
  const clips = payload.clips || body.clips || null;
  const errorMsg = payload.error || body.error || null;
  const progress = payload.progress ?? body.progress ?? null;
  const resultUrl = payload.resultUrl || payload.result_url || body.resultUrl || null;

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  // Find job across all users — we need ownerId to locate Firestore doc
  const db = await getAdminDb();
  let ownerId: string | null = null;
  let job: HighlightsJobDoc | null = null;

  // Try to find job by scanning users (or use collectionGroup if available)
  try {
    const cg = (db as any).collectionGroup?.("jobs");
    if (cg) {
      const snap = await cg.where("jobId", "==", jobId).get().catch(async () => {
        // Fallback if where not supported in mock
        return cg.get();
      });
      for (const doc of snap.docs as any[]) {
        const data = doc.data() as HighlightsJobDoc;
        if (data.jobId === jobId && data.jobType === "highlights") {
          job = data;
          const path: string = doc.ref.path || "";
          const m = path.match(/^users\/([^/]+)\/jobs\/([^/]+)$/);
          ownerId = m ? m[1] : (data.ownerId as string);
          break;
        }
      }
    }
  } catch {}

  if (!job) {
    try {
      const usersSnap = await db.collection("users").get();
      for (const userDoc of (usersSnap.docs as any[])) {
        const uid = userDoc.id;
        const jSnap = await db.doc(`users/${uid}/jobs/${jobId}`).get();
        if (jSnap.exists) {
          const data = jSnap.data() as HighlightsJobDoc;
          if (data.jobType === "highlights") {
            job = data;
            ownerId = uid;
            break;
          }
        }
      }
    } catch {}
  }

  // Fallback for mock Firestore: scan mockStore directly (since users collection may be empty in mock)
  if (!job) {
    try {
      const store = __getMockStore();
      for (const [colPath, map] of store.entries()) {
        if (!colPath.endsWith("/jobs")) continue;
        for (const [docId, data] of map.entries()) {
          if (docId === jobId && (data as HighlightsJobDoc).jobType === "highlights") {
            job = data as HighlightsJobDoc;
            const m = colPath.match(/^users\/([^/]+)\/jobs$/);
            ownerId = m ? m[1] : (data as HighlightsJobDoc).ownerId;
            break;
          }
        }
        if (job) break;
      }
    } catch {}
  }

  if (!job || !ownerId) {
    // Idempotent: if job not found, we still return 200 to avoid webhook retries looping
    // But log for debugging — ClipForge mock may use different jobId format
    console.warn(`[webhooks/clipforge] job ${jobId} not found — ignoring (idempotent 200)`);
    return NextResponse.json({ ok: true, message: "Job not found — ignored (idempotent)", jobId }, { status: 200 });
  }

  // Idempotency: if job already in terminal state matching webhook status, return 200
  const normalizedWebhookStatus = (status || "").toUpperCase();
  const jobAlreadyTerminal = ["COMPLETED", "FAILED"].includes(job.status);
  if (jobAlreadyTerminal) {
    // If webhook says completed but job is already completed, don't duplicate highlights
    console.log(`[webhooks/clipforge] job ${jobId} already ${job.status} — webhook idempotent`);
    return NextResponse.json({ ok: true, message: "Already terminal (idempotent)", job }, { status: 200 });
  }

  // Determine new job status from webhook
  let newStatus: HighlightsJobDoc["status"] = job.status;
  let newProgress = job.progress;
  if (normalizedWebhookStatus === "COMPLETED" || normalizedWebhookStatus === "SUCCEEDED" || normalizedWebhookStatus === "SUCCESS") {
    newStatus = "COMPLETED";
    newProgress = 85;
  } else if (normalizedWebhookStatus === "FAILED" || normalizedWebhookStatus === "ERROR" || normalizedWebhookStatus === "CANCELLED") {
    // Check retry limit
    if (job.attempts < (job.maxAttempts || 3)) {
      newStatus = "RETRYING";
    } else {
      newStatus = "FAILED";
    }
    newProgress = job.progress;
  } else if (["PROCESSING", "RUNNING", "IN_PROGRESS", "QUEUED"].includes(normalizedWebhookStatus)) {
    newStatus = "PROCESSING";
    newProgress = progress ?? 50;
  }

  const now = new Date().toISOString();
  const auditFrom = job.status;
  const auditTo = newStatus;

  // Update job with webhook data
  const updates: Partial<HighlightsJobDoc> = {
    status: newStatus,
    progress: newProgress,
    updatedAt: now,
    error: errorMsg || null,
    auditLog: [...(job.auditLog || []), { at: now, from: auditFrom, to: auditTo, by: "webhook:clipforge", note: `Webhook ${normalizedWebhookStatus} clips=${clips?.length ?? 0}` }],
  };

  // Handle failure retry counting
  if (newStatus === "RETRYING") {
    updates.attempts = job.attempts + 1;
  } else if (newStatus === "FAILED") {
    updates.attempts = job.attempts + 1;
    updates.lockedAt = null;
    updates.lockedBy = null;
  }

  await db.doc(`users/${ownerId}/jobs/${jobId}`).set(updates, { merge: true });

  // Also update video aiStatus
  try {
    await db.doc(`users/${ownerId}/videos/${job.videoId}`).set({ aiStatus: newStatus, aiProgress: newProgress, aiError: errorMsg || null, aiUpdatedAt: now }, { merge: true });
  } catch {}

  // If completed, trigger highlight generation (scoring -> clips) — short, scoring is fast
  if (newStatus === "COMPLETED") {
    try {
      const { generateHighlightsForJob } = await import("@/lib/highlights/server");
      // Build a ClipForge-like status object for generation
      const cfStatus = {
        jobId,
        status: "completed",
        progress: 100,
        clips: clips || null,
        resultUrl: resultUrl || null,
      };
      await generateHighlightsForJob(ownerId, job.videoId, jobId, cfStatus);
      // Finalize job progress 100
      await db.doc(`users/${ownerId}/jobs/${jobId}`).set({ progress: 100, updatedAt: new Date().toISOString() }, { merge: true });
      try {
        await db.doc(`users/${ownerId}/videos/${job.videoId}`).set({ aiProgress: 100, aiStatus: "COMPLETED", aiUpdatedAt: new Date().toISOString() }, { merge: true });
      } catch {}
    } catch (e: any) {
      console.error("[webhooks/clipforge] highlight generation failed", e);
      // Don't fail webhook — we already marked completed, generation can be retried via worker tick
    }
  }

  console.log(`[webhooks/clipforge] processed ${jobId} ${auditFrom} -> ${newStatus} for ${ownerId}/${job.videoId}`);

  return NextResponse.json({ ok: true, jobId, status: newStatus, ownerId }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/webhooks/clipforge",
    verification: "HMAC SHA256 x-clipforge-signature with CLIPFORGE_WEBHOOK_SECRET, or Bearer CLIPFORGE_API_KEY, idempotent",
    project: "fpq",
    longRunning: "ClipForge AI runs externally; webhook updates Firestore users/{uid}/videos/{videoId}/highlights and clips",
  });
}
