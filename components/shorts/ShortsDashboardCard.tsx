"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getFirebaseAuth } from "@/lib/firebase";
import { Film, Loader2, AlertCircle, CheckCircle2, Clock, Sparkles, Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type Short = {
  shortId: string;
  videoId?: string;
  sourceVideoId: string;
  status: string;
  progress: number;
  title?: string;
  captionStyle?: string;
};

export function ShortsDashboardCard({ videoCount }: { videoCount: number }) {
  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/shorts", { credentials: "include", headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setShorts(data.shorts || []);
      }
      const disc = await fetch("/api/shorts/discover", { credentials: "include", headers, cache: "no-store" });
      if (disc.ok) {
        const d = await disc.json();
        setEligibleCount(d.count ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 12000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleBulk = async () => {
    setDiscovering(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch("/api/shorts/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ limit: 5, captionStyle: "Clean", maxPerVideo: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.queued > 0 ? `Queued ${data.queued} Short(s) — best highlights → 1080x1920` : "All eligible highlights already have Shorts (idempotent)");
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setDiscovering(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-6 flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Shorts…
        </CardContent>
      </Card>
    );
  }

  const active = shorts.filter((s) => ["QUEUED", "PROCESSING", "EDITING", "CAPTIONING", "QUALITY_CHECK", "RETRYING"].includes(s.status));
  const failed = shorts.filter((s) => s.status === "FAILED");
  const completed = shorts.filter((s) => s.status === "COMPLETED");

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Film className="h-4 w-4 text-pink-400" /> YouTube Shorts & Reels — V4
          </CardTitle>
          <Badge variant={active.length > 0 ? "default" : completed.length > 0 ? "success" : "secondary"} className="capitalize">
            {active.length > 0 ? `${active.length} processing` : completed.length > 0 ? `${completed.length} ready` : "Idle"}
          </Badge>
        </div>
        <CardDescription>
          AI highlight → best clip → 1080×1920 vertical, smart crop, captions (Clean/Bold/Gaming/Minimal), audio normalize, thumbnail, quality check
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className="text-lg font-semibold text-white">{completed.length}</div>
            <div className="text-xs text-zinc-500">Shorts ready</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className="text-lg font-semibold text-white">{shorts.length}</div>
            <div className="text-xs text-zinc-500">total Shorts</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className="text-lg font-semibold text-white">{videoCount}</div>
            <div className="text-xs text-zinc-500">videos</div>
          </div>
        </div>

        {active.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-pink-400" /> Processing {active.length} Short(s) — vertical 1080×1920
            </div>
            {active.slice(0, 3).map((s) => (
              <div key={s.shortId} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[60%]">{s.title || s.shortId.slice(0, 12)}</span>
                  <span className="text-zinc-500">{s.status.toLowerCase()} • {s.progress}% • {s.captionStyle}</span>
                </div>
                <Progress value={s.progress} className="mt-2 h-1" />
              </div>
            ))}
          </div>
        )}

        {failed.length > 0 && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-2 text-xs text-red-300 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {failed.length} failed — will retry up to 3×
          </div>
        )}

        {completed.length > 0 && (
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/10 p-2 text-xs text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> {completed.length} Short(s) ready — 9:16 1080×1920, captions synchronized, audio normalized, thumbnails at `shorts/*.jpg`
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleBulk} disabled={discovering} className="bg-white text-zinc-900">
            {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Auto-queue best highlights ({eligibleCount ?? "…"})
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/library">
              <Play className="h-3.5 w-3.5" /> View in Library
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchAll} className="ml-auto">
            <Clock className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        <p className="text-xs text-zinc-600">
          Storage: <span className="font-mono">users/&#123;uid&#125;/videos/&#123;videoId&#125;/shorts/&#123;shortId&#125;.mp4 + .jpg</span> • Firestore: <span className="font-mono">…/shorts/&#123;shortId&#125;</span> • Captions: Clean/Bold/Gaming/Minimal (safe areas) • Quality: 8 checks before ready
        </p>
      </CardContent>
    </Card>
  );
}
