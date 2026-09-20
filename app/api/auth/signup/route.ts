import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { signupSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }
    const { email, password, name } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const pwHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: pwHash,
        name: name?.trim() || null,
        profile: {
          create: {
            language: "en",
            timezone: "UTC",
          },
        },
        nicheSettings: {
          create: {
            niche: "general",
            targetDuration: 30,
            captionStyle: "minimal",
            captionEnabled: true,
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

    const token = await signToken({ id: user.id, email: user.email, name: user.name });
    await setAuthCookie(token);

    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    console.error("signup error", e);
    // If DB not ready, return explicit message but don't leak details
    return NextResponse.json({ error: "Failed to create account. Check DATABASE_URL and run migrations." }, { status: 500 });
  }
}
