"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, AlertCircle, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { getFirebaseAuth, getFirebaseAnalytics } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

function PasswordChecks({ password }: { password: string }) {
  const checks = useMemo(
    () => [
      { label: "At least 8 characters", ok: password.length >= 8 },
      { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
      { label: "Lowercase letter", ok: /[a-z]/.test(password) },
      { label: "Number", ok: /[0-9]/.test(password) },
    ],
    [password]
  );
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-1 text-xs ${c.ok ? "text-emerald-400" : "text-zinc-500"}`}>
          {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {c.label}
        </li>
      ))}
    </ul>
  );
}

function firebaseSignupError(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "Email already in use";
    case "auth/invalid-email":
      return "Enter a valid email";
    case "auth/weak-password":
      return "Password too weak — use at least 8 chars with upper, lower and number";
    case "auth/network-request-failed":
      return "Network error — check your connection";
    default:
      return code.replace("auth/", "").replace(/-/g, " ");
  }
}

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFirebaseAnalytics();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    try {
      // 1) Create Firebase user (email/password must be enabled in Firebase Console)
      const auth = getFirebaseAuth();
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      if (trimmedName) {
        try {
          await updateProfile(cred.user, { displayName: trimmedName });
        } catch {}
      }

      // 2) Sync to backend → Prisma + httpOnly JWT
      const syncRes = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cred.user.email || trimmedEmail,
          name: trimmedName || cred.user.displayName || undefined,
          uid: cred.user.uid,
        }),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) {
        console.warn("Firebase sync failed:", syncData);
        if (syncData.error?.includes("DATABASE_URL")) {
          toast.success("Account created in Firebase (backend DB not configured)");
          await refresh();
          router.push("/dashboard");
          router.refresh();
          return;
        }
        throw new Error(syncData.error || "Failed to create session");
      }

      toast.success("Account created");
      await refresh();
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      if (err?.code?.startsWith("auth/")) {
        setError(firebaseSignupError(err.code));
      } else {
        // Fallback to legacy backend signup for preview without Firebase
        try {
          const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmedName || undefined, email: trimmedEmail, password }),
          });
          const data = await res.json();
          if (res.ok) {
            toast.success("Account created");
            await refresh();
            router.push("/dashboard");
            router.refresh();
            return;
          }
          setError(err.message || data.error || "Signup failed");
        } catch {
          setError(err.message || "Signup failed");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Start forging clips — no credit card required</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name <span className="text-zinc-500 font-normal">(optional)</span></Label>
            <Input id="name" placeholder="Alex Creator" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@creator.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && <PasswordChecks password={password} />}
          </div>

          {error && (
            <div className="flex gap-2 rounded-lg bg-red-950/50 border border-red-900 p-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-white text-zinc-900 hover:bg-zinc-100">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-xs text-zinc-500 text-center leading-relaxed">
            By signing up you agree to our Terms and Privacy Policy. Firebase creates your auth user; we mirror it to Postgres for dashboard data.
          </p>
          <p className="text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-white hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
