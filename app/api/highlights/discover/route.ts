import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { discoverEligibleVideos, createHighlightsJob } from "@/lib/highlights/server";

export const dynamic = "force-dynamic";

// GET /api/highlights/discover?limit=10 — list eligible videos not yet queued
export async function GET(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);
    const eligible = await discoverEligibleVideos(uid, limit);
    return NextResponse.json({ eligible, count: eligible.length });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to discover" }, { status: 500 });
  }
}

// POST /api/highlights/discover — auto-queue all eligible videos (bulk, idempotent)
// Body: { limit?: number }  — will create jobs for up to limit eligible videos
export async function POST(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit || 10, 50);
    const eligible = await discoverEligibleVideos(uid, limit);
    const results = [];
    for (const v of eligible) {
      try {
        const { job, created } = await createHighlightsJob({ uid, videoId: v.videoId, sourceUrl: v.sourceUrl, filename: v.filename, duration: v.duration ?? null });
        results.push({ videoId: v.videoId, jobId: job.jobId, created, status: job.status });
      } catch (err: any) {
        results.push({ videoId: v.videoId, error: err.message, created: false });
      }
    }
    return NextResponse.json({ queued: results.filter((r) => r.created).length, results, eligibleCount: eligible.length });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to auto-queue" }, { status: 500 });
  }
}
