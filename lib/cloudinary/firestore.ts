// Firestore types and helpers for Cloudinary videos
// Path: users/{uid}/videos/{videoId}
// Never store actual video files in Firestore — only metadata

export type VideoDoc = {
  videoId: string; // same as doc id
  fileName: string;
  cloudinaryPublicId: string; // e.g. users/uid/videos/vid123/original/video_abc
  cloudinaryUrl: string; // secure_url
  resourceType: string; // video
  format: string; // mp4, mov, etc
  fileSize: number; // bytes
  duration: number | null; // seconds
  width: number | null;
  height: number | null;
  status: "uploading" | "processing" | "ready" | "failed";
  processingStatus?: "queued" | "processing" | "completed" | "failed";
  ownerId: string; // uid
  createdAt: string; // ISO
  updatedAt: string; // ISO
  // Optional for folder versatility
  thumbnailUrl?: string;
  originalFolder?: string; // users/{uid}/videos/{videoId}/original
  // Cloudinary version for cache busting
  version?: number;
  // Error if failed
  error?: string | null;
};

export type CreateVideoMetadata = Omit<VideoDoc, "createdAt" | "updatedAt"> & Partial<Pick<VideoDoc, "createdAt" | "updatedAt">>;

export function getVideoDocPath(uid: string, videoId: string): string {
  return `users/${uid}/videos/${videoId}`;
}

export function getVideosCollectionPath(uid: string): string {
  return `users/${uid}/videos`;
}

// Folder helpers
export function getCloudinaryFolders(uid: string, videoId: string) {
  const base = `users/${uid}/videos/${videoId}`;
  return {
    original: `${base}/original`,
    clips: `${base}/clips`,
    shorts: `${base}/shorts`,
    thumbnails: `${base}/thumbnails`,
  };
}
