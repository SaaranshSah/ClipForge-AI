"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { getFirebaseAuth, getFirebaseAnalytics } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password";
    case "auth/invalid-email":
      return "Enter a valid email";
    case "auth/user-disabled":
      return "This account has been disabled";
    case "auth/too-many-requests":
      return "Too many attempts — try again shortly";
    case "auth/network-request-failed":
      return "Network error — check your connection";
    default:
      return code.replace("auth/", "").replace(/-/g, " ");
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFirebaseAnalytics();
  }, []);

  const persistFbMarker = () => {
    // Marker cookie so middleware knows Firebase is logged in even if httpOnly JWT not yet set
    // This fixes refresh-after-login and prevents incorrect redirect to /login
    document.cookie = "clipforge_fb=1; path=/; max-age=604800; SameSite=Lax";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();

    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const firebaseUser = cred.user;

      // Set marker immediately so middleware allows dashboard even before JWT sync
      persistFbMarker();

      const syncRes = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: firebaseUser.email || trimmedEmail,
          name: firebaseUser.displayName || undefined,
          uid: firebaseUser.uid,
        }),
      });
      const syncData = await syncRes.json().catch(() => ({}));

      if (!syncRes.ok) {
        console.warn("Firebase sync to backend failed:", syncData);
        // With in-memory mock, sync should now succeed even without DB.
        // If it still fails for other reason, still allow Firebase session to proceed
        // but dashboard will rely on fb marker + client sync.
        toast.success("Signed in via Firebase");
        await refresh();
        // Hard navigation ensures middleware sees both cookies
        window.location.href = "/dashboard";
        return;
      }

      toast.success("Welcome back");
      await refresh();
      // Use hard navigation to guarantee cookies are sent on first dashboard request
      window.location.href = "/dashboard";
    } catch (err: any) {
      if (err?.code?.startsWith("auth/")) {
        setError(firebaseErrorMessage(err.code));
        setLoading(false);
      } else {
        // Fallback to legacy backend (pre-Firebase users like demo@clipforge.ai)
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email: trimmedEmail, password }),
          });
          const data = await res.json();
          if (res.ok) {
            // Legacy login sets httpOnly cookie directly; also set fb marker for consistency
            persistFbMarker();
            toast.success("Welcome back");
            await refresh();
            window.location.href = "/dashboard";
            return;
          }
          setError(err.message || data.error || "Login failed");
        } catch {
          setError(err.message || "Login failed");
        }
        setLoading(false);
      }
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your ClipForge workspace — powered by Firebase</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@creator.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <span className="text-xs text-zinc-500">Min 8 chars</span>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pr-10"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                tabIndex={-1}
                aria-label={show ? "Hide password" : "Show password"}
                disabled={loading}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex gap-2 rounded-lg bg-red-950/50 border border-red-900 p-3 text-sm text-red-300" role="alert">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-white text-zinc-900 hover:bg-zinc-100" aria-busy={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-sm text-zinc-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-white hover:underline">
              Sign up
            </Link>
          </p>

          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-500">
            <p className="font-medium text-zinc-400 mb-1">Firebase auth</p>
            <p>Project: <span className="font-mono text-zinc-300">clipforge-ai-910f9</span> — backend session minted via <span className="font-mono">POST /api/auth/firebase</span>.</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
