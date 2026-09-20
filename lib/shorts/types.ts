// V4 Shorts — types & constants
// Firestore: users/{uid}/videos/{videoId}/shorts/{shortId}
// Storage: users/{uid}/videos/{videoId}/shorts/{shortId}.mp4 (and thumbnail .jpg)
// Clips: users/{uid}/videos/{videoId}/clips/{clipId}.mp4 (V3)

export type CaptionStyle = "Clean" | "Bold" | "Gaming" | "Minimal";

export const ALL_CAPTION_STYLES: CaptionStyle[] = ["Clean", "Bold", "Gaming", "Minimal"];

export type ShortStatus = "QUEUED" | "PROCESSING" | "EDITING" | "CAPTIONING" | "QUALITY_CHECK" | "COMPLETED" | "FAILED" | "RETRYING";

export type ShortDoc = {
  shortId: string;
  sourceVideoId: string;
  sourceClipId: string; // V3 clipId (clip_hl_...)
  sourceHighlightId: string; // highlightId for traceability
  ownerId: string;
  status: ShortStatus;
  progress: number; // 0-100
  // Metadata (auto-generated, no virality claims)
  title: string;
  description: string;
  hashtags: string[]; // e.g. ["#Gaming", "#Clutch"]
  keywords: string[]; // e.g. ["clutch", "valorant"]
  // Storage
  storagePath: string; // users/{uid}/videos/{videoId}/shorts/{shortId}.mp4
  shortUrl?: string | null; // Firebase Storage URL or mock
  thumbnailPath?: string | null; // users/{uid}/videos/{videoId}/shorts/{shortId}.jpg
  thumbnailUrl?: string | null;
  // Video specs
  duration: number; // seconds, valid for Shorts (8-60, we keep highlight duration)
  width: number; // 1080
  height: number; // 1920
  aspectRatio: "9:16";
  // Captions
  captionStyle: CaptionStyle;
  captions?: Array<{
    text: string;
    start: number; // seconds relative to short
    end: number;
    isEmphasis?: boolean; // highlight important spoken moments
  }>;
  captionsVtt?: string | null; // VTT content for storage
  // Editing
  editing?: {
    verticalConversion: boolean; // 9:16
    smartCrop: boolean; // preserve gameplay
    avoidBlackBars: boolean;
    maintainQuality: boolean;
    smartZoom: boolean;
    cuts: number; // number of cuts applied
    transitions: string; // e.g. "fade", "cut"
    audioNormalized: boolean;
    audioExists: boolean;
    speechUnderstandable: boolean;
  };
  // Quality checks (must all pass before COMPLETED)
  qualityChecks?: {
    aspectRatio: boolean; // 9:16
    duration: boolean; // 8-60s valid
    videoPlays: boolean;
    audioExists: boolean;
    captionsSynchronized: boolean;
    noCorrupted: boolean;
    noBlackFrames: boolean;
    noMissingFiles: boolean;
    passed: boolean;
    checkedAt?: string;
  };
  // Meta
  createdAt: string;
  updatedAt: string;
  attempts: number;
  maxAttempts: number;
  lockedAt?: string | null;
  lockedBy?: string | null;
  error?: string | null;
  dedupeKey: string; // `${uid}:${videoId}:${highlightId}:short:${captionStyle}`
  auditLog?: Array<{ at: string; from: string; to: string; by: string; note?: string }>;
  // For UI: source highlight type/score for display
  sourceHighlightType?: string;
  sourceScore?: number;
};

export const SHORTS_JOB_MAX_ATTEMPTS = 3;
export const SHORTS_JOB_LOCK_TTL_MS = 5 * 60 * 1000;
export const SHORTS_TARGET_WIDTH = 1080;
export const SHORTS_TARGET_HEIGHT = 1920;
export const SHORTS_ASPECT = "9:16" as const;

// Firestore paths
export function shortsCollectionPath(uid: string, videoId: string): string {
  return `users/${uid}/videos/${videoId}/shorts`;
}
export function shortDocPath(uid: string, videoId: string, shortId: string): string {
  return `users/${uid}/videos/${videoId}/shorts/${shortId}`;
}
export function shortStoragePath(uid: string, videoId: string, shortId: string): string {
  return `users/${uid}/videos/${videoId}/shorts/${shortId}.mp4`;
}
export function shortThumbnailPath(uid: string, videoId: string, shortId: string): string {
  return `users/${uid}/videos/${videoId}/shorts/${shortId}.jpg`;
}
export function dedupeKeyForShort(uid: string, videoId: string, highlightId: string, style: CaptionStyle = "Clean"): string {
  return `${uid}:${videoId}:${highlightId}:short:${style}`;
}

// Also for jobs collection (reuse users/{uid}/jobs for shorts jobs like highlights)
export function shortJobDocPath(uid: string, jobId: string): string {
  return `users/${uid}/jobs/${jobId}`;
}
export type ShortJobStatus = ShortStatus;
export type ShortJobDoc = ShortDoc & {
  jobId: string; // same as shortId for 1:1
  jobType: "shorts";
  provider: "clipforge";
  project: "fpq";
};
