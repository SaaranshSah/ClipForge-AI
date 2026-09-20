import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[0-9]/, "Must contain at least one number");

export const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(60).optional(),
  email: z.string().email("Enter a valid email").max(254),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const uploadSignedUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(2147483648), // 2GB
  mimeType: z.string().min(1),
  duration: z.number().optional(),
});

export const ALLOWED_VIDEO_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-matroska",
] as const;

export const ALLOWED_VIDEO_EXT = [".mp4", ".mov", ".avi", ".webm", ".mkv"] as const;

export const MAX_UPLOAD_BYTES = 2147483648; // 2GB
export const MIN_UPLOAD_BYTES = 1024; // 1KB

export function validateVideoFile(
  filename: string,
  mimeType: string,
  fileSize: number
): string | null {
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  if (!(ALLOWED_VIDEO_EXT as readonly string[]).includes(ext)) {
    return `Unsupported file type. Allowed: ${ALLOWED_VIDEO_EXT.join(", ")}`;
  }
  if (!(ALLOWED_VIDEO_MIME as readonly string[]).includes(mimeType)) {
    // Allow browser variations: video/mp4 is common, but some browsers report differently
    if (!mimeType.startsWith("video/")) {
      return "File must be a video";
    }
  }
  if (fileSize < MIN_UPLOAD_BYTES) return "File is too small";
  if (fileSize > MAX_UPLOAD_BYTES) return "File exceeds 2GB limit";
  return null;
}

export const nicheSettingsSchema = z.object({
  niche: z.string().min(1).max(50),
  targetDuration: z.number().int().min(15).max(180),
  captionStyle: z.enum(["minimal", "bold", "karaoke", "none"]),
  captionEnabled: z.boolean(),
  language: z.string().min(2).max(10),
  tone: z.string().min(1).max(30),
});

export const profileSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  bio: z.string().max(500).optional(),
  niche: z.string().max(50).optional(),
  language: z.string().min(2).max(10),
  timezone: z.string().min(1).max(60),
});
