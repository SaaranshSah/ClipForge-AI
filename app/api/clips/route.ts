import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  const where: any = { userId: session.id };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { video: { filename: { contains: q, mode: "insensitive" } } },
    ];
  }

  try {
    const clips = await prisma.clip.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { video: { select: { filename: true } } },
    });
    return NextResponse.json({ clips });
  } catch (e) {
    console.error("clips list error", e);
    return NextResponse.json({ error: "Failed to fetch clips" }, { status: 500 });
  }
}
