import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let integrations = await prisma.integration.findMany({
      where: { userId: session.id },
      orderBy: { provider: "asc" },
    });

    // Ensure both providers exist for V1 UI (idempotent)
    const providers = ["YOUTUBE", "INSTAGRAM"] as const;
    for (const p of providers) {
      if (!integrations.find((i: { provider: string }) => i.provider === p)) {
        const created = await prisma.integration.create({
          data: { userId: session.id, provider: p as any, status: "DISCONNECTED" },
        });
        integrations.push(created as any);
      }
    }

    return NextResponse.json({ integrations });
  } catch (e) {
    console.error("integrations error", e);
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
  }
}

// Placeholder POST — V2 will implement OAuth initiation
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "OAuth not enabled in V1. Integrations are placeholder-only. V2 will return { authUrl }." },
    { status: 501 }
  );
}
