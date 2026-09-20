import { NextResponse } from "next/server";

// Mock endpoint for local dev when no real S3 bucket is configured.
// Accepts PUT body and discards it — just returns 200 so the frontend flow completes.
// In production this route is never hit; uploadUrl points directly to S3/R2.

export async function PUT(req: Request) {
  // Consume body to avoid hanging
  try {
    await req.arrayBuffer();
  } catch {}
  return new NextResponse(null, { status: 200, headers: { "x-mock-storage": "clipforge-v1" } });
}

export async function POST(req: Request) {
  try {
    await req.arrayBuffer();
  } catch {}
  return new NextResponse(null, { status: 200 });
}
