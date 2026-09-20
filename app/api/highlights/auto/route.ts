import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { createHighlightsJob } from "@/lib/highlights/server";

export const dynamic = "force-dynamic";

// POST /api/highlights/auto
// Body: { videoId, sourceUrl, filename, duration? }
// Idempotent: if job already exists for this video, returns existing job (no duplicate)
// This is called automatically after video stored (Firebase Storage or Cloudinary) — no manual per-video start needed
// Also callable manually or by worker
export async function POST(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;

    const body = await req.json().catch(() => ({}));
    const { videoId, sourceUrl, filename, duration } = body as {
      videoId?: string;
      sourceUrl?: string;
      filename?: string;
      duration?: number | null;
    };

    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    if (!sourceUrl) return NextResponse.json({ error: "sourceUrl required" }, { status: 400 });
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

    // Security: videoId should be scoped to user — we don't strictly validate here, but createHighlightsJob will check dup
    // Duplicate prevention via dedupeKey
    const { job, created } = await createHighlightsJob({
      uid,
      videoId,
      sourceUrl,
      filename,
      duration: duration ?? null,
    });

    return NextResponse.json({ job, created, message: created ? "Highlights job queued (fpq)" : "Highlights job already exists (idempotent)" }, { status: created ? 201 : 200 });
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    console.error("[highlights/auto] error", e);
    return NextResponse.json({ error: e.message || "Failed to create highlights job", code: e.code || "HIGHLIGHTS_ERROR" }, { status: 500 });
  }
}

// GET helper for docs
export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST /api/highlights/auto { videoId, sourceUrl, filename, duration? } — auto-queues gaming highlights (fpq) with idempotency",
    pipeline: "Video stored → create AI job → ClipForge fpq → scoring → highlights → clips in Firebase Storage",
  });
}
