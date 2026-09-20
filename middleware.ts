import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as jose from "jose";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/api/auth/login", "/api/auth/signup", "/api/auth/logout"];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) ||
    pathname.match(/\.[a-z]+$/)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes and static
  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Protect dashboard + API
  const needsAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/upload") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/clips") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/integrations") ||
    (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth"));

  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get("clipforge_token")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-secret-change-me-32-chars-min");
    await jose.jwtVerify(token, secret, { issuer: "clipforge" });
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("clipforge_token", "", { maxAge: 0, path: "/" });
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
