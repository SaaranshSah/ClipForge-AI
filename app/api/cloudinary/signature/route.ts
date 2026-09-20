import { NextResponse } from "next/server";
import { getClipForgeUser } from "@/lib/clipforge/auth";
import { generateCloudinarySignature } from "@/lib/cloudinary/server";

export const dynamic = "force-dynamic";

// POST /api/cloudinary/signature
// Body: { filename, fileSize, mimeType, videoId? }
// Returns: CloudinarySignatureResponse for direct upload
export async function POST(req: Request) {
  try {
    const user = await getClipForgeUser();
    const uid = user.uid;

    const body = await req.json().catch(() => ({}));
    const { filename, fileSize, mimeType, videoId: providedVideoId, folderType } = body as {
      filename?: string;
      fileSize?: number;
      mimeType?: string;
      videoId?: string;
      folderType?: "original" | "clips" | "shorts" | "thumbnails";
    };

    if (!filename) {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }

    // Validate file
    const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska", "video/avi", "video/mov"];
    if (mimeType && !mimeType.startsWith("video/") && !allowed.includes(mimeType)) {
      return NextResponse.json({ error: "Unsupported file type. Use MP4/MOV/AVI/WebM/MKV", code: "UNSUPPORTED_FILE" }, { status: 415 });
    }
    if (fileSize && fileSize > 2147483648) {
      return NextResponse.json({ error: "File too large. Max 2GB", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    if (fileSize && fileSize < 1024) {
      return NextResponse.json({ error: "File too small", code: "INVALID_FILE" }, { status: 400 });
    }

    const videoId = providedVideoId || `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const sig = generateCloudinarySignature({
      uid,
      videoId,
      filename,
      folderType: folderType || "original",
    });

    // Log without secret
    console.log(`[cloudinary] signature for uid=${uid} videoId=${videoId} folder=${sig.folder} mock=${sig.mock}`);

    return NextResponse.json({
      videoId,
      folder: sig.folder,
      publicId: sig.publicId,
      cloudName: sig.cloudName,
      apiKey: sig.apiKey,
      timestamp: sig.timestamp,
      signature: sig.signature,
      uploadUrl: sig.uploadUrl,
      resourceType: sig.resourceType,
      params: sig.params,
      mock: sig.mock,
    });
  } catch (e: any) {
    const status = e.status || 401;
    const code = e.code || "UNAUTHORIZED";
    console.error("[cloudinary/signature] error", e.message);
    if (status === 401) {
      return NextResponse.json({ error: e.message || "Unauthorized", code }, { status: 401 });
    }
    return NextResponse.json({ error: e.message || "Failed to generate signature", code: e.code || "SIGNATURE_ERROR" }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}

// GET docs
export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST /api/cloudinary/signature with { filename, fileSize, mimeType, videoId? } — returns Cloudinary signed params for direct upload",
    folders: ["users/{uid}/videos/{videoId}/original/", "users/{uid}/videos/{videoId}/clips/", "users/{uid}/videos/{videoId}/shorts/", "users/{uid}/videos/{videoId}/thumbnails/"],
  });
}
