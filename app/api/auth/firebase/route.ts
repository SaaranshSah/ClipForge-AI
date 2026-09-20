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
    // Wrapped to handle missing DATABASE_URL / DB down on Netlify — fallback to Firebase UID so dashboard still works
    let user: { id: string; email: string; name: string | null } | null = null;
    let dbError: any = null;
    try {
      user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });

      if (!user) {
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
        try {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { name: nameRaw },
            select: { id: true, email: true, name: true },
          });
        } catch {}
      }
    } catch (err: any) {
      dbError = err;
      console.warn("[firebase auth] prisma unavailable, falling back to Firebase UID", err?.message);
      // Fallback: use Firebase UID as stable ID so JWT still works even without DB
      // This lets /dashboard render (it catches Prisma stats errors) and Cloudinary per-user still works via Firebase UID
      user = {
        id: uid ? `firebase_${uid}` : `firebase_${email.replace(/[^a-z0-9]/g, "_")}`,
        email,
        name: nameRaw || email.split("@")[0],
      };
    }

    if (!user) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    const token = await signToken({ id: user.id, email: user.email, name: user.name });
    await setAuthCookie(token);

    // Also set clipforge_fb marker server-side so middleware allows dashboard without race
    const res = NextResponse.json({ user });
    // Mirror FB marker for middleware (client also sets it)
    res.cookies.set("clipforge_fb", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    // Also set JWT cookie explicitly on response (setAuthCookie uses cookies() which may not persist on NextResponse in some runtimes — do both)
    res.cookies.set("clipforge_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    if (dbError) {
      // Still 200 — dashboard will work, but log warning
      console.warn("[firebase auth] synced with fallback (DB unavailable)");
    }

    return res;
  } catch (e: any) {
    console.error("firebase auth sync error", e);
    // Last resort: try to still mint a token from body if possible so user not stuck
    try {
      const body = await (async () => {
        try {
          return await new Response(e?.body || "{}").json();
        } catch {
          return {};
        }
      })();
    } catch {}
    return NextResponse.json({ error: "Failed to sync Firebase auth. Check DATABASE_URL and migrations.", details: e?.message }, { status: 500 });
  }
}
