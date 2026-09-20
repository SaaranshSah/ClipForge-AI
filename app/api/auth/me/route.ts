import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true },
    });
    // If user not found in DB (e.g., fallback firebase_* id or DB wiped), still return session — don't 401
    if (!user) {
      return NextResponse.json({ user: { id: session.id, email: session.email, name: session.name } });
    }
    return NextResponse.json({ user });
  } catch {
    // if DB not reachable, still return session
    return NextResponse.json({ user: { id: session.id, email: session.email, name: session.name } });
  }
}
