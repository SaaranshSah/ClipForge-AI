"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getFirebaseAuth } from "@/lib/firebase";
import { Sparkles, Loader2, AlertCircle, CheckCircle2, Clock, Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type Job = {
  jobId: string;
  videoId: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING";
  progress: number;
  attempts: number;
  error?: string | null;
};

export function HighlightsDashboardCard({ videoCount }: { videoCount: number }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [highlightsCount, setHighlightsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const jobRes = await fetch("/api/highlights/jobs", { credentials: "include", headers, cache: "no-store" });
      if (jobRes.ok) {
        const j = await jobRes.json();
        setJobs(j.jobs || []);
      }
      const hlRes = await fetch("/api/highlights", { credentials: "include", headers, cache: "no-store" });
      if (hlRes.ok) {
        const h = await hlRes.json();
        setHighlightsCount(h.count || 0);
      }
      const discRes = await fetch("/api/highlights/discover", { credentials: "include", headers, cache: "no-store" });
      if (discRes.ok) {
        const d = await discRes.json();
        setEligibleCount(d.count ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 10000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleBulkQueue = async () => {
    setDiscovering(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch("/api/highlights/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.queued > 0 ? `Queued ${data.queued} video(s) for AI highlights` : "All eligible videos already queued (idempotent)");
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || "Failed to queue");
    } finally {
      setDiscovering(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-6 flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading AI highlights…
        </CardContent>
      </Card>
    );
  }

  const activeJobs = jobs.filter((j) => ["QUEUED", "PROCESSING", "RETRYING"].includes(j.status));
  const failedJobs = jobs.filter((j) => j.status === "FAILED");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" /> AI Highlights — fpq
          </CardTitle>
          <Badge variant={activeJobs.length > 0 ? "default" : completedJobs.length > 0 ? "success" : "secondary"} className="capitalize">
            {activeJobs.length > 0 ? `${activeJobs.length} processing` : highlightsCount > 0 ? `${highlightsCount} clips ready` : "Idle"}
          </Badge>
        </div>
        <CardDescription>
          Automatic: Video stored → ClipForge <span className="font-mono text-zinc-300">fpq</span> → scoring → highlights → clips in Firebase Storage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className="text-lg font-semibold text-white">{highlightsCount}</div>
            <div className="text-xs text-zinc-500">highlights selected</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className="text-lg font-semibold text-white">{completedJobs.length}</div>
            <div className="text-xs text-zinc-500">videos completed</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className="text-lg font-semibold text-white">{videoCount}</div>
            <div className="text-xs text-zinc-500">videos stored</div>
          </div>
        </div>

        {activeJobs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-violet-400" /> Processing {activeJobs.length} video(s) — ClipForge fpq
            </div>
            {activeJobs.slice(0, 3).map((j) => (
              <div key={j.jobId} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-300 truncate">{j.videoId.slice(0, 12)}…</span>
                  <span className="text-zinc-500">{j.status.toLowerCase()} • {j.progress}%</span>
                </div>
                <Progress value={j.progress} className="mt-2 h-1" />
              </div>
            ))}
            {activeJobs.length > 3 && <p className="text-xs text-zinc-600">+{activeJobs.length - 3} more</p>}
          </div>
        )}

        {failedJobs.length > 0 && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
            <div className="flex items-center gap-2 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" /> {failedJobs.length} failed {failedJobs.length === 1 ? "job" : "jobs"} — will retry up to 3x
            </div>
            <p className="text-xs text-red-400/70 mt-1 truncate">{failedJobs[0].error || "Unknown error"}</p>
          </div>
        )}

        {completedJobs.length > 0 && (
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/10 p-3">
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> {completedJobs.length} video(s) with highlights — clips in <span className="font-mono">users/…/clips/*.mp4</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleBulkQueue} disabled={discovering} className="bg-white text-zinc-900">
            {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Auto-queue eligible ({eligibleCount ?? "…"})
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/library">
              <Play className="h-3.5 w-3.5" /> View highlights in Library
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchAll} className="ml-auto">
            <Clock className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        <p className="text-xs text-zinc-600">
          Storage: <span className="font-mono">users/&#123;uid&#125;/videos/&#123;videoId&#125;/clips/&#123;clipId&#125;.mp4</span> • Firestore: <span className="font-mono">…/highlights/&#123;highlightId&#125;</span> • Idempotent • Job locking • Retry up to 3
        </p>
      </CardContent>
    </Card>
  );
}
