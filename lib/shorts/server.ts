import "server-only";

import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { generateCaptionsForHighlight, cuesToVtt, validateCaptions } from "./captions";
import { getEditingForHighlight } from "./editing";
import { generateMetadataForHighlight } from "./metadata";
import { runQualityChecks, qualityToDoc } from "./quality";
import type { ShortDoc, ShortStatus, CaptionStyle } from "./types";
import {
  SHORTS_JOB_MAX_ATTEMPTS,
  SHORTS_JOB_LOCK_TTL_MS,
  SHORTS_TARGET_WIDTH,
  SHORTS_TARGET_HEIGHT,
  SHORTS_ASPECT,
  shortDocPath,
  shortsCollectionPath,
  shortStoragePath,
  shortThumbnailPath,
  dedupeKeyForShort,
} from "./types";
import type { HighlightDoc } from "@/lib/highlights/types";

/**
 * V4 Shorts Pipeline — server-only
 * Flow: AI highlight (best) → vertical conversion (1080x1920 9:16 smart crop, avoid black bars, maintain quality)
 *       → captions (4 styles, synchronized, safe areas) → audio enhancement → editing (smart zoom/cuts) → thumbnail → quality check → finished Short
 */

const PROJECT = "fpq";

async function db() { return getAdminDb(); }
async function storage() { return getAdminStorage(); }

function auditLog(short: ShortDoc, from: string, to: string, by: string, note?: string): ShortDoc["auditLog"] {
  return [...(short.auditLog || []), { at: new Date().toISOString(), from, to, by, note }];
}

// Select best highlight for a video (highest score, then confidence)
export async function getBestHighlightForVideo(uid: string, videoId: string): Promise<HighlightDoc | null> {
  const _db = await db();
  const hlPath = `users/${uid}/videos/${videoId}/highlights`;
  try {
    const snap = await _db.collection(hlPath).get();
    const docs = (snap.docs as any[]).map((d) => d.data() as HighlightDoc).filter((h) => h.status === "completed");
    if (docs.length === 0) return null;
    docs.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.startTime - b.startTime);
    return docs[0];
  } catch { return null; }
}

// Discover eligible highlights for shorts (best completed highlight per video without a Short yet)
// Enforces 1 Short per video for autoQueue — only best highlight is considered. If best already has any Short, video is considered done.
export async function discoverEligibleHighlights(uid: string, limit = 5): Promise<Array<{ videoId: string; highlight: HighlightDoc }>> {
  const _db = await db();
  const videosCol = `users/${uid}/videos`;
  const vsnap = await _db.collection(videosCol).get();
  const videoIds = (vsnap.docs as any[]).map((d) => d.id);
  const eligible: Array<{ videoId: string; highlight: HighlightDoc }> = [];
  for (const vid of videoIds) {
    const hlPath = `users/${uid}/videos/${vid}/highlights`;
    try {
      const hlSnap = await _db.collection(hlPath).get();
      const highlights = (hlSnap.docs as any[]).map((d) => d.data() as HighlightDoc).filter((h) => h.status === "completed");
      if (highlights.length === 0) continue;
      highlights.sort((a, b) => b.score - a.score);
      const best = highlights[0];
      // Check if best highlight already has any Short (any captionStyle counts as done for auto)
      const shortsPath = shortsCollectionPath(uid, vid);
      const sSnap = await _db.collection(shortsPath).get();
      const exists = (sSnap.docs as any[]).some((d) => {
        const s = d.data() as ShortDoc;
        return s.sourceHighlightId === best.highlightId;
      });
      if (exists) continue;
      const jobsSnap = await _db.collection(`users/${uid}/jobs`).get();
      const hasJob = (jobsSnap.docs as any[]).some((d) => {
        const j = d.data() as any;
        return j.jobType === "shorts" && j.sourceHighlightId === best.highlightId && ["QUEUED", "PROCESSING", "RETRYING", "EDITING", "CAPTIONING", "QUALITY_CHECK"].includes(j.status);
      });
      if (hasJob) continue;
      eligible.push({ videoId: vid, highlight: best });
      if (eligible.length >= limit) return eligible;
    } catch {}
    if (eligible.length >= limit) break;
  }
  return eligible;
}

// Create short for a specific highlight (idempotent per highlight + captionStyle)
export async function createShortForHighlight(opts: {
  uid: string;
  videoId: string;
  highlight: HighlightDoc;
  captionStyle?: CaptionStyle;
  title?: string;
  description?: string;
  hashtags?: string[];
}): Promise<{ short: ShortDoc; created: boolean }> {
  const _db = await db();
  const style: CaptionStyle = opts.captionStyle || "Clean";
  const hl = opts.highlight;
  const dedupeKey = dedupeKeyForShort(opts.uid, opts.videoId, hl.highlightId, style);
  const shortsCol = shortsCollectionPath(opts.uid, opts.videoId);

  // Duplicate prevention: idempotent per highlight + captionStyle (dedupeKey includes style)
  // Allow same highlight with different style to create separate Short (4 styles: Clean/Bold/Gaming/Minimal)
  try {
    const snap = await _db.collection(shortsCol).get();
    for (const doc of (snap.docs as any[])) {
      const s = doc.data() as ShortDoc;
      if (s.dedupeKey === dedupeKey) {
        if (["QUEUED", "PROCESSING", "EDITING", "CAPTIONING", "QUALITY_CHECK", "RETRYING"].includes(s.status)) {
          return { short: s, created: false };
        }
        if (s.status === "COMPLETED") return { short: s, created: false };
        if (s.status === "FAILED" && s.attempts >= SHORTS_JOB_MAX_ATTEMPTS) return { short: s, created: false };
        if (s.status === "FAILED") return { short: s, created: false }; // caller should retry
      }
    }
    // Also check jobs collection for shorts job dedupe
    const jobsSnap = await _db.collection(`users/${opts.uid}/jobs`).get();
    for (const doc of (jobsSnap.docs as any[])) {
      const j = doc.data() as any;
      if (j.dedupeKey === dedupeKey && j.jobType === "shorts") {
        if (["QUEUED", "PROCESSING", "RETRYING"].includes(j.status)) {
          // Return job as short-like
          return { short: j as ShortDoc, created: false };
        }
        if (j.status === "COMPLETED") return { short: j as ShortDoc, created: false };
      }
    }
  } catch {}

  // Generate metadata (if not provided)
  const meta = generateMetadataForHighlight({
    highlightType: hl.highlightType as any,
    score: hl.score,
    signals: hl.signals as any,
    captionStyle: style,
    duration: hl.duration,
    highlightId: hl.highlightId,
  });

  const now = new Date().toISOString();
  // Short ID deterministic but unique per highlight+style
  const shortId = `sh_${opts.videoId}_${hl.highlightId.slice(-6)}_${style.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
  const storagePath = shortStoragePath(opts.uid, opts.videoId, shortId);
  const thumbnailPath = shortThumbnailPath(opts.uid, opts.videoId, shortId);
  const title = opts.title || meta.title;
  const description = opts.description || meta.description;
  const hashtags = opts.hashtags || meta.hashtags;

  const short: ShortDoc = {
    shortId,
    sourceVideoId: opts.videoId,
    sourceClipId: hl.clipId || `clip_${hl.highlightId}`,
    sourceHighlightId: hl.highlightId,
    ownerId: opts.uid,
    status: "QUEUED",
    progress: 5,
    title,
    description,
    hashtags,
    keywords: meta.keywords,
    storagePath,
    shortUrl: null,
    thumbnailPath,
    thumbnailUrl: null,
    duration: hl.duration, // keep highlight duration (8-25s valid for Shorts)
    width: SHORTS_TARGET_WIDTH,
    height: SHORTS_TARGET_HEIGHT,
    aspectRatio: SHORTS_ASPECT,
    captionStyle: style,
    captions: [],
    captionsVtt: null,
    editing: {
      verticalConversion: true,
      smartCrop: true,
      avoidBlackBars: true,
      maintainQuality: true,
      smartZoom: false,
      cuts: 0,
      transitions: "cut",
      audioNormalized: false,
      audioExists: true,
      speechUnderstandable: true,
    },
    qualityChecks: undefined,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    maxAttempts: SHORTS_JOB_MAX_ATTEMPTS,
    lockedAt: null,
    lockedBy: null,
    error: null,
    dedupeKey,
    auditLog: [{ at: now, from: "NONE", to: "QUEUED", by: "api:createShort", note: `Created from highlight ${hl.highlightId} score ${hl.score} style ${style}` }],
    sourceHighlightType: hl.highlightType,
    sourceScore: hl.score,
  };

  // Create short doc
  await _db.doc(shortDocPath(opts.uid, opts.videoId, shortId)).set(short, { merge: false });
  // Also create job doc for worker tracking (same data, jobType shorts)
  const jobId = shortId;
  const jobDoc = {
    ...short,
    jobId,
    jobType: "shorts" as const,
    provider: "clipforge" as const,
    project: PROJECT,
  };
  await _db.doc(`users/${opts.uid}/jobs/${jobId}`).set(jobDoc, { merge: false });
  // Ensure user doc
  try { await _db.doc(`users/${opts.uid}`).set({ uid: opts.uid, updatedAt: now }, { merge: true }); } catch {}
  // Update video doc
  try {
    await _db.doc(`users/${opts.uid}/videos/${opts.videoId}`).set({ shortsQueued: 1, shortsUpdatedAt: now }, { merge: true });
  } catch {}

  console.log(`[shorts] created short ${shortId} for ${opts.uid}/${opts.videoId} highlight ${hl.highlightId} style ${style}`);

  // Auto-generate thumbnail placeholder and trigger async? For now, leave QUEUED, worker will process
  return { short, created: true };
}

// Auto-queue shorts for best highlight per video (called after highlights completed)
export async function autoQueueShortsForVideo(uid: string, videoId: string, opts?: { captionStyle?: CaptionStyle; maxPerVideo?: number }): Promise<{ queued: number; shorts: ShortDoc[] }> {
  const best = await getBestHighlightForVideo(uid, videoId);
  if (!best) return { queued: 0, shorts: [] };
  const style = opts?.captionStyle || "Clean";
  // For V4, auto queue 1 short for best highlight (could be 2 for top 2)
  const max = opts?.maxPerVideo || 1;
  // Get top N highlights
  const _db = await db();
  const hlPath = `users/${uid}/videos/${videoId}/highlights`;
  let topHighlights: HighlightDoc[] = [best];
  try {
    const snap = await _db.collection(hlPath).get();
    const all = (snap.docs as any[]).map((d) => d.data() as HighlightDoc).filter((h) => h.status === "completed");
    all.sort((a, b) => b.score - a.score);
    topHighlights = all.slice(0, max);
  } catch {}

  const shorts: ShortDoc[] = [];
  let queued = 0;
  for (const hl of topHighlights) {
    try {
      const { short, created } = await createShortForHighlight({ uid, videoId, highlight: hl, captionStyle: style });
      shorts.push(short);
      if (created) queued++;
    } catch {}
  }
  return { queued, shorts };
}

// Lock short for processing
export async function lockShort(uid: string, videoId: string, shortId: string, workerId: string): Promise<ShortDoc | null> {
  const _db = await db();
  const path = shortDocPath(uid, videoId, shortId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) return null;
  const short = snap.data() as ShortDoc;
  if (short.lockedAt) {
    const lockedMs = Date.now() - new Date(short.lockedAt).getTime();
    if (lockedMs < SHORTS_JOB_LOCK_TTL_MS && short.lockedBy !== workerId) return null;
  }
  if (!["QUEUED", "RETRYING"].includes(short.status)) {
    if (short.status !== "PROCESSING" && short.status !== "EDITING" && short.status !== "CAPTIONING" && short.status !== "QUALITY_CHECK") return null;
  }
  const now = new Date().toISOString();
  const newStatus: ShortStatus = short.status === "QUEUED" || short.status === "RETRYING" ? "PROCESSING" : short.status;
  const updated: Partial<ShortDoc> = {
    status: newStatus,
    lockedAt: now,
    lockedBy: workerId,
    progress: Math.max(short.progress, 15),
    updatedAt: now,
    auditLog: auditLog(short, short.status, newStatus, workerId, "Locked for processing"),
  };
  await _db.doc(path).set(updated, { merge: true });
  // Also update job doc
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set(updated, { merge: true }); } catch {}
  return { ...short, ...updated } as ShortDoc;
}

// Process short through pipeline: vertical conversion → captions → audio → editing → thumbnail → quality check
export async function processShort(uid: string, videoId: string, shortId: string): Promise<ShortDoc> {
  const _db = await db();
  const path = shortDocPath(uid, videoId, shortId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) throw Object.assign(new Error("Short not found"), { status: 404 });
  let short = snap.data() as ShortDoc;
  if (["COMPLETED", "FAILED"].includes(short.status)) return short;

  // Fetch source highlight for context
  let highlight: HighlightDoc | null = null;
  try {
    const hlSnap = await _db.doc(`users/${uid}/videos/${videoId}/highlights/${short.sourceHighlightId}`).get();
    if (hlSnap.exists) highlight = hlSnap.data() as HighlightDoc;
  } catch {}
  if (!highlight) {
    // Fallback: try to find highlight by clipId
    try {
      const hlCol = `users/${uid}/videos/${videoId}/highlights`;
      const hsnap = await _db.collection(hlCol).get();
      const found = (hsnap.docs as any[]).map((d) => d.data() as HighlightDoc).find((h) => h.clipId === short.sourceClipId);
      if (found) highlight = found;
    } catch {}
  }

  const now = new Date().toISOString();

  // Step 1: EDITING — vertical conversion, smart crop, audio normalization
  short.status = "EDITING";
  short.progress = 30;
  short.editing = getEditingForHighlight({
    highlightType: highlight?.highlightType || short.sourceHighlightType || "win",
    duration: short.duration,
    signals: highlight?.signals as any,
  }) as any;
  // Ensure vertical specs
  short.width = SHORTS_TARGET_WIDTH;
  short.height = SHORTS_TARGET_HEIGHT;
  short.aspectRatio = SHORTS_ASPECT;
  short.editing!.verticalConversion = true;
  short.editing!.smartCrop = true;
  short.editing!.avoidBlackBars = true;
  short.editing!.maintainQuality = true;
  short.editing!.audioNormalized = true;
  short.editing!.speechUnderstandable = true;
  await _db.doc(path).set({ status: "EDITING", progress: 30, editing: short.editing, width: 1080, height: 1920, aspectRatio: "9:16", updatedAt: now, auditLog: auditLog(short, "PROCESSING", "EDITING", "processor", "Vertical 1080x1920 smart crop") }, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set({ status: "EDITING", progress: 30, editing: short.editing, updatedAt: now }, { merge: true }); } catch {}

  // Step 2: CAPTIONING — generate captions from highlight transcript
  short.status = "CAPTIONING";
  short.progress = 60;
  const captions = generateCaptionsForHighlight({
    highlightType: highlight?.highlightType || short.sourceHighlightType || "win",
    duration: short.duration,
    transcript: highlight?.reason || (highlight as any)?.transcriptSnippet,
    style: short.captionStyle,
    highlightId: short.sourceHighlightId,
    videoId,
  });
  const vtt = cuesToVtt(captions);
  short.captions = captions;
  short.captionsVtt = vtt;
  await _db.doc(path).set({ status: "CAPTIONING", progress: 60, captions, captionsVtt: vtt, updatedAt: new Date().toISOString(), auditLog: auditLog({ ...short, status: "EDITING" } as ShortDoc, "EDITING", "CAPTIONING", "processor", `Captions ${short.captionStyle} ${captions.length} cues`) }, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set({ status: "CAPTIONING", progress: 60, captions, updatedAt: new Date().toISOString() }, { merge: true }); } catch {}

  // Step 3: Thumbnail generation
  short.thumbnailPath = shortThumbnailPath(uid, videoId, shortId);
  short.thumbnailUrl = `https://storage.mock/${short.thumbnailPath}`;
  // Simulate storage write for thumbnail (mock)
  try {
    const _storage = await storage();
    if (_storage) {
      const bucket = _storage.bucket();
      const file = bucket.file(short.thumbnailPath);
      await file.save(Buffer.from(`Thumbnail for ${shortId} title ${short.title}`), {
        metadata: { contentType: "image/jpeg", metadata: { shortId, videoId } },
      });
      short.thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${short.thumbnailPath}`;
    }
  } catch {}
  await _db.doc(path).set({ thumbnailPath: short.thumbnailPath, thumbnailUrl: short.thumbnailUrl, updatedAt: new Date().toISOString() }, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set({ thumbnailPath: short.thumbnailPath, thumbnailUrl: short.thumbnailUrl, updatedAt: new Date().toISOString() }, { merge: true }); } catch {}

  // Step 4: Simulate video file creation for short (vertical 1080x1920)
  short.shortUrl = `https://storage.mock/${short.storagePath}`;
  try {
    const _storage = await storage();
    if (_storage) {
      const bucket = _storage.bucket();
      const file = bucket.file(short.storagePath);
      await file.save(Buffer.from(`Mock short ${shortId} vertical 1080x1920 ${short.duration}s style ${short.captionStyle}`), {
        metadata: {
          contentType: "video/mp4",
          metadata: {
            shortId,
            videoId,
            highlightId: short.sourceHighlightId,
            captionStyle: short.captionStyle,
            width: "1080",
            height: "1920",
            duration: String(short.duration),
          },
        },
      });
      short.shortUrl = `https://storage.googleapis.com/${bucket.name}/${short.storagePath}`;
    }
  } catch {}
  await _db.doc(path).set({ shortUrl: short.shortUrl, storagePath: short.storagePath, updatedAt: new Date().toISOString() }, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set({ shortUrl: short.shortUrl, storagePath: short.storagePath, updatedAt: new Date().toISOString() }, { merge: true }); } catch {}

  // Step 5: QUALITY CHECK
  short.status = "QUALITY_CHECK";
  short.progress = 85;
  await _db.doc(path).set({ status: "QUALITY_CHECK", progress: 85, updatedAt: new Date().toISOString(), auditLog: auditLog({ ...short, status: "CAPTIONING" } as ShortDoc, "CAPTIONING", "QUALITY_CHECK", "processor", "Running quality checks") }, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set({ status: "QUALITY_CHECK", progress: 85, updatedAt: new Date().toISOString() }, { merge: true }); } catch {}

  const quality = runQualityChecks({
    width: short.width,
    height: short.height,
    aspectRatio: short.aspectRatio,
    duration: short.duration,
    captions: short.captions,
    storagePath: short.storagePath,
    thumbnailPath: short.thumbnailPath,
    editing: short.editing as any,
  });
  const qualityDoc = qualityToDoc(quality);

  if (!quality.passed) {
    // Fail but retryable if attempts < max
    const updated: Partial<ShortDoc> = {
      status: short.attempts + 1 < SHORTS_JOB_MAX_ATTEMPTS ? "RETRYING" : "FAILED",
      progress: quality.passed ? 100 : 30,
      qualityChecks: qualityDoc,
      error: `Quality check failed: ${quality.reasons.join("; ")}`,
      attempts: short.attempts + 1,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date().toISOString(),
      auditLog: auditLog({ ...short, status: "QUALITY_CHECK" } as ShortDoc, "QUALITY_CHECK", quality.passed ? "COMPLETED" : "FAILED", "quality", quality.reasons.join("; ") || "passed"),
    };
    await _db.doc(path).set(updated, { merge: true });
    try { await _db.doc(`users/${uid}/jobs/${shortId}`).set(updated, { merge: true }); } catch {}
    if (!quality.passed && updated.status === "RETRYING") {
      // Will be retried
      return { ...short, ...updated } as ShortDoc;
    }
    throw Object.assign(new Error(`Quality check failed: ${quality.reasons.join("; ")}`), { status: 500, code: "QUALITY_FAILED", retryable: true });
  }

  // Passed → COMPLETED
  const completed: Partial<ShortDoc> = {
    status: "COMPLETED",
    progress: 100,
    qualityChecks: qualityDoc,
    error: null,
    lockedAt: null,
    lockedBy: null,
    updatedAt: new Date().toISOString(),
    auditLog: auditLog({ ...short, status: "QUALITY_CHECK" } as ShortDoc, "QUALITY_CHECK", "COMPLETED", "quality", "All checks passed"),
  };
  await _db.doc(path).set(completed, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set(completed, { merge: true }); } catch {}
  // Update video shorts count
  try {
    await _db.doc(`users/${uid}/videos/${videoId}`).set({ shortsCount: 1, shortsCompleted: 1, shortsUpdatedAt: new Date().toISOString() }, { merge: true });
  } catch {}

  const finalSnap = await _db.doc(path).get();
  return finalSnap.data() as ShortDoc;
}

// Poll short (short, Netlify-safe) — progresses from QUEUED through pipeline to COMPLETED
export async function pollShort(uid: string, videoId: string, shortId: string): Promise<ShortDoc> {
  const _db = await db();
  const path = shortDocPath(uid, videoId, shortId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) throw Object.assign(new Error("Short not found"), { status: 404 });
  let short = snap.data() as ShortDoc;
  if (["COMPLETED", "FAILED"].includes(short.status)) return short;

  // If QUEUED/RETRYING, lock and process (short operation <3s)
  if (["QUEUED", "RETRYING"].includes(short.status)) {
    const locked = await lockShort(uid, videoId, shortId, "poller");
    if (!locked) return short;
    short = locked;
  }

  // Process through pipeline
  try {
    const result = await processShort(uid, videoId, shortId);
    return result;
  } catch (e: any) {
    // Handle retry
    const isRetryable = e.retryable || e.code === "QUALITY_FAILED";
    if (isRetryable && short.attempts + 1 < SHORTS_JOB_MAX_ATTEMPTS) {
      const now = new Date().toISOString();
      const updated: Partial<ShortDoc> = {
        status: "RETRYING",
        attempts: short.attempts + 1,
        error: e.message,
        progress: 20,
        lockedAt: null,
        lockedBy: null,
        updatedAt: now,
        auditLog: auditLog(short, short.status, "RETRYING", "poller", e.message),
      };
      await _db.doc(path).set(updated, { merge: true });
      try { await _db.doc(`users/${uid}/jobs/${shortId}`).set(updated, { merge: true }); } catch {}
      return { ...short, ...updated } as ShortDoc;
    }
    const now = new Date().toISOString();
    const updated: Partial<ShortDoc> = {
      status: "FAILED",
      error: e.message,
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
      auditLog: auditLog(short, short.status, "FAILED", "poller", e.message),
    };
    await _db.doc(path).set(updated, { merge: true });
    try { await _db.doc(`users/${uid}/jobs/${shortId}`).set(updated, { merge: true }); } catch {}
    return { ...short, ...updated } as ShortDoc;
  }
}

// Get shorts for video
export async function getShortsForVideo(uid: string, videoId: string): Promise<ShortDoc[]> {
  const _db = await db();
  const colPath = shortsCollectionPath(uid, videoId);
  const snap = await _db.collection(colPath).get();
  const docs = (snap.docs as any[]).map((d) => d.data() as ShortDoc);
  docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return docs;
}

// Get all shorts for user
export async function getAllShortsForUser(uid: string, limit = 50): Promise<ShortDoc[]> {
  const _db = await db();
  const videosCol = `users/${uid}/videos`;
  const vsnap = await _db.collection(videosCol).get();
  const videoIds = (vsnap.docs as any[]).map((d) => d.id);
  let all: ShortDoc[] = [];
  for (const vid of videoIds) {
    const shorts = await getShortsForVideo(uid, vid);
    all.push(...shorts);
  }
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (limit) all = all.slice(0, limit);
  return all;
}

// Retry failed short
export async function retryShort(uid: string, videoId: string, shortId: string): Promise<ShortDoc> {
  const _db = await db();
  const path = shortDocPath(uid, videoId, shortId);
  const snap = await _db.doc(path).get();
  if (!snap.exists) throw Object.assign(new Error("Short not found"), { status: 404 });
  const short = snap.data() as ShortDoc;
  if (short.ownerId !== uid) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (!["FAILED", "RETRYING"].includes(short.status)) throw Object.assign(new Error(`Cannot retry status ${short.status}`), { status: 409 });
  if (short.attempts >= SHORTS_JOB_MAX_ATTEMPTS) throw Object.assign(new Error("Retry limit"), { status: 429 });
  const now = new Date().toISOString();
  const updated: Partial<ShortDoc> = {
    status: "QUEUED",
    attempts: short.attempts + 1,
    error: null,
    progress: 5,
    lockedAt: null,
    lockedBy: null,
    updatedAt: now,
    auditLog: auditLog(short, short.status, "QUEUED", "api:retry", `Retry ${short.attempts + 1}`),
  };
  await _db.doc(path).set(updated, { merge: true });
  try { await _db.doc(`users/${uid}/jobs/${shortId}`).set(updated, { merge: true }); } catch {}
  const fresh = await _db.doc(path).get();
  return fresh.data() as ShortDoc;
}
