import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { retryHighlightsJob } from "@/lib/highlights/server";

export const dynamic = "force-dynamic";

// POST /api/highlights/jobs/[jobId]/retry — retry failed job (checks retry limit)
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const jobId = params.jobId;

    const job = await retryHighlightsJob(uid, jobId);
    return NextResponse.json({ job });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    if (status === 404) return NextResponse.json({ error: e.message || "Job not found" }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: e.message || "Cannot retry", code: "INVALID_STATUS" }, { status: 409 });
    if (status === 429) return NextResponse.json({ error: e.message || "Retry limit reached", code: "RETRY_LIMIT" }, { status: 429 });
    console.error("[highlights/retry] error", e);
    return NextResponse.json({ error: e.message || "Failed to retry" }, { status: 500 });
  }
}
