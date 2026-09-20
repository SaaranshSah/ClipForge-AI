// V3 Highlights — Firestore helpers (server + client where needed)
import type { HighlightDoc, HighlightsJobDoc } from "./types";

export const HIGHLIGHTS_COLLECTION = "highlights";
export const JOBS_COLLECTION = "jobs";

// Firestore paths are server-side via Admin SDK — these helpers centralize them
// Use getAdminDb().collection(path).doc(id) etc.

// Re-export types for convenience
export type { HighlightDoc, HighlightsJobDoc };
