import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  const where: any = { userId: session.id };
  if (videoId) where.videoId = videoId;

  try {
    const jobs = await prisma.processingJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { video: { select: { filename: true } } },
    });
    return NextResponse.json({ jobs });
  } catch (e) {
    console.error("jobs error", e);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}
