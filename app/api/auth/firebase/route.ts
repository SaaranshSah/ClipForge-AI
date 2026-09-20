import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, setAuthCookie } from "@/lib/auth";

/**
 * POST /api/auth/firebase
 * Client has already authenticated with Firebase (signIn/createUser).
 * We trust the email/name passed from the client (Firebase verified it) and
 * mint our own httpOnly JWT cookie so the rest of the app (middleware + Prisma
 * scoped queries) continues to work. Creates the Prisma User/Profile/NicheSettings
 * rows on first Firebase login if they don't exist.
 *
 * Body: { email: string, name?: string, uid?: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const emailRaw = (body.email as string | undefined)?.trim();
    const nameRaw = (body.name as string | undefined)?.trim();
    const uid = (body.uid as string | undefined)?.trim();

    if (!emailRaw || !emailRaw.includes("@")) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    const email = emailRaw.toLowerCase();

    // Find or create user — upsert so Firebase users automatically get full ClipForge rows
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });

    if (!user) {
      // Create with a placeholder password hash — Firebase is the source of truth for these accounts.
      // Use uid or random string to satisfy NOT NULL; auth will always go via /api/auth/firebase.
      const placeholderHash = `firebase:${uid || Math.random().toString(36).slice(2)}`;
      user = await prisma.user.create({
        data: {
          email,
          name: nameRaw || email.split("@")[0],
          password: placeholderHash,
          profile: {
            create: {
              language: "en",
              timezone: "UTC",
              niche: "general",
            },
          },
          nicheSettings: {
            create: {
              niche: "general",
              targetDuration: 30,
              captionStyle: "minimal",
              captionEnabled: true,
              language: "en",
            },
          },
          integrations: {
            create: [
              { provider: "YOUTUBE", status: "DISCONNECTED" },
              { provider: "INSTAGRAM", status: "DISCONNECTED" },
            ],
          },
        },
        select: { id: true, email: true, name: true },
      });
    } else if (nameRaw && nameRaw !== user.name) {
      // Keep display name in sync if Firebase provides it
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name: nameRaw },
          select: { id: true, email: true, name: true },
        });
      } catch {}
    }

    const token = await signToken({ id: user.id, email: user.email, name: user.name });
    await setAuthCookie(token);

    return NextResponse.json({ user });
  } catch (e) {
    console.error("firebase auth sync error", e);
    return NextResponse.json({ error: "Failed to sync Firebase auth. Check DATABASE_URL and migrations." }, { status: 500 });
  }
}
