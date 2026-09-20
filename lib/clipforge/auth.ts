import "server-only";
import { cookies, headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/**
 * Get authenticated user for ClipForge routes.
 * Supports:
 * 1) JWT httpOnly cookie (existing flow — clipforge_token)
 * 2) Firebase ID token via Authorization: Bearer <idToken>
 *
 * Returns { uid, email, name } where uid is the canonical user id used for Firestore path users/{uid}
 * For JWT users, uid = prisma user.id
 * For Firebase users, uid = Firebase uid (and we ensure a Prisma user exists for compatibility)
 */
export async function getClipForgeUser(): Promise<{ uid: string; email: string; name?: string | null }> {
  // 1) Try JWT cookie first (existing)
  const session = await getSessionUser();
  if (session) {
    return { uid: session.id, email: session.email, name: session.name || null };
  }

  // 2) Try Firebase ID token from Authorization header
  const hdrs = headers();
  const authHeader = hdrs.get("authorization") || hdrs.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.slice(7).trim();
    if (idToken) {
      const decoded = await verifyFirebaseIdToken(idToken);
      if (decoded?.uid) {
        // Ensure Prisma user exists for this Firebase uid (for dashboard stats compatibility)
        // We map Firebase uid -> Prisma user via email, or create if missing
        if (decoded.email) {
          let user = await prisma.user.findUnique({ where: { email: decoded.email.toLowerCase() } });
          if (!user) {
            user = await prisma.user.create({
              data: {
                email: decoded.email.toLowerCase(),
                name: decoded.email.split("@")[0],
                password: `firebase:${decoded.uid}`,
                profile: { create: { language: "en", timezone: "UTC", niche: "general" } },
                nicheSettings: { create: { niche: "general", targetDuration: 30, captionStyle: "minimal", captionEnabled: true, language: "en" } },
                integrations: { create: [{ provider: "YOUTUBE", status: "DISCONNECTED" }, { provider: "INSTAGRAM", status: "DISCONNECTED" }] },
              },
            });
          }
          // Use Prisma id as canonical uid for Firestore path, to keep users/{prismaId}/jobs consistent with JWT
          // But also support direct Firebase uid — we choose Prisma id if found, else Firebase uid
          return { uid: user.id, email: user.email, name: user.name };
        }
        return { uid: decoded.uid, email: decoded.email || "", name: null };
      }
    }
  }

  // 3) Check Firebase marker cookie + try to get user via prisma from email in cookie? Not needed.
  // Fallback: try to read user from a custom header set by client (not secure, but for mock)
  const fbUid = cookies().get("clipforge_fb_uid")?.value;
  if (fbUid) {
    // This is not secure, but allows local dev without ID token — we verify via email in body
    // We will not trust it for production; throw instead
  }

  throw Object.assign(new Error("Unauthorized: missing session. Please log in via Firebase."), { status: 401 });
}
