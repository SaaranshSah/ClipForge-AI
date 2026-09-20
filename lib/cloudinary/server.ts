import "server-only";

import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";

/**
 * Cloudinary — server-only helpers.
 * Security: never expose CLOUDINARY_API_SECRET to client.
 * Use signed uploads: server generates signature, client uploads directly to Cloudinary.
 */

// Helper to clean env vars: trim, strip quotes and angle brackets
function cleanEnv(value?: string): string {
  if (!value) return "";
  let v = value.trim();
  // Remove surrounding quotes "value" or 'value'
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  // Remove angle brackets <value> if present (user may copy <cloudName>)
  if (v.startsWith("<") && v.endsWith(">")) {
    v = v.slice(1, -1).trim();
  }
  // Remove any remaining surrounding quotes after bracket removal
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

// Parse CLOUDINARY_URL if present: cloudinary://<apiKey>:<apiSecret>@<cloudName>
function parseCloudinaryUrl(url?: string): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const cleaned = cleanEnv(url);
  if (!cleaned || !cleaned.startsWith("cloudinary://")) return null;
  try {
    const u = new URL(cleaned);
    const apiKey = decodeURIComponent(u.username);
    const apiSecret = decodeURIComponent(u.password);
    const cloudName = u.hostname;
    if (apiKey && apiSecret && cloudName) return { cloudName: cleanEnv(cloudName), apiKey: cleanEnv(apiKey), apiSecret: cleanEnv(apiSecret) };
  } catch {}
  try {
    const withoutProtocol = cleaned.replace("cloudinary://", "");
    const atIdx = withoutProtocol.lastIndexOf("@");
    if (atIdx === -1) return null;
    const creds = withoutProtocol.slice(0, atIdx);
    const cloudName = cleanEnv(withoutProtocol.slice(atIdx + 1).split("/")[0].split("?")[0]);
    const colonIdx = creds.indexOf(":");
    if (colonIdx === -1) return null;
    const apiKey = cleanEnv(creds.slice(0, colonIdx));
    const apiSecret = cleanEnv(creds.slice(colonIdx + 1));
    if (apiKey && apiSecret && cloudName) return { cloudName, apiKey, apiSecret };
  } catch {}
  return null;
}

export function getCloudinaryConfig() {
  // Requirement 1: Use CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET (server-only)
  // Also support CLOUDINARY_URL as fallback, but prioritize individual vars as per spec
  const rawCloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME);
  const rawApiKey = cleanEnv(process.env.CLOUDINARY_API_KEY);
  const rawApiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET);
  const urlParsed = parseCloudinaryUrl(process.env.CLOUDINARY_URL);

  // Prioritize individual vars (required), fallback to CLOUDINARY_URL, then NEXT_PUBLIC (for client preview only)
  const cloudName = rawCloudName || urlParsed?.cloudName || cleanEnv(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) || "";
  const apiKey = rawApiKey || urlParsed?.apiKey || "";
  const apiSecret = rawApiSecret || urlParsed?.apiSecret || "";

  // Requirement 3 & 4: Actually read env, do NOT fallback to mock when real creds present
  // Mock only when explicitly enabled — production (TEST_MODE=false, CLOUDINARY_MOCK=false) must use real Cloudinary
  // Do NOT fallback to "demo" — use actual cloud name from env; if missing, isMock true and caller shows real config error
  const explicitMock = cleanEnv(process.env.CLOUDINARY_MOCK) === "true" || cleanEnv(process.env.TEST_MODE) === "true";
  const missingCreds = !cloudName || !apiKey || !apiSecret;
  const isMock = explicitMock || missingCreds;

  if (isMock) {
    if (missingCreds) {
      // Never log secret; only cloudName and mock flags
      console.warn("[cloudinary] Cloudinary not configured — Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (and NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME for previews) in .env.local and Netlify. Current cloudName=" + (cloudName || "(empty)") + " TEST_MODE=" + cleanEnv(process.env.TEST_MODE) + " CLOUDINARY_MOCK=" + cleanEnv(process.env.CLOUDINARY_MOCK));
      const isTest = process.env.TEST_MODE === "true" || process.env.CLOUDINARY_MOCK === "true";
      if (!isTest) {
        // Production: do NOT hardcode demo — return empty to force real config error
        return { cloudName: "", apiKey: "", apiSecret: "", isMock: true };
      }
      // Test mode only: allow mock placeholder for local testing
      return { 
        cloudName: cloudName || "demo", 
        apiKey: apiKey || "mock_key", 
        apiSecret: apiSecret || "mock_secret", 
        isMock: true 
      };
    }
    // Explicit mock with creds present (e.g., CLOUDINARY_MOCK=true with demo)
    return { 
      cloudName, 
      apiKey, 
      apiSecret, 
      isMock: true 
    };
  }

  return { cloudName, apiKey, apiSecret, isMock };
}

export function isCloudinaryMock(): boolean {
  return getCloudinaryConfig().isMock;
}

export function getCloudinary() {
  const cfg = getCloudinaryConfig();
  if (!cfg.isMock) {
    cloudinary.config({
      cloud_name: cfg.cloudName,
      api_key: cfg.apiKey,
      api_secret: cfg.apiSecret,
      secure: true,
    });
  }
  return cloudinary;
}

export type CloudinarySignaturePayload = {
  timestamp: number;
  folder: string;
  publicId: string;
  overwrite?: boolean;
  resourceType: "video" | "image" | "auto";
  eager?: string;
  //.signature will be computed
};

export type CloudinarySignatureResponse = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  resourceType: string;
  // for direct upload to https://api.cloudinary.com/v1_1/<cloud>/video/upload
  uploadUrl: string;
  mock: boolean;
  // also return full params for client to send
  params: Record<string, string | number | boolean>;
};

/**
 * Generate a signed upload signature for Cloudinary.
 * Client will POST directly to Cloudinary with this signature.
 * 
 * Folders: users/{uid}/videos/{videoId}/original/
 *         users/{uid}/videos/{videoId}/clips/
 *         users/{uid}/videos/{videoId}/shorts/
 *         users/{uid}/videos/{videoId}/thumbnails/
 */
export function generateCloudinarySignature(opts: {
  uid: string;
  videoId: string;
  filename: string;
  folderType?: "original" | "clips" | "shorts" | "thumbnails";
}): CloudinarySignatureResponse {
  const cfg = getCloudinaryConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const folderType = opts.folderType || "original";
  const folder = `users/${opts.uid}/videos/${opts.videoId}/${folderType}`;

  // sanitized publicId — without extension, Cloudinary will keep format
  const baseName = opts.filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "video";
  const publicId = `${folder}/${baseName}_${Date.now().toString(36)}`;

  // Params to sign — Cloudinary expects sorted alphabetical string: key=value&...
  // Important: only include params that will be sent.
  const paramsToSign: Record<string, string | number | boolean> = {
    folder,
    public_id: publicId,
    timestamp,
  };

  // For video, we might want resource_type video — but signature is for folder/public_id/timestamp
  // If using eager transformations, include them too.
  // Keep it minimal for reliability.

  let signature: string;
  if (cfg.isMock) {
    const isTest = cleanEnv(process.env.TEST_MODE) === "true" || cleanEnv(process.env.CLOUDINARY_MOCK) === "true";
    if (!isTest) {
      // Requirement 10: Do NOT generate fake credentials — throw real config error
      throw Object.assign(new Error("Cloudinary not configured: missing CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET. Set real credentials in .env.local and Netlify env."), { status: 500, code: "CLOUDINARY_NOT_CONFIGURED" });
    }
    signature = `mock_signature_${timestamp}`;
  } else {
    // Use Cloudinary utils to generate signature
    signature = cloudinary.utils.api_sign_request(paramsToSign, cfg.apiSecret!);
    // Alternative manual: Object.keys(sorted).map(k=>`${k}=${params[k]}`).join("&") + api_secret -> sha1
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/video/upload`;

  return {
    timestamp,
    signature,
    apiKey: cfg.apiKey,
    cloudName: cfg.cloudName,
    folder,
    publicId,
    resourceType: "video",
    uploadUrl,
    mock: cfg.isMock,
    params: paramsToSign,
  };
}

/**
 * Delete a Cloudinary asset by publicId (server-side, uses api_secret)
 */
export async function deleteCloudinaryAsset(publicId: string, resourceType: "video" | "image" = "video"): Promise<{ result: string }> {
  const cfg = getCloudinaryConfig();
  if (cfg.isMock) {
    console.warn(`[cloudinary] mock delete: ${publicId}`);
    return { result: "ok" };
  }
  const cld = getCloudinary();
  // Cloudinary destroy for video
  const result = await cld.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  return result;
}

/**
 * Generate a signed URL for private asset or just return secure_url
 * For thumbnails we can use Cloudinary transformations.
 */
export function getCloudinaryThumbnailUrl(publicId: string, cloudName?: string, opts?: { width?: number; height?: number }): string {
  const cn = cloudName || getCloudinaryConfig().cloudName;
  const w = opts?.width || 320;
  const h = opts?.height || 180;
  // Use video thumbnail at 1s with transformation
  // https://res.cloudinary.com/<cloud>/video/upload/so_1,w_360,h_640,c_fill/<publicId>.jpg
  return `https://res.cloudinary.com/${cn}/video/upload/so_1,w_${w},h_${h},c_fill/${publicId}.jpg`;
}

export function getCloudinaryVideoUrl(publicId: string, cloudName?: string, format?: string): string {
  const cn = cloudName || getCloudinaryConfig().cloudName;
  const ext = format ? `.${format}` : ".mp4";
  return `https://res.cloudinary.com/${cn}/video/upload/${publicId}${ext}`;
}

// Helper to parse Cloudinary upload response into our metadata
export type CloudinaryUploadResult = {
  public_id: string;
  secure_url: string;
  url: string;
  resource_type: string;
  format: string;
  bytes: number;
  duration?: number;
  width?: number;
  height?: number;
  created_at: string;
  version: number;
  original_filename?: string;
  // plus other fields
};

export function mapCloudinaryToMetadata(result: CloudinaryUploadResult, opts: { fileName: string; ownerId: string; videoId: string }) {
  return {
    fileName: opts.fileName,
    cloudinaryPublicId: result.public_id,
    cloudinaryUrl: result.secure_url || result.url,
    resourceType: result.resource_type || "video",
    format: result.format || "mp4",
    fileSize: result.bytes,
    duration: result.duration || null,
    width: result.width || null,
    height: result.height || null,
    status: "ready" as const,
    ownerId: opts.ownerId,
    videoId: opts.videoId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
