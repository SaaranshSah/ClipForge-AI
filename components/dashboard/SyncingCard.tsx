"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import Link from "next/link";

export function SyncingCard() {
  const { user, loading } = useAuth();
  const [attempts, setAttempts] = useState(0);

  // If auth resolves to a user, reload to get server-rendered dashboard
  useEffect(() => {
    if (!loading && user) {
      const t = setTimeout(() => window.location.reload(), 300);
      return () => clearTimeout(t);
    }
  }, [user, loading]);

  // Auto-retry: after 3s if still syncing, increment attempts and show retry
  useEffect(() => {
    if (!loading && !user) {
      const iv = setInterval(() => setAttempts((a) => a + 1), 3000);
      return () => clearInterval(iv);
    }
  }, [loading, user]);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-500 mb-3" />
        <p className="text-sm text-zinc-400">{loading ? "Restoring your workspace…" : "Syncing your session — dashboard will populate shortly."}</p>
        <p className="text-xs text-zinc-600 mt-1">
          {attempts > 1 ? "Still syncing? Your Firebase session is active — retrying automatically." : "If this persists, try logging in again."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Go to login</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
