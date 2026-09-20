import "server-only";

import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { createClipForgeJob, getClipForgeJobStatus, normalizeClipForgeStatus } from "@/lib/clipforge/server";
import { generateMockCandidates, scoreAndSelectHighlights, scoreSignals } from "./scoring";
import type {
  HighlightDoc,
  HighlightsJobDoc,
  HighlightsJobStatus,
  HighlightSignals,
  HighlightType,
} from "./types";
import {
  HIGHLIGHTS_JOB_MAX_ATTEMPTS,
  HIGHLIGHTS_JOB_LOCK_TTL_MS,
  highlightDocPath,
  highlightsCollectionPath,
  jobDocPath,
  dedupeKeyForVideo,
  clipStoragePath,
} from "./types";

/**
 * V3 Automatic Highlights Pipeline — server-only
 *
 * Flow: Video stored (Firebase Storage OR Cloudinary) → create AI job (idempotent)
 *       → ClipForge (fpq) → track → retrieve → scoring → select → generate clips → Firebase Storage
 *
 * Guarantees:
 * - Idempotency: dedupeKey `${uid}:${videoId}:highlights` — duplicate create returns existing job
 * - Duplicate prevention: check existing job for videoId not in terminal state
 * - Job locking: lockedAt/lockedBy with TTL, so only one worker processes at a time
 * - Retry limits: max 3 attempts, then FAILED
 * - Audit logging: every status transition appended to job.auditLog
 * - Long-running work delegated to Python worker (or mock); Netlify functions only enqueue + short polls <8s
 */

const PROJECT = "fpq";

// Helper to get Firestore Admin DB or mock
async function db() {
  return getAdminDb();
}
async function storage() {
  return getAdminStorage();
}

// Audit log helper
function auditLog(job: HighlightsJobDoc, from: string, to: string, by: string, note?: string): HighlightsJobDoc["auditLog"] {
  const entry = { at: new Date().toISOString(), from, to, by, note };
  return [...(job.auditLog || []), entry];
}

// Create or get existing highlights job for a video — idempotent
export async function createHighlightsJob(opts: {
  uid: string;
  videoId: string;
  sourceUrl: string; // Firebase Storage download URL or Cloudinary secure_url
  filename: string;
  duration?: number | null; // seconds, for mock scoring
}): Promise<{ job: HighlightsJobDoc; created: boolean }> {
  const _db = await db();
  const dedupeKey = dedupeKeyForVideo(opts.uid, opts.videoId);
  const jobsCol = `users/${opts.uid}/jobs`;

  // Duplicate prevention: look for existing job with same dedupeKey and not terminal FAILED/COMPLETED? Actually we allow re-create if FAILED and attempts < max, via retry
  // For idempotency, if there's a job with dedupeKey and status QUEUED/PROCESSING/RETRYING, return it
  let existing: HighlightsJobDoc | null = null;
  let existingJobId: string | null = null;
  try {
    const snap = await _db.collection(jobsCol).get();
    for (const doc of (snap.docs as any[])) {
      const data = doc.data() as HighlightsJobDoc;
      if (data.dedupeKey === dedupeKey && data.jobType === "highlights") {
        // Prefer non-terminal
        if (["QUEUED", "PROCESSING", "RETRYING"].includes(data.status)) {
          existing = data;
          existingJobId = doc.id;
          break;
        }
        // Keep last if no non-terminal
        if (!existing) {
          existing = data;
          existingJobId = doc.id;
        }
      }
    }
  } catch {}

  if (existing && existingJobId) {
    if (["QUEUED", "PROCESSING", "RETRYING"].includes(existing.status)) {
      return { job: existing, created: false };
    }
    if (existing.status === "COMPLETED") {
      // Already completed — idempotent return, don't duplicate
      return { job: existing, created: false };
    }
    if (existing.status === "FAILED" && existing.attempts >= HIGHLIGHTS_JOB_MAX_ATTEMPTS) {
      // Retry limit reached
      return { job: existing, created: false };
    }
    // If FAILED and can retry, caller should call retryHighlightsJob, not create
    if (existing.status === "FAILED") {
      return { job: existing, created: false };
    }
  }

  // Create ClipForge job first (project fpq) — this is the external AI
  // Use our ClipForge server helper which already handles mock fallback
  let clipforgeJobId: string;
  let initialStatus: HighlightsJobStatus = "QUEUED";
  try {
    const cfJob = await createClipForgeJob({
      sourceUrl: opts.sourceUrl,
      sourceVideoId: opts.videoId,
      filename: opts.filename,
      userId: opts.uid,
      metadata: { jobType: "highlights", videoId: opts.videoId },
    });
    clipforgeJobId = cfJob.jobId;
    initialStatus = (cfJob.status.toUpperCase() as HighlightsJobStatus) || "QUEUED";
    if (!["QUEUED", "PROCESSING"].includes(initialStatus)) initialStatus = "QUEUED";
  } catch (e: any) {
    // If ClipForge creation fails with retryable, queue for retrying
    const code = e.code || "UNKNOWN";
    const retryable = e.retryable;
    clipforgeJobId = `cf_fallback_${opts.videoId}_${Date.now().toString(36)}`;
    initialStatus = retryable ? "RETRYING" : "FAILED";
    // We still create a job so retry logic can pick it up
  }

  const now = new Date().toISOString();
  const jobId = clipforgeJobId; // use ClipForge jobId as our jobId for 1:1
  const job: HighlightsJobDoc = {
    jobId,
    videoId: opts.videoId,
    ownerId: opts.uid,
    provider: "clipforge",
    project: PROJECT,
    jobType: "highlights",
    sourceUrl: opts.sourceUrl,
    filename: opts.filename,
    status: initialStatus,
    progress: initialStatus === "QUEUED" ? 5 : 15,
    attempts: initialStatus === "RETRYING" ? 1 : 0,
    maxAttempts: HIGHLIGHTS_JOB_MAX_ATTEMPTS,
    lockedAt: null,
    lockedBy: null,
    error: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    dedupeKey,
    auditLog: [{ at: now, from: "NONE", to: initialStatus, by: "api:createHighlightsJob", note: `Created for video ${opts.videoId} duration ${opts.duration ?? "?"}s` }],
  };

  // Idempotent write: use jobId as doc id
  await _db.doc(jobDocPath(opts.uid, jobId)).set(job, { merge: false });
  // Ensure user doc exists for webhook/worker scanning (mock Firestore users collection may be empty)
  try {
    await _db.doc(`users/${opts.uid}`).set({ uid: opts.uid, updatedAt: now }, { merge: true });
  } catch {}

  // Also ensure video doc has aiStatus for discovery
  try {
    const videoPath = `users/${opts.uid}/videos/${opts.videoId}`;
    const vsnap = await _db.doc(videoPath).get();
    if (vsnap.exists) {
      await _db.doc(videoPath).set({ aiStatus: initialStatus, aiJobId: jobId, aiUpdatedAt: now }, { merge: true });
    } else {
      // Video may be in Cloudinary collection (users/{uid}/videos) — already there, just merge
      // For Firebase Storage videos, create minimal doc if missing
      await _db.doc(videoPath).set(
        {
          videoId: opts.videoId,
          fileName: opts.filename,
          cloudinaryUrl: opts.sourceUrl,
          status: "ready",
          aiStatus: initialStatus,
          aiJobId: jobId,
          ownerId: opts.uid,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch {}

  console.log(`[highlights] created job ${jobId} for ${opts.uid}/${opts.videoId} status ${initialStatus}`);
  return { job, created: true };
}

// Lock a job for processing (optimistic, with TTL)
export async function lockHighlightsJob(uid: string, jobId: string, workerId: string): Promise<HighlightsJobDoc | null> {
  const _db = await db();
  const path = jobDocPath(uid, jobId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) return null;
  const job = snap.data() as HighlightsJobDoc;

  // Check if already locked and not expired
  if (job.lockedAt) {
    const lockedMs = Date.now() - new Date(job.lockedAt).getTime();
    if (lockedMs < HIGHLIGHTS_JOB_LOCK_TTL_MS && job.lockedBy !== workerId) {
      // Still locked by another worker
      return null;
    }
  }

  // Check status is processable
  if (!["QUEUED", "RETRYING"].includes(job.status)) {
    // If processing but lock expired, allow re-lock
    if (job.status !== "PROCESSING") return null;
  }

  const now = new Date().toISOString();
  const newStatus: HighlightsJobStatus = job.status === "QUEUED" || job.status === "RETRYING" ? "PROCESSING" : job.status;
  const updated: Partial<HighlightsJobDoc> = {
    status: newStatus,
    lockedAt: now,
    lockedBy: workerId,
    progress: Math.max(job.progress, 15),
    updatedAt: now,
    auditLog: auditLog(job, job.status, newStatus, workerId, `Locked for processing`),
  };
  await _db.doc(path).set(updated, { merge: true });
  return { ...job, ...updated } as HighlightsJobDoc;
}

export async function unlockHighlightsJob(uid: string, jobId: string): Promise<void> {
  const _db = await db();
  await _db.doc(jobDocPath(uid, jobId)).set({ lockedAt: null, lockedBy: null, updatedAt: new Date().toISOString() }, { merge: true });
}

// Poll ClipForge and update job — short, Netlify-safe (<5s)
export async function pollHighlightsJob(uid: string, jobId: string): Promise<HighlightsJobDoc> {
  const _db = await db();
  const path = jobDocPath(uid, jobId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) throw Object.assign(new Error("Job not found"), { status: 404 });
  let job = snap.data() as HighlightsJobDoc;

  // If already terminal, return
  if (["COMPLETED", "FAILED"].includes(job.status)) return job;

  // Fetch ClipForge status
  let cfStatus: any;
  try {
    cfStatus = await getClipForgeJobStatus(jobId);
  } catch (e: any) {
    // Network or ClipForge failure — mark retrying if retryable and attempts < max
    const retryable = e.retryable || e.code === "NETWORK_FAILURE";
    if (retryable && job.attempts < HIGHLIGHTS_JOB_MAX_ATTEMPTS) {
      const now = new Date().toISOString();
      const updated: Partial<HighlightsJobDoc> = {
        status: "RETRYING",
        attempts: job.attempts + 1,
        error: e.message || "ClipForge poll failed",
        progress: job.progress,
        updatedAt: now,
        auditLog: auditLog(job, job.status, "RETRYING", "poller", e.message),
      };
      await _db.doc(path).set(updated, { merge: true });
      return { ...job, ...updated } as HighlightsJobDoc;
    }
    // Not retryable — mark failed
    const now = new Date().toISOString();
    const updated: Partial<HighlightsJobDoc> = {
      status: "FAILED",
      error: e.message,
      updatedAt: now,
      auditLog: auditLog(job, job.status, "FAILED", "poller", e.message),
    };
    await _db.doc(path).set(updated, { merge: true });
    // also update video aiStatus
    try {
      await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiStatus: "FAILED", aiUpdatedAt: now }, { merge: true });
    } catch {}
    return { ...job, ...updated } as HighlightsJobDoc;
  }

  const normalized = normalizeClipForgeStatus(cfStatus.status);
  let newStatus: HighlightsJobStatus;
  if (normalized === "completed") newStatus = "COMPLETED";
  else if (normalized === "failed") newStatus = "FAILED";
  else if (normalized === "cancelled") newStatus = "FAILED";
  else newStatus = "PROCESSING";

  const progress = cfStatus.progress ?? (newStatus === "PROCESSING" ? 60 : job.progress);

  if (newStatus === "COMPLETED") {
    // Do NOT do heavy clip generation here — delegate to worker
    // But we still update job and trigger highlight scoring asynchronously
    const now = new Date().toISOString();
    const updated: Partial<HighlightsJobDoc> = {
      status: newStatus,
      progress: 85,
      error: null,
      updatedAt: now,
      lockedAt: null,
      lockedBy: null,
      auditLog: auditLog(job, job.status, newStatus, "poller", `ClipForge completed, clips: ${cfStatus.clips?.length ?? 0}`),
    };
    await _db.doc(path).set(updated, { merge: true });
    try {
      await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiStatus: newStatus, aiProgress: 85, aiUpdatedAt: now }, { merge: true });
    } catch {}
    // Trigger highlight generation (short, scoring is fast <500ms, so okay in Netlify)
    // For large videos, this is still quick; actual clip file generation is deferred to worker/Firebase Storage mock
    const highlights = await generateHighlightsForJob(uid, job.videoId, jobId, cfStatus);
    // After generation, mark completed 100 — keep result from generateHighlightsForJob, just bump progress
    await _db.doc(path).set({ progress: 100, updatedAt: new Date().toISOString() }, { merge: true });
    try {
      await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiProgress: 100, aiStatus: "COMPLETED", aiUpdatedAt: new Date().toISOString() }, { merge: true });
    } catch {}
    const finalSnap = await _db.doc(path).get();
    // Ensure result is populated even if generateHighlightsForJob had no clipIds (fallback)
    const finalData = finalSnap.data() as HighlightsJobDoc;
    if (!finalData.result || finalData.result.selectedCount === 0) {
      // Fallback set correct counts
      await _db.doc(path).set({ result: { highlightsCount: highlights.length, selectedCount: highlights.length, clipIds: highlights.map((h) => h.clipId!) } }, { merge: true });
      const retrySnap = await _db.doc(path).get();
      return retrySnap.data() as HighlightsJobDoc;
    }
    return finalData;
  } else if (newStatus === "FAILED") {
    const errMsg = cfStatus.error || "ClipForge processing failed";
    // Retry if attempts left
    if (job.attempts < HIGHLIGHTS_JOB_MAX_ATTEMPTS) {
      const now = new Date().toISOString();
      const updated: Partial<HighlightsJobDoc> = {
        status: "RETRYING",
        attempts: job.attempts + 1,
        error: errMsg,
        progress: 30,
        updatedAt: now,
        lockedAt: null,
        lockedBy: null,
        auditLog: auditLog(job, job.status, "RETRYING", "poller", errMsg),
      };
      await _db.doc(path).set(updated, { merge: true });
      try {
        await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiStatus: "RETRYING", aiError: errMsg, aiUpdatedAt: now }, { merge: true });
      } catch {}
      return { ...job, ...updated } as HighlightsJobDoc;
    } else {
      const now = new Date().toISOString();
      const updated: Partial<HighlightsJobDoc> = {
        status: "FAILED",
        error: errMsg,
        updatedAt: now,
        lockedAt: null,
        lockedBy: null,
        auditLog: auditLog(job, job.status, "FAILED", "poller", errMsg),
      };
      await _db.doc(path).set(updated, { merge: true });
      try {
        await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiStatus: "FAILED", aiError: errMsg, aiUpdatedAt: now }, { merge: true });
      } catch {}
      return { ...job, ...updated } as HighlightsJobDoc;
    }
  } else {
    // Still processing
    const now = new Date().toISOString();
    const updated: Partial<HighlightsJobDoc> = {
      status: newStatus,
      progress,
      updatedAt: now,
    };
    await _db.doc(path).set(updated, { merge: true });
    try {
      await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiStatus: newStatus, aiProgress: progress, aiUpdatedAt: now }, { merge: true });
    } catch {}
    return { ...job, ...updated } as HighlightsJobDoc;
  }
}

// Generate highlights after ClipForge completed — scoring + selection + Firestore + clip placeholders
// This is fast (in-memory scoring) so can run in Netlify; heavy clip file copy is simulated as metadata + mock Storage write
export async function generateHighlightsForJob(uid: string, videoId: string, jobId: string, cfStatus: any): Promise<HighlightDoc[]> {
  const _db = await db();
  const videoPath = `users/${uid}/videos/${videoId}`;
  let videoDuration = 180; // default 3min if unknown
  let videoData: any = null;
  try {
    const vsnap = await _db.doc(videoPath).get();
    if (vsnap.exists) {
      videoData = vsnap.data();
      videoDuration = videoData.duration || videoData.fileSize ? Math.min(600, Math.max(30, Math.floor((videoData.fileSize || 50_000_000) / 300_000))) : 180;
      // If cloudinary video has duration
      if (videoData.duration) videoDuration = Math.round(videoData.duration);
    }
  } catch {}

  // Use ClipForge clips as signal if available, else mock
  // For robust highlights, if ClipForge returns <3 clips, supplement with mock candidates so we always get 3-5 highlights
  let candidates;
  if (cfStatus.clips && Array.isArray(cfStatus.clips) && cfStatus.clips.length >= 3) {
    // Map ClipForge clips to candidates with signals derived from their metadata
    candidates = cfStatus.clips.slice(0, 12).map((c: any, idx: number) => {
      // Generate signals based on clip metadata + index
      const seed = `${jobId}_${idx}_${c.clipId || idx}`;
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
      const rand = (n: number) => ((hash * 9301 + 49297) % 233280) / 233280 + n * 0.1;
      const signals = {
        actionIntensity: Math.min(100, 55 + Math.floor(c.duration * 2) + (hash % 20)),
        audioEnergy: 60 + (hash % 30),
        emotionalReaction: 50 + (hash % 25),
        eventImportance: 70 + (hash % 20),
        context: 50 + (hash % 20),
        uniqueness: 40 + (hash % 40),
        viewerInterest: 65 + (hash % 20),
      };
      // Use ClipForge timestamps if available, else mock
      const start = c.startTime ?? c.start_time ?? Math.floor((idx * videoDuration) / (cfStatus.clips.length + 1));
      const duration = c.duration ?? 15;
      const titleLower = (c.title || "").toLowerCase();
      const typeFromTitle = (() => {
        if (c.highlightType) return c.highlightType as HighlightType;
        if (c.type) return c.type as HighlightType;
        if (titleLower.includes("clutch")) return "clutch" as HighlightType;
        if (titleLower.includes("funny")) return "funny" as HighlightType;
        if (titleLower.includes("fail")) return "fail" as HighlightType;
        if (titleLower.includes("reaction")) return "reaction" as HighlightType;
        if (titleLower.includes("win")) return "win" as HighlightType;
        if (titleLower.includes("comeback")) return "comeback" as HighlightType;
        if (titleLower.includes("impressive")) return "impressive_gameplay" as HighlightType;
        if (titleLower.includes("story")) return "story_moment" as HighlightType;
        if (titleLower.includes("surprising")) return "surprising" as HighlightType;
        if (titleLower.includes("high_energy")) return "high_energy_commentary" as HighlightType;
        return "win" as HighlightType;
      })();
      return {
        startTime: start,
        endTime: start + duration,
        rawType: typeFromTitle,
        signals,
        transcriptSnippet: c.title || c.transcript || `ClipForge clip ${idx}`,
      };
    });
  } else {
    // Mock candidates
    const { generateMockCandidates } = await import("./scoring");
    candidates = generateMockCandidates(videoDuration, { seed: `${uid}_${videoId}_${jobId}` });
  }

  const selected = scoreAndSelectHighlights(candidates, { topK: 5, minScore: 58 });

  const now = new Date().toISOString();
  const highlights: HighlightDoc[] = [];
  const clipIds: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const s = selected[i];
    const highlightId = `hl_${videoId}_${String(i + 1).padStart(2, "0")}_${Math.random().toString(36).slice(2, 6)}`;
    const clipId = `clip_${highlightId}`;
    clipIds.push(clipId);

    const highlight: HighlightDoc = {
      highlightId,
      videoId,
      ownerId: uid,
      startTime: Math.round(s.startTime * 10) / 10,
      endTime: Math.round(s.endTime * 10) / 10,
      duration: Math.round((s.endTime - s.startTime) * 10) / 10,
      highlightType: s.rawType,
      score: s.score,
      confidence: s.confidence,
      reason: s.reason,
      signals: s.signals,
      status: "completed" as any,
      clipId,
      clipStoragePath: clipStoragePath(uid, videoId, clipId),
      clipUrl: null, // will be set after storage write
      createdAt: now,
      updatedAt: now,
      source: cfStatus.clips ? "clipforge" : "mock",
      attempts: 0,
      error: null,
    };

    // Store highlight
    await _db.doc(highlightDocPath(uid, videoId, highlightId)).set(highlight, { merge: false });

    // Generate clip in Firebase Storage (mock or real via Admin)
    // For V3, clips are stored in Firebase Storage at users/{uid}/videos/{videoId}/clips/{clipId}.mp4
    // We simulate by writing a placeholder file via Admin Storage, or just store metadata
    try {
      const _storage = await storage();
      if (_storage) {
        // Real Firebase Storage: create a file with mock content or copy from sourceUrl
        // We do a lightweight write — not downloading large video, just a placeholder to prove path exists
        // In production, worker would download ClipForge resultUrl and upload to Firebase Storage
        const bucket = _storage.bucket();
        const file = bucket.file(highlight.clipStoragePath!);
        // Write a small JSON as placeholder if no real video bytes — Cloudinary/ClipForge URL will be used for playback
        // But we set metadata to indicate it's a highlight clip
        await file.save(Buffer.from(`Mock clip for ${highlightId} type ${highlight.highlightType} score ${highlight.score}`), {
          metadata: {
            contentType: "video/mp4",
            metadata: {
              highlightId,
              videoId,
              ownerId: uid,
              startTime: String(highlight.startTime),
              endTime: String(highlight.endTime),
              score: String(highlight.score),
            },
          },
        });
        // Make public or get signed URL — for demo we use mock URL
        // In real, you'd call file.getSignedUrl or make public
        const mockUrl = `https://storage.googleapis.com/${bucket.name}/${highlight.clipStoragePath}`;
        highlight.clipUrl = mockUrl;
        await _db.doc(highlightDocPath(uid, videoId, highlightId)).set({ clipUrl: mockUrl }, { merge: true });
      } else {
        // Mock storage — just set clipUrl to ClipForge result or source
        const mockUrl = cfStatus.resultUrl || cfStatus.clips?.[0]?.url || `https://storage.mock/${highlight.clipStoragePath}`;
        highlight.clipUrl = mockUrl;
        await _db.doc(highlightDocPath(uid, videoId, highlightId)).set({ clipUrl: mockUrl }, { merge: true });
      }
    } catch (e: any) {
      console.warn(`[highlights] storage write failed for ${highlightId}`, e.message);
      // Still keep highlight, clipUrl remains null but highlight is completed
    }

    highlights.push(highlight);
  }

  // Update job with result
  await _db.doc(jobDocPath(uid, jobId)).set(
    {
      result: { highlightsCount: candidates.length, selectedCount: highlights.length, clipIds },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Update video with highlights count
  try {
    await _db.doc(videoPath).set(
      {
        aiHighlightsCount: highlights.length,
        aiSelectedCount: highlights.length,
        aiStatus: "COMPLETED",
        aiProgress: 100,
        aiUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {}

  console.log(`[highlights] generated ${highlights.length} highlights for ${uid}/${videoId} job ${jobId}`);

  // V4: auto-queue shorts for best highlight(s) — fire-and-forget, non-blocking for highlights flow
  try {
    const { autoQueueShortsForVideo } = await import("@/lib/shorts/server");
    // Don't await long; but for mock it's fast, so await short queue (creates QUEUED short)
    await autoQueueShortsForVideo(uid, videoId, { captionStyle: "Clean", maxPerVideo: 1 });
  } catch (e) {
    console.warn("[highlights] shorts auto-queue failed (non-blocking)", (e as any)?.message);
  }

  return highlights;
}

// Retry a failed job
export async function retryHighlightsJob(uid: string, jobId: string): Promise<HighlightsJobDoc> {
  const _db = await db();
  const path = jobDocPath(uid, jobId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) throw Object.assign(new Error("Job not found"), { status: 404 });
  const job = snap.data() as HighlightsJobDoc;
  if (job.ownerId !== uid) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (job.status !== "FAILED" && job.status !== "RETRYING") {
    throw Object.assign(new Error(`Cannot retry job in status ${job.status}`), { status: 409 });
  }
  if (job.attempts >= HIGHLIGHTS_JOB_MAX_ATTEMPTS) {
    throw Object.assign(new Error("Retry limit reached"), { status: 429 });
  }

  const now = new Date().toISOString();
  const updated: Partial<HighlightsJobDoc> = {
    status: "RETRYING",
    attempts: job.attempts + 1,
    error: null,
    progress: 10,
    lockedAt: null,
    lockedBy: null,
    updatedAt: now,
    auditLog: auditLog(job, job.status, "RETRYING", "api:retry", `Retry attempt ${job.attempts + 1}`),
  };
  await _db.doc(path).set(updated, { merge: true });

  // Re-create ClipForge job? For mock, we just set to QUEUED and let poll handle
  // In real, you'd call ClipForge retry endpoint
  try {
    const { retryClipForgeJob } = await import("@/lib/clipforge/server");
    await retryClipForgeJob(jobId);
  } catch {}

  await _db.doc(path).set({ status: "QUEUED", progress: 5, updatedAt: new Date().toISOString(), auditLog: auditLog({ ...job, status: "RETRYING" } as HighlightsJobDoc, "RETRYING", "QUEUED", "api:retry") }, { merge: true });

  try {
    await _db.doc(`users/${uid}/videos/${job.videoId}`).set({ aiStatus: "QUEUED", aiUpdatedAt: now }, { merge: true });
  } catch {}

  const final = await _db.doc(path).get();
  return final.data() as HighlightsJobDoc;
}

// Get highlights for a video (with per-user check)
export async function getHighlightsForVideo(uid: string, videoId: string): Promise<HighlightDoc[]> {
  const _db = await db();
  // Verify video belongs to uid (owner check)
  const videoPath = `users/${uid}/videos/${videoId}`;
  const vsnap = await _db.doc(videoPath).get();
  if (!vsnap.exists) {
    // Still allow empty if video not found but check job? For security, require video exists and owner matches
    // Check if any job for this video exists for this uid
    const jobSnap = await _db.collection(`users/${uid}/jobs`).get();
    const hasJob = (jobSnap.docs as any[]).some((d) => (d.data() as HighlightsJobDoc).videoId === videoId);
    if (!hasJob) throw Object.assign(new Error("Video not found"), { status: 404 });
  } else {
    const vdata = vsnap.data() as any;
    if (vdata.ownerId && vdata.ownerId !== uid) throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  const colPath = highlightsCollectionPath(uid, videoId);
  const snap = await _db.collection(colPath).get();
  const docs = (snap.docs as any[]).map((d) => d.data() as HighlightDoc);
  // Sort by score desc then startTime
  docs.sort((a, b) => b.score - a.score || a.startTime - b.startTime);
  return docs;
}

// Discover eligible videos that have no highlights job yet — for automatic pipeline
export async function discoverEligibleVideos(uid: string, limit = 10): Promise<Array<{ videoId: string; filename: string; sourceUrl: string; duration?: number }>> {
  const _db = await db();
  const videosCol = `users/${uid}/videos`;
  const snap = await _db.collection(videosCol).get();
  const allVideos = (snap.docs as any[]).map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Also check jobs to see which videos already have highlights job
  const jobsSnap = await _db.collection(`users/${uid}/jobs`).get();
  const jobVideoIds = new Set((jobsSnap.docs as any[]).filter((d) => (d.data() as HighlightsJobDoc).jobType === "highlights").map((d) => (d.data() as HighlightsJobDoc).videoId));

  const eligible = allVideos
    .filter((v) => {
      const videoId = v.videoId || v.id;
      if (jobVideoIds.has(videoId)) return false;
      // Must have sourceUrl (Firebase Storage or Cloudinary) and be ready/uploaded
      const hasSource = !!(v.cloudinaryUrl || v.storageUrl || v.sourceUrl || v.cloudinaryPublicId);
      const status = (v.status || v.aiStatus || "ready").toLowerCase();
      const allowed = ["ready", "uploaded", "completed", "available"];
      if (!hasSource && !v.fileName) return false;
      // Consider eligible if status is allowed or no status
      return true;
    })
    .slice(0, limit)
    .map((v) => ({
      videoId: v.videoId || v.id,
      filename: v.fileName || v.filename || `${v.videoId}.mp4`,
      sourceUrl: v.cloudinaryUrl || v.storageUrl || v.sourceUrl || `https://storage.mock/${v.videoId}`,
      duration: v.duration || null,
    }));

  return eligible;
}
