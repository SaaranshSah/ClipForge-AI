import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import type { HighlightsJobDoc } from "@/lib/highlights/types";

export const dynamic = "force-dynamic";

// GET /api/highlights/jobs — list highlights jobs for current user
// Query: ?videoId=xxx to filter, ?status=QUEUED|PROCESSING|COMPLETED|FAILED|RETRYING
export async function GET(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId");
    const status = url.searchParams.get("status");

    const _db = await getAdminDb();
    const snap = await _db.collection(`users/${uid}/jobs`).get();
    let jobs = (snap.docs as any[])
      .map((d) => d.data() as HighlightsJobDoc)
      .filter((j) => j.jobType === "highlights");

    if (videoId) jobs = jobs.filter((j) => j.videoId === videoId);
    if (status) jobs = jobs.filter((j) => j.status === status.toUpperCase());

    // Sort by updatedAt desc
    jobs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ jobs, count: jobs.length });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message || "Failed to list jobs" }, { status: 500 });
  }
}
