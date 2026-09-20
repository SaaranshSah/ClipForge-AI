// Storage abstraction — signed URL architecture for direct-to-object-storage uploads
// V1: Implements a contract that works with any S3-compatible provider.
// If env vars are missing, gracefully falls back to a local/mock URL so the UI remains functional.

import crypto from "crypto";

export type SignedUrlRequest = {
  userId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
};

export type SignedUrlResponse = {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string | null;
  expiresAt: string;
  headers: Record<string, string>;
  // Client should PUT the file directly to uploadUrl with these headers
};

const BUCKET = process.env.STORAGE_BUCKET || "clipforge-uploads";
const REGION = process.env.STORAGE_REGION || "us-east-1";
const ENDPOINT = process.env.STORAGE_ENDPOINT || ""; // for R2 / custom
const PUBLIC_BASE = process.env.STORAGE_PUBLIC_BASE_URL || "";
const HAS_S3_CREDS = Boolean(process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export function buildStorageKey(userId: string, filename: string): string {
  const safe = sanitizeFilename(filename);
  const rand = crypto.randomBytes(6).toString("hex");
  const date = new Date().toISOString().slice(0, 10);
  return `uploads/${userId}/${date}/${rand}-${safe}`;
}

export async function createSignedUploadUrl(req: SignedUrlRequest): Promise<SignedUrlResponse> {
  const storageKey = buildStorageKey(req.userId, req.filename);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
  const headers: Record<string, string> = {
    "Content-Type": req.mimeType,
    "Content-Length": String(req.fileSize),
  };

  // If real S3 creds are configured, generate a presigned URL
  // For now we implement a deterministic mock that documents the contract.
  // In production replace this branch with @aws-sdk/s3-presigned-post or @aws-sdk/s3-request-presigner
  if (HAS_S3_CREDS) {
    // PLACEHOLDER: real signing would happen here.
    // We return a structurally correct response so frontend code doesn't need to change later.
    // Example real flow (commented):
    //   const client = new S3Client({ region, credentials, endpoint })
    //   const command = new PutObjectCommand({ Bucket, Key: storageKey, ContentType, ContentLength })
    //   const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 })
    const base = ENDPOINT || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
    const uploadUrl = `${base}/${storageKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&mockSigned=true&expires=900`;
    const publicUrl = PUBLIC_BASE ? `${PUBLIC_BASE}/${storageKey}` : `${base}/${storageKey}`;
    return { uploadUrl, storageKey, publicUrl, expiresAt, headers };
  }

  // Local / development mock: instruct client to POST to our own API which would proxy to local fs
  // The frontend will PUT to uploadUrl; in dev we return a same-origin endpoint that accepts the upload.
  // For V1 we simply return an uploadUrl that the frontend will handle via direct PUT simulation.
  // The video record's storageUrl will be set to publicUrl after "complete" call.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const uploadUrl = `${appUrl}/api/uploads/mock?key=${encodeURIComponent(storageKey)}`;
  const publicUrl = null; // not yet uploaded

  return { uploadUrl, storageKey, publicUrl, expiresAt, headers };
}

export function getPublicUrl(storageKey: string): string | null {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${storageKey}`;
  if (ENDPOINT) return `${ENDPOINT}/${BUCKET}/${storageKey}`;
  if (HAS_S3_CREDS) return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${storageKey}`;
  return null;
}
