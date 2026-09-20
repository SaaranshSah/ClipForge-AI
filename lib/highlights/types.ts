// V3 Highlights — types & constants
// Firestore: users/{uid}/videos/{videoId}/highlights/{highlightId}
// Storage: users/{uid}/videos/{videoId}/clips/{clipId}.mp4

export type HighlightType =
  | "clutch"
  | "win"
  | "funny"
  | "fail"
  | "reaction"
  | "high_energy_commentary"
  | "surprising"
  | "comeback"
  | "impressive_gameplay"
  | "story_moment";

export const ALL_HIGHLIGHT_TYPES: HighlightType[] = [
  "clutch",
  "win",
  "funny",
  "fail",
  "reaction",
  "high_energy_commentary",
  "surprising",
  "comeback",
  "impressive_gameplay",
  "story_moment",
];

export type HighlightSignals = {
  actionIntensity: number; // 0-100 burst of gameplay action
  audioEnergy: number; // 0-100 loudness/voice energy
  emotionalReaction: number; // 0-100 face/voice emotion spike
  eventImportance: number; // 0-100 win/loss/clutch weight
  context: number; // 0-100 narrative context relevance
  uniqueness: number; // 0-100 rarity vs other segments
  viewerInterest: number; // 0-100 predicted retention
};

export type HighlightStatus = "queued" | "processing" | "completed" | "failed" | "retrying";

export type HighlightDoc = {
  highlightId: string;
  videoId: string;
  ownerId: string;
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // end-start
  highlightType: HighlightType;
  score: number; // 0-100 weighted
  confidence: number; // 0-1
  reason: string; // human readable why selected
  signals: HighlightSignals;
  status: HighlightStatus;
  clipId?: string | null; // linked clip if generated
  clipStoragePath?: string | null; // users/{uid}/videos/{videoId}/clips/{clipId}.mp4
  clipUrl?: string | null; // Firebase Storage download URL or mock
  createdAt: string; // ISO
  updatedAt: string; // ISO
  source: "clipforge" | "worker" | "mock";
  attempts?: number;
  error?: string | null;
};

// Job that orchestrates highlights for a video
// Firestore: users/{uid}/jobs/{jobId} with type highlights OR users/{uid}/videos/{videoId}/jobs/{jobId}
// For V3 we use users/{uid}/jobs/{jobId} with metadata videoId + jobType=highlights to reuse existing ClipForge job infra + add highlights subcollection
export type HighlightsJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING";

export type HighlightsJobDoc = {
  jobId: string; // clipforgeJobId or internal
  videoId: string;
  ownerId: string;
  provider: "clipforge";
  project: "fpq";
  jobType: "highlights";
  sourceUrl: string; // Firebase Storage URL of original
  filename: string;
  status: HighlightsJobStatus;
  progress: number; // 0-100
  attempts: number;
  maxAttempts: number;
  lockedAt?: string | null;
  lockedBy?: string | null; // worker id
  error?: string | null;
  result?: {
    highlightsCount: number;
    selectedCount: number;
    clipIds: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
  // idempotency
  dedupeKey: string; // `${uid}:${videoId}:highlights`
  // audit
  auditLog?: Array<{ at: string; from: string; to: string; by: string; note?: string }>;
};

export const HIGHLIGHTS_JOB_MAX_ATTEMPTS = 3;
export const HIGHLIGHTS_JOB_LOCK_TTL_MS = 5 * 60 * 1000; // 5 min

// Firestore paths
export function highlightsCollectionPath(uid: string, videoId: string): string {
  return `users/${uid}/videos/${videoId}/highlights`;
}
export function highlightDocPath(uid: string, videoId: string, highlightId: string): string {
  return `users/${uid}/videos/${videoId}/highlights/${highlightId}`;
}
export function clipStoragePath(uid: string, videoId: string, clipId: string): string {
  return `users/${uid}/videos/${videoId}/clips/${clipId}.mp4`;
}
export function jobDocPath(uid: string, jobId: string): string {
  return `users/${uid}/jobs/${jobId}`;
}
export function dedupeKeyForVideo(uid: string, videoId: string): string {
  return `${uid}:${videoId}:highlights`;
}
