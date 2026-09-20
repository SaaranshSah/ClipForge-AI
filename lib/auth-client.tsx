"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

type User = {
  id: string;
  email: string;
  name?: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial refresh
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Firebase auth state listener — keeps session in sync across refresh & tabs
  // If Firebase says we're logged in but JWT cookie is missing (e.g., after DB reset),
  // we silently re-mint the JWT via /api/auth/firebase so middleware won't bounce to /login.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { getFirebaseAuth } = await import("@/lib/firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        const auth = getFirebaseAuth();
        unsub = onAuthStateChanged(auth, async (fbUser) => {
          if (fbUser) {
            // Check if we already have a valid JWT session
            try {
              const me = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
              if (me.ok) {
                const data = await me.json();
                if (data.user) {
                  setUser(data.user);
                  setLoading(false);
                  return;
                }
              }
            } catch {}

            // No JWT but Firebase is authenticated → re-sync (once)
            if (syncingRef.current) return;
            syncingRef.current = true;
            try {
              const sync = await fetch("/api/auth/firebase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  email: fbUser.email,
                  name: fbUser.displayName || undefined,
                  uid: fbUser.uid,
                }),
              });
              if (sync.ok) {
                const data = await sync.json();
                setUser(data.user);
              }
            } catch {}
            syncingRef.current = false;
            setLoading(false);
          } else {
            // Firebase signed out — ensure JWT side is cleared, but don't force navigation here
            // (middleware will handle protected routes)
            // We keep current user as is until refresh confirms; if on protected page middleware redirects
          }
        });
      } catch {
        // Firebase not available — ignore
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const logout = async () => {
    setLoading(true);
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const { signOut } = await import("firebase/auth");
      try {
        await signOut(getFirebaseAuth());
      } catch {}
    } catch {}
    try {
      // Clear Firebase marker cookie client-side immediately
      document.cookie = "clipforge_fb=; path=/; max-age=0; SameSite=Lax";
    } catch {}
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    setLoading(false);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
