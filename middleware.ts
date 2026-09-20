import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as jose from "jose";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes and static — login/signup and all /api/auth/* are public
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/api/auth")
  ) {
    // If authenticated user tries to visit /login or /signup, send them to dashboard
    // Check JWT; also check Firebase marker cookie as fallback so we don't bounce
    // a valid Firebase session that hasn't yet re-minted JWT after a DB reset.
    if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
      const token = req.cookies.get("clipforge_token")?.value;
      const fbMarker = req.cookies.get("clipforge_fb")?.value;
      if (token) {
        try {
          const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-secret-change-me-32-chars-min");
          await jose.jwtVerify(token, secret, { issuer: "clipforge" });
          return NextResponse.redirect(new URL("/dashboard", req.url));
        } catch {
          // invalid token — allow to login
        }
      } else if (fbMarker) {
        // Firebase says logged in but JWT not yet re-minted (e.g., after cookie clear).
        // Let the page load so client can sync JWT, don't force to stay on login.
        // We still allow visiting login, but the login page itself will redirect after sync.
      }
    }
    return NextResponse.next();
  }

  // Protect dashboard + API (except /api/auth which is already allowed above)
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
  const fbMarker = req.cookies.get("clipforge_fb")?.value;

  // If no JWT but Firebase marker present, allow request through so client can re-mint JWT.
  // This fixes the crucial refresh bug: Firebase session persists in IndexedDB but JWT cookie
  // may be missing after a mock DB reset or manual cookie clear — we mustn't bounce to /login
  // before client has a chance to call POST /api/auth/firebase.
  if (!token && fbMarker) {
    // For API routes, still require JWT (API is server-to-server); client will re-sync first.
    // But for page routes, allow through.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized — session syncing, retry" }, { status: 401 });
    }
    return NextResponse.next();
  }

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
    // Don't clear fb marker here — Firebase may still be valid and client will re-sync
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
