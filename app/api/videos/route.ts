import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status");

  const where: any = { userId: session.id };
  if (q) where.filename = { contains: q, mode: "insensitive" };
  if (status && status !== "ALL") where.status = status;

  try {
    const videos = await prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { clips: true } } },
    });
    return NextResponse.json({ videos });
  } catch (e) {
    console.error("videos list error", e);
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
  }
}
