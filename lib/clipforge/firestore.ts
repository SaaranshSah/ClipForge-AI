// Firestore helpers for ClipForge jobs
// Path: users/{uid}/jobs/{jobId}
// Ensures users can only access their own jobs (enforced via security rules + server checks)
import type { Firestore } from "firebase/firestore";

export type ClipForgeJobDoc = {
  provider: "clipforge";
  project: "fpq";
  sourceVideoId: string;
  clipforgeJobId: string;
  status: "queued" | "uploading" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: string; // ISO
  updatedAt: string; // ISO
  error?: string | null;
  filename?: string;
  sourceUrl?: string;
  resultUrl?: string | null;
  clipStoragePath?: string | null; // users/{uid}/videos/{videoId}/clips/{clipId}.mp4
  progress?: number;
  attempts?: number;
};

// Client-side helpers (used in polling UI)

// Save new job (client calls after server creates ClipForge job)
export async function saveJobClient(db: Firestore, uid: string, job: ClipForgeJobDoc) {
  const { doc, setDoc } = await import("firebase/firestore");
  const ref = doc(db, `users/${uid}/jobs/${job.clipforgeJobId}`);
  await setDoc(ref, job, { merge: true });
}

export async function updateJobClient(
  db: Firestore,
  uid: string,
  jobId: string,
  patch: Partial<ClipForgeJobDoc>
) {
  const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
  const ref = doc(db, `users/${uid}/jobs/${jobId}`);
  await updateDoc(ref, { ...patch, updatedAt: new Date().toISOString() });
}

// Server helpers will use firebase-admin (via lib/firebase-admin.ts)
// but we also export a utility to validate access
export function assertOwnJob(uid: string, jobUid: string) {
  if (uid !== jobUid) {
    throw Object.assign(new Error("Forbidden: cannot access another user's job"), { status: 403 });
  }
}
