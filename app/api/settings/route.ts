import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true },
    });
    const profile = await prisma.profile.findUnique({ where: { userId: session.id } });
    const nicheSettings = await prisma.nicheSettings.findUnique({ where: { userId: session.id } });

    return NextResponse.json({
      user,
      profile: profile
        ? { ...profile, name: user?.name }
        : { name: user?.name, niche: null, language: "en", timezone: "UTC", bio: null },
      nicheSettings,
    });
  } catch (e) {
    console.error("settings get error", e);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { profile, nicheSettings } = body;

    // Validation (light, V1)
    if (profile) {
      const { name, bio, niche, language, timezone } = profile;
      await prisma.user.update({
        where: { id: session.id },
        data: { name: name?.slice(0, 60) || null },
      });
      await prisma.profile.upsert({
        where: { userId: session.id },
        update: {
          bio: bio?.slice(0, 500) || null,
          niche: niche || null,
          language: language || "en",
          timezone: timezone || "UTC",
        },
        create: {
          userId: session.id,
          bio: bio?.slice(0, 500) || null,
          niche: niche || null,
          language: language || "en",
          timezone: timezone || "UTC",
        },
      });
    }

    if (nicheSettings) {
      const { niche, targetDuration, captionStyle, captionEnabled, language } = nicheSettings;
      await prisma.nicheSettings.upsert({
        where: { userId: session.id },
        update: {
          niche: niche || "general",
          targetDuration: Number(targetDuration) || 30,
          captionStyle: captionStyle || "minimal",
          captionEnabled: Boolean(captionEnabled),
          language: language || "en",
        },
        create: {
          userId: session.id,
          niche: niche || "general",
          targetDuration: Number(targetDuration) || 30,
          captionStyle: captionStyle || "minimal",
          captionEnabled: Boolean(captionEnabled),
          language: language || "en",
        },
      });
    }

    const updatedProfile = await prisma.profile.findUnique({ where: { userId: session.id } });
    const updatedNiche = await prisma.nicheSettings.findUnique({ where: { userId: session.id } });
    const updatedUser = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, email: true, name: true } });

    return NextResponse.json({ profile: { ...updatedProfile, name: updatedUser?.name }, nicheSettings: updatedNiche, user: updatedUser });
  } catch (e) {
    console.error("settings put error", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
