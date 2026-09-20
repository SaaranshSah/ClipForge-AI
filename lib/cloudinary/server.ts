import "server-only";

import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";

/**
 * Cloudinary — server-only helpers.
 * Security: never expose CLOUDINARY_API_SECRET to client.
 * Use signed uploads: server generates signature, client uploads directly to Cloudinary.
 */

export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // For local dev / preview without real Cloudinary, we allow mock mode
  const isMock = !cloudName || !apiKey || !apiSecret || process.env.CLOUDINARY_MOCK === "true";

  return { cloudName: cloudName || "demo", apiKey: apiKey || "mock_key", apiSecret: apiSecret || "mock_secret", isMock };
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
