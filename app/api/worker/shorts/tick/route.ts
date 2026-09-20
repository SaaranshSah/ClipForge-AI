import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { pollShort } from "@/lib/shorts/server";
import type { ShortDoc } from "@/lib/shorts/types";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest | Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const secret = req.headers.get("x-worker-secret") || req.headers.get("authorization")?.replace("Bearer ", "") || req.headers.get("x-api-key") || "";
  const expected = process.env.WORKER_SECRET || process.env.CLIPFORGE_API_KEY || process.env.CLIPFORGE_WEBHOOK_SECRET;
  if (!expected) return true;
  if (!secret) return false;
  return secret.trim() === expected.trim();
}

async function findNextPendingShort(): Promise<{ uid: string; videoId: string; short: ShortDoc } | null> {
  const db = await getAdminDb();
  // Scan mockStore for shorts if users collection empty, else scan users
  try {
    const usersSnap = await db.collection("users").get();
    let uids: string[] = (usersSnap.docs as any[]).map((d: any) => d.id);
    if (uids.length === 0) {
      const { __getMockStore } = await import("@/lib/firebase-admin");
      const store = __getMockStore();
      const set = new Set<string>();
      for (const colPath of store.keys()) {
        const m = colPath.match(/^users\/([^\/]+)\//);
        if (m) set.add(m[1]);
      }
      uids = Array.from(set);
    }
    let best: { uid: string; videoId: string; short: ShortDoc } | null = null;
    for (const uid of uids) {
      // List videos for uid
      const vsnap = await db.collection(`users/${uid}/videos`).get();
      for (const vdoc of (vsnap.docs as any[])) {
        const videoId = vdoc.id;
        const shortsSnap = await db.collection(`users/${uid}/videos/${videoId}/shorts`).get();
        for (const sdoc of (shortsSnap.docs as any[])) {
          const s = sdoc.data() as ShortDoc;
          if (!["QUEUED", "RETRYING", "PROCESSING", "EDITING", "CAPTIONING", "QUALITY_CHECK"].includes(s.status)) continue;
          const candidate = { uid, videoId, short: s };
          if (!best) best = candidate;
          else {
            const aPending = ["QUEUED", "RETRYING"].includes(candidate.short.status);
            const bPending = ["QUEUED", "RETRYING"].includes(best.short.status);
            if (aPending && !bPending) best = candidate;
            else if (aPending === bPending) {
              if (new Date(candidate.short.createdAt).getTime() < new Date(best.short.createdAt).getTime()) best = candidate;
            }
          }
        }
      }
    }
    return best;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized worker", code: "UNAUTHORIZED_WORKER" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const workerId = body.workerId || req.headers.get("x-worker-id") || `worker_${Date.now().toString(36)}`;
  const discoverMode = body.discover === true || req.nextUrl.searchParams.get("discover") === "1";

  try {
    if (discoverMode) {
      const { discoverEligibleHighlights, autoQueueShortsForVideo } = await import("@/lib/shorts/server");
      const db = await getAdminDb();
      const usersSnap = await db.collection("users").get();
      let uids: string[] = (usersSnap.docs as any[]).map((d: any) => d.id);
      if (uids.length === 0) {
        const { __getMockStore } = await import("@/lib/firebase-admin");
        const store = __getMockStore();
        const set = new Set<string>();
        for (const k of store.keys()) {
          const m = k.match(/^users\/([^\/]+)\//);
          if (m) set.add(m[1]);
        }
        uids = Array.from(set);
      }
      let discovered = 0, queued = 0;
      for (const uid of uids) {
        const eligible = await discoverEligibleHighlights(uid, 3);
        for (const { videoId } of eligible) {
          discovered++;
          try {
            const res = await autoQueueShortsForVideo(uid, videoId, { captionStyle: "Clean", maxPerVideo: 1 });
            queued += res.queued;
          } catch {}
          if (queued >= 5) break;
        }
        if (queued >= 5) break;
      }
      if (queued > 0) return NextResponse.json({ ok: true, mode: "discover", discovered, queued });
    }

    const next = await findNextPendingShort();
    if (!next) return NextResponse.json({ ok: true, message: "No pending shorts", idle: true }, { status: 200 });

    const { uid, videoId, short } = next;
    // Use pollShort which handles locking + pipeline
    const updated = await pollShort(uid, videoId, short.shortId);
    return NextResponse.json({ ok: true, short: updated, workerId });
  } catch (e: any) {
    console.error("[worker/shorts/tick] error", e);
    return NextResponse.json({ error: e.message || "Worker tick failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const next = await findNextPendingShort();
  if (!next) return NextResponse.json({ ok: true, pending: 0, idle: true });
  return NextResponse.json({ ok: true, pending: 1, next: { uid: next.uid, videoId: next.videoId, shortId: next.short.shortId, status: next.short.status, progress: next.short.progress } });
}
