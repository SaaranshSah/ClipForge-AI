import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { retryShort } from "@/lib/shorts/server";

export const dynamic = "force-dynamic";

// POST /api/shorts/[shortId]/retry?videoId=xxx
export async function POST(req: Request, { params }: { params: { shortId: string } }) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const shortId = params.shortId;
    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId");
    if (!videoId) return NextResponse.json({ error: "videoId query required" }, { status: 400 });
    const short = await retryShort(uid, videoId, shortId);
    return NextResponse.json({ short });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
    if (status === 404) return NextResponse.json({ error: e.message || "Short not found" }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: e.message || "Cannot retry", code: "INVALID_STATUS" }, { status: 409 });
    if (status === 429) return NextResponse.json({ error: e.message || "Retry limit", code: "RETRY_LIMIT" }, { status: 429 });
    console.error("[shorts/retry] error", e);
    return NextResponse.json({ error: e.message || "Failed to retry" }, { status: 500 });
  }
}
