import { NextResponse } from "next/server";
import { getCloudinaryConfig } from "@/lib/cloudinary/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const cfg = getCloudinaryConfig();
  return NextResponse.json({
    cloudName: cfg.cloudName,
    isMock: cfg.isMock,
    correct: cfg.cloudName === "fpqs7ddc" && !cfg.isMock,
    env: {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ? "set" : "missing",
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ? (process.env.CLOUDINARY_API_KEY.length > 5 ? "set:"+process.env.CLOUDINARY_API_KEY.slice(0,3)+"***" : "set") : "missing",
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? "set" : "missing",
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "missing",
      CLOUDINARY_MOCK: process.env.CLOUDINARY_MOCK || "missing",
      TEST_MODE: process.env.TEST_MODE || "missing",
      CLOUDINARY_URL: process.env.CLOUDINARY_URL ? "set" : "missing",
    },
    timestamp: new Date().toISOString(),
  });
}
