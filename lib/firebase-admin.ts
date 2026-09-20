// Server-only Firebase Admin helper — V4: Firestore + Auth only, Cloudinary for video storage
// We support two modes:
// 1) Full Admin with service account (FIREBASE_ADMIN_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT)
// 2) Fallback mock that keeps Firestore in memory for local dev without credentials
// This file is server-only — never import in client components.
// Firebase Storage removed per V4 architecture — all video files (original/clips/shorts/thumbnails) use Cloudinary resource_type video
import "server-only";

type AdminApp = any;

let adminApp: AdminApp | null = (globalThis as any).__clipforgeAdminApp ?? null;
let adminDb: any = (globalThis as any).__clipforgeAdminDb ?? null;
let adminStorage: any = null; // Deprecated per V4 — Cloudinary for video storage
let isMock: boolean = (globalThis as any).__clipforgeIsMock ?? false;

// In-memory mock for Firestore when admin not configured
// Generic store: collectionPath -> Map<docId, data> — persisted on globalThis to survive HMR reloads
const mockStore: Map<string, Map<string, any>> = (globalThis as any).__clipforgeMockStore ?? ((globalThis as any).__clipforgeMockStore = new Map<string, Map<string, any>>());

function getCollectionMap(collectionPath: string): Map<string, any> {
  if (!mockStore.has(collectionPath)) mockStore.set(collectionPath, new Map());
  return mockStore.get(collectionPath)!;
}

function getMockDb() {
  return {
    collection: (path: string) => {
      // path like "users/uid/jobs" or "users/uid/videos"
      return {
        doc: (docId: string) => ({
          path: `${path}/${docId}`,
          set: async (data: any, opts?: any) => {
            const col = getCollectionMap(path);
            const existing = col.get(docId) || {};
            const merged = opts?.merge ? { ...existing, ...data } : data;
            col.set(docId, merged);
          },
          update: async (data: any) => {
            const col = getCollectionMap(path);
            const existing = col.get(docId) || {};
            col.set(docId, { ...existing, ...data });
          },
          get: async () => {
            const col = getCollectionMap(path);
            const data = col.get(docId);
            return { exists: !!data, data: () => data, id: docId };
          },
          delete: async () => {
            const col = getCollectionMap(path);
            col.delete(docId);
          },
        }),
        where: function () { return this; },
        orderBy: function () { return this; },
        limit: function () { return this; },
        get: async () => {
          const col = getCollectionMap(path);
          const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data, exists: true }));
          return { docs, empty: docs.length === 0, forEach: (cb: any) => docs.forEach(cb) };
        },
        // add .add for completeness
        add: async (data: any) => {
          const col = getCollectionMap(path);
          const id = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          col.set(id, data);
          return { id };
        },
      };
    },
    doc: (path: string) => {
      // path like "users/{uid}/videos/{videoId}" or "users/{uid}/jobs/{jobId}"
      const parts = path.split("/");
      if (parts.length % 2 === 0 && parts[0] === "users") {
        // collection = all but last segment, docId = last
        const docId = parts[parts.length - 1];
        const collectionPath = parts.slice(0, -1).join("/");
        return {
          path,
          set: async (data: any, opts?: any) => {
            const col = getCollectionMap(collectionPath);
            const existing = col.get(docId) || {};
            const merged = opts?.merge ? { ...existing, ...data } : data;
            col.set(docId, merged);
          },
          update: async (data: any) => {
            const col = getCollectionMap(collectionPath);
            const existing = col.get(docId) || {};
            col.set(docId, { ...existing, ...data });
          },
          get: async () => {
            const col = getCollectionMap(collectionPath);
            const data = col.get(docId);
            return { exists: !!data, data: () => data, id: docId };
          },
          delete: async () => {
            const col = getCollectionMap(collectionPath);
            col.delete(docId);
          },
        };
      }
      return {
        path,
        set: async () => {},
        update: async () => {},
        get: async () => ({ exists: false, data: () => null }),
        delete: async () => {},
      };
    },
    // Expose internal for debugging
    _mockStore: mockStore,
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
        (globalThis as any).__clipforgeIsMock = true;
        return getMockDb();
      }
    }
    adminApp = admin.app();
    (globalThis as any).__clipforgeAdminApp = adminApp;
    adminDb = admin.firestore();
    (globalThis as any).__clipforgeAdminDb = adminDb;
    // Firebase Storage init removed per V4 — video files use Cloudinary (resource_type video)
    return adminDb;
  } catch (e) {
    console.warn("[firebase-admin] init failed, falling back to mock:", (e as Error).message);
    isMock = true;
    (globalThis as any).__clipforgeIsMock = true;
    return getMockDb();
  }
}

export async function getAdminStorage(): Promise<any> {
  console.warn("[firebase-admin] getAdminStorage deprecated per V4 — use Cloudinary for video files (resource_type video)");
  return null;
}
export { adminStorage };
export const storageBucket: string = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "clipforge-ai-910f9.firebasestorage.app";

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
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
    const payload = JSON.parse(payloadJson);
    return { uid: payload.user_id || payload.sub || payload.uid, email: payload.email };
  } catch {
    return null;
  }
}

export function isAdminMock(): boolean {
  return isMock;
}

// Expose mock store for testing if needed
export function __getMockStore() {
  return mockStore;
}
