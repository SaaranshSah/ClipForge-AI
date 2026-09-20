import * as jose from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me-32-chars-min";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const COOKIE_NAME = "clipforge_token";

function getSecretKey() {
  return new TextEncoder().encode(JWT_SECRET);
}

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: SessionUser): Promise<string> {
  const secret = getSecretKey();
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .setIssuer("clipforge")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jose.jwtVerify(token, secret, { issuer: "clipforge" });
    if (typeof payload.id === "string" && typeof payload.email === "string") {
      return { id: payload.id as string, email: payload.email as string, name: payload.name as string | null };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearAuthCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getCurrentUser() {
  const session = await getSessionUser();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return user;
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
