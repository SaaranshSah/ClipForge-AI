import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  await clearAuthCookie();
  // Also clear Firebase marker cookie so middleware doesn't let stale Firebase sessions through
  try {
    cookies().set("clipforge_fb", "", { maxAge: 0, path: "/" });
  } catch {}
  const res = NextResponse.json({ ok: true });
  res.cookies.set("clipforge_fb", "", { maxAge: 0, path: "/" });
  return res;
}
