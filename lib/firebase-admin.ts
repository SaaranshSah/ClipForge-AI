// Server-only Firebase Admin helper
// We support two modes:
// 1) Full Admin with service account (FIREBASE_ADMIN_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT)
// 2) Fallback mock that keeps Firestore in memory for local dev without credentials
// This file is server-only — never import in client components.
import "server-only";

type AdminApp = any;

let adminApp: AdminApp | null = null;
let adminDb: any = null;
let adminStorage: any = null;
let isMock = false;

// In-memory mock for Firestore when admin not configured
const mockFirestore = {
  jobs: new Map<string, Map<string, any>>(), // uid -> jobId -> doc
};

function getMockDb() {
  return {
    collection: (path: string) => {
      // path like "users/uid/jobs"
      const parts = path.split("/");
      const uid = parts[1];
      return {
        doc: (jobId: string) => ({
          path: `${path}/${jobId}`,
          set: async (data: any, opts?: any) => {
            if (!mockFirestore.jobs.has(uid)) mockFirestore.jobs.set(uid, new Map());
            const existing = mockFirestore.jobs.get(uid)!.get(jobId) || {};
            const merged = opts?.merge ? { ...existing, ...data } : data;
            mockFirestore.jobs.get(uid)!.set(jobId, merged);
          },
          update: async (data: any) => {
            if (!mockFirestore.jobs.has(uid)) mockFirestore.jobs.set(uid, new Map());
            const existing = mockFirestore.jobs.get(uid)!.get(jobId) || {};
            mockFirestore.jobs.get(uid)!.set(jobId, { ...existing, ...data });
          },
          get: async () => {
            const data = mockFirestore.jobs.get(uid)?.get(jobId);
            return { exists: !!data, data: () => data, id: jobId };
          },
          delete: async () => {
            mockFirestore.jobs.get(uid)?.delete(jobId);
          },
        }),
        where: () => ({ get: async () => ({ docs: [] }) }),
        orderBy: function () { return this; },
        limit: function () { return this; },
        get: async () => {
          const map = mockFirestore.jobs.get(uid);
          const docs = map ? Array.from(map.entries()).map(([id, data]) => ({ id, data: () => data, exists: true })) : [];
          return { docs, empty: docs.length === 0 };
        },
      };
    },
    doc: (path: string) => {
      const parts = path.split("/");
      // users/{uid}/jobs/{jobId}
      if (parts.length === 4 && parts[0] === "users" && parts[2] === "jobs") {
        const uid = parts[1];
        const jobId = parts[3];
        return {
          path,
          set: async (data: any, opts?: any) => {
            if (!mockFirestore.jobs.has(uid)) mockFirestore.jobs.set(uid, new Map());
            const existing = mockFirestore.jobs.get(uid)!.get(jobId) || {};
            const merged = opts?.merge ? { ...existing, ...data } : data;
            mockFirestore.jobs.get(uid)!.set(jobId, merged);
          },
          update: async (data: any) => {
            if (!mockFirestore.jobs.has(uid)) mockFirestore.jobs.set(uid, new Map());
            const existing = mockFirestore.jobs.get(uid)!.get(jobId) || {};
            mockFirestore.jobs.get(uid)!.set(jobId, { ...existing, ...data });
          },
          get: async () => {
            const data = mockFirestore.jobs.get(uid)?.get(jobId);
            return { exists: !!data, data: () => data, id: jobId };
          },
        };
      }
      return {
        path,
        set: async () => {},
        update: async () => {},
        get: async () => ({ exists: false, data: () => null }),
      };
    },
  };
}

export async function getAdminDb() {
  if (adminDb) return adminDb;
  if (isMock) return getMockDb();

  try {
    const imported: any = await import("firebase-admin");
    const admin: any = imported.default ?? imported;
    // Only initialize once
    if (admin.apps.length === 0) {
      const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "clipforge-ai-910f9";

      if (credJson) {
        // credJson may be base64 or raw JSON
        let parsed: any;
        try {
          const decoded = Buffer.from(credJson, "base64").toString("utf8");
          parsed = JSON.parse(decoded);
          if (!parsed.project_id) throw new Error("not base64 json");
        } catch {
          parsed = JSON.parse(credJson);
        }
        admin.initializeApp({
          credential: admin.credential.cert(parsed),
          projectId: parsed.project_id || projectId,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "clipforge-ai-910f9.firebasestorage.app",
        });
      } else {
        // Try default credentials (Netlify may have GOOGLE_APPLICATION_CREDENTIALS)
        // If not available, fall back to mock but warn
        console.warn("[firebase-admin] FIREBASE_ADMIN_CREDENTIALS not set — using mock Firestore. Set it in Netlify for production.");
        isMock = true;
        return getMockDb();
      }
    }
    adminApp = admin.app();
    adminDb = admin.firestore();
    // Optional storage
    try {
      adminStorage = admin.storage();
    } catch {}
    return adminDb;
  } catch (e) {
    console.warn("[firebase-admin] init failed, falling back to mock:", (e as Error).message);
    isMock = true;
    return getMockDb();
  }
}

export async function getAdminStorage() {
  if (adminStorage) return adminStorage;
  await getAdminDb();
  return adminStorage;
}

// Helper to verify Firebase ID token server-side without admin (fallback)
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  try {
    await getAdminDb();
    // If real admin, use auth().verifyIdToken
    if (!isMock) {
      const imported: any = await import("firebase-admin");
      const admin: any = imported.default ?? imported;
      const decoded = await admin.auth().verifyIdToken(idToken);
      return { uid: decoded.uid, email: decoded.email };
    }
    // Mock: decode JWT payload without verification (dev only)
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString());
    return { uid: payload.user_id || payload.sub || payload.uid, email: payload.email };
  } catch {
    return null;
  }
}

export function isAdminMock(): boolean {
  return isMock;
}
