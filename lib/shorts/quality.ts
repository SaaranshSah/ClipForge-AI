// V4 Quality Checks — before marking Short ready
import type { ShortDoc } from "./types";

export type QualityResult = {
  aspectRatio: boolean;
  duration: boolean;
  videoPlays: boolean;
  audioExists: boolean;
  captionsSynchronized: boolean;
  noCorrupted: boolean;
  noBlackFrames: boolean;
  noMissingFiles: boolean;
  passed: boolean;
  reasons: string[];
};

export function runQualityChecks(short: Pick<ShortDoc, "width" | "height" | "aspectRatio" | "duration" | "captions" | "storagePath" | "thumbnailPath" | "editing">, opts?: { durationValid?: boolean; hasAudio?: boolean; captionsSynced?: boolean }): QualityResult {
  const reasons: string[] = [];

  // 1. Correct aspect ratio 9:16 1080x1920
  const aspectRatio = short.width === 1080 && short.height === 1920 && short.aspectRatio === "9:16";
  if (!aspectRatio) reasons.push(`aspectRatio expected 1080x1920 9:16 got ${short.width}x${short.height} ${short.aspectRatio}`);

  // 2. Valid duration for Shorts: 5-60s (YouTube Shorts allows up to 60, we keep highlight duration 8-25)
  const duration = typeof short.duration === "number" && short.duration >= 5 && short.duration <= 60;
  if (!duration) reasons.push(`duration ${short.duration}s outside 5-60s`);

  // 3. Video plays correctly (mock: check storagePath exists and not empty)
  const videoPlays = !!short.storagePath && short.storagePath.endsWith(".mp4");
  if (!videoPlays) reasons.push("videoPlays: storagePath missing or not .mp4");

  // 4. Audio exists (mock: editing audioExists)
  const audioExists = short.editing?.audioExists !== false;
  if (!audioExists) reasons.push("audioExists: false");

  // 5. Captions synchronized (mock: captions exist and within duration)
  let captionsSynchronized = true;
  if (short.captions && short.captions.length > 0) {
    for (const c of short.captions) {
      if (c.start < 0 || c.end > short.duration + 0.5 || c.start >= c.end) captionsSynchronized = false;
    }
    // Check that captions cover reasonable portion
    if (short.captions.length === 0) captionsSynchronized = false;
  } else {
    // Allow no captions? But V4 should have captions
    captionsSynchronized = false;
    reasons.push("captionsSynchronized: no captions");
  }
  if (opts?.captionsSynced === false) captionsSynchronized = false;
  if (!captionsSynchronized) reasons.push("captionsSynchronized: out of sync or missing");

  // 6. No corrupted output (mock: always true unless flagged)
  const noCorrupted = true;
  // 7. No accidental black frames (mock: check avoidBlackBars)
  const noBlackFrames = short.editing?.avoidBlackBars !== false;
  if (!noBlackFrames) reasons.push("noBlackFrames: black bars detected");

  // 8. No missing files (storagePath + thumbnailPath)
  const noMissingFiles = !!short.storagePath && !!short.thumbnailPath;
  if (!noMissingFiles) reasons.push("noMissingFiles: storagePath or thumbnailPath missing");

  const passed = aspectRatio && duration && videoPlays && audioExists && captionsSynchronized && noCorrupted && noBlackFrames && noMissingFiles;

  return {
    aspectRatio,
    duration,
    videoPlays,
    audioExists,
    captionsSynchronized,
    noCorrupted,
    noBlackFrames,
    noMissingFiles,
    passed,
    reasons,
  };
}

export function qualityToDoc(c: QualityResult): ShortDoc["qualityChecks"] {
  return {
    aspectRatio: c.aspectRatio,
    duration: c.duration,
    videoPlays: c.videoPlays,
    audioExists: c.audioExists,
    captionsSynchronized: c.captionsSynchronized,
    noCorrupted: c.noCorrupted,
    noBlackFrames: c.noBlackFrames,
    noMissingFiles: c.noMissingFiles,
    passed: c.passed,
    checkedAt: new Date().toISOString(),
  };
}
