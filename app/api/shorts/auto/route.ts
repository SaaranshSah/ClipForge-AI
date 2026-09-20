import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { createShortForHighlight, getBestHighlightForVideo } from "@/lib/shorts/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { CaptionStyle } from "@/lib/shorts/types";

export const dynamic = "force-dynamic";

// POST /api/shorts/auto — automatically convert best highlight into Short
// Body: { videoId, highlightId?, captionStyle?: "Clean"|"Bold"|"Gaming"|"Minimal" }
// If highlightId not provided, selects best highlight for video
// Idempotent per highlight + captionStyle
export async function POST(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;
    const body = await req.json().catch(() => ({}));
    const { videoId, highlightId, captionStyle } = body as {
      videoId?: string;
      highlightId?: string;
      captionStyle?: CaptionStyle;
    };
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

    const style: CaptionStyle = (captionStyle as CaptionStyle) || "Clean";
    if (!["Clean", "Bold", "Gaming", "Minimal"].includes(style)) {
      return NextResponse.json({ error: "captionStyle must be Clean|Bold|Gaming|Minimal" }, { status: 400 });
    }

    let highlight: any = null;
    const _db = await getAdminDb();

    if (highlightId) {
      const snap = await _db.doc(`users/${uid}/videos/${videoId}/highlights/${highlightId}`).get();
      if (!snap.exists) return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
      highlight = snap.data();
      if (highlight.ownerId && highlight.ownerId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      // Auto-select best highlight
      const best = await getBestHighlightForVideo(uid, videoId);
      if (!best) return NextResponse.json({ error: "No completed highlights for this video. Run highlights first." }, { status: 404 });
      highlight = best;
    }

    const { short, created } = await createShortForHighlight({
      uid,
      videoId,
      highlight,
      captionStyle: style,
    });

    return NextResponse.json(
      {
        short,
        created,
        message: created
          ? `Short queued (${style}) — 1080x1920 vertical, smart crop, captions, quality check`
          : `Short already exists (idempotent) for highlight ${highlight.highlightId} style ${style}`,
      },
      { status: created ? 201 : 200 }
    );
  } catch (e: any) {
    const status = e.status || 401;
    if (status === 401) return NextResponse.json({ error: e.message || "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    console.error("[shorts/auto] error", e);
    return NextResponse.json({ error: e.message || "Failed to create short", code: e.code || "SHORTS_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: 'POST /api/shorts/auto { videoId, highlightId?, captionStyle? } — auto-converts best highlight (or specific) into 9:16 Short (1080x1920, smart crop, captions, audio, quality check)',
    pipeline: "AI highlight → best clip → vertical 1080x1920 smart crop → captions (Clean/Bold/Gaming/Minimal) → audio normalize → editing → thumbnail → quality check → Short",
    captionStyles: ["Clean", "Bold", "Gaming", "Minimal"],
  });
}
