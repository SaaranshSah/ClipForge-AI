"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";
import { Loader2, RefreshCw, XCircle, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { timeAgo } from "@/lib/utils";

type Job = {
  id?: string;
  clipforgeJobId: string;
  project: string;
  sourceVideoId: string;
  status: "queued" | "uploading" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  filename?: string;
  progress?: number;
  resultUrl?: string | null;
  clipStoragePath?: string | null;
};

function statusColor(s: Job["status"]) {
  switch (s) {
    case "completed": return "success";
    case "failed": return "destructive";
    case "cancelled": return "muted";
    case "processing": return "warning";
    case "uploading":
    case "queued": return "secondary";
    default: return "secondary";
  }
}

export function ClipForgeJobs({ refreshKey }: { refreshKey?: number }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      const headers: Record<string, string> = {};
      if (user) {
        try {
          const token = await user.getIdToken();
          headers["Authorization"] = `Bearer ${token}`;
        } catch {}
      }
      const res = await fetch("/api/clipforge/jobs", { cache: "no-store", credentials: "include", headers });
      if (!res.ok) {
        if (res.status === 401) {
          setJobs([]);
          return;
        }
        throw new Error("Failed to load");
      }
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      const headers: Record<string, string> = {};
      if (user) {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/clipforge/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store", credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setJobs((prev) => prev.map((j) => (j.clipforgeJobId === jobId ? { ...j, ...data.job } : j)));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  // Poll every 5s for jobs that are not terminal (queued/uploading/processing)
  useEffect(() => {
    if (!polling) return;
    const active = jobs.filter((j) => ["queued", "uploading", "processing"].includes(j.status));
    if (active.length === 0) return;
    const iv = setInterval(() => {
      active.forEach((j) => pollJob(j.clipforgeJobId));
    }, 5000);
    return () => clearInterval(iv);
  }, [jobs, polling, pollJob]);

  const handleRetry = async (jobId: string) => {
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/clipforge/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Retry failed");
      toast.success("Retrying job");
      fetchJobs();
    } catch (e: any) {
      toast.error(e.message || "Retry failed");
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/clipforge/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      toast.success("Job cancelled");
      fetchJobs();
    } catch (e: any) {
      toast.error(e.message || "Cancel failed");
    }
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-6 flex items-center gap-2 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading ClipForge jobs…
        </CardContent>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 border-dashed">
        <CardContent className="p-6 text-center">
          <Clock className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
          <p className="text-sm font-medium">No ClipForge jobs yet</p>
          <p className="text-xs text-zinc-500 mt-1">Upload a video above to create a job in project <span className="font-mono text-zinc-300">fpq</span>. Status will appear here: queued → uploading → processing → completed/failed.</p>
          <p className="text-xs text-zinc-600 mt-2">Path: <span className="font-mono">users/&#123;uid&#125;/jobs/&#123;jobId&#125;</span> • Clips: <span className="font-mono">users/&#123;uid&#125;/videos/.../clips/...</span></p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">ClipForge Jobs — project fpq</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => fetchJobs()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button variant="ghost" size="sm" onClick={() => setPolling((v) => !v)} className={polling ? "text-emerald-400" : ""}>
            {polling ? "Polling on" : "Polling paused"}
          </Button>
        </div>
      </div>

      {jobs.map((job) => (
        <Card key={job.clipforgeJobId} className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm truncate">{job.filename || job.sourceVideoId}</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">Job {job.clipforgeJobId} • {timeAgo(job.createdAt)} • <span className="font-mono">{job.sourceVideoId}</span></p>
              </div>
              <Badge variant={statusColor(job.status) as any} className="capitalize shrink-0">{job.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Project</span> <Badge variant="secondary">fpq</Badge>
              <span className="text-zinc-500 ml-2">Provider</span> <span className="text-zinc-300">clipforge</span>
              {job.progress != null && <span className="ml-auto text-zinc-500">{job.progress}%</span>}
            </div>
            {job.progress != null && ["queued", "uploading", "processing"].includes(job.status) && <Progress value={job.progress} />}

            {job.status === "failed" && job.error && (
              <div className="rounded-lg bg-red-950/40 border border-red-900 p-3 text-sm text-red-300 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{job.error}</span>
              </div>
            )}

            {job.status === "completed" && job.resultUrl && (
              <div className="rounded-lg bg-emerald-950/20 border border-emerald-900 p-3 text-sm text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Completed
                  <a href={job.resultUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs underline">
                    View clip <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {job.clipStoragePath && <p className="text-xs text-emerald-400/60 mt-1 font-mono">{job.clipStoragePath}</p>}
              </div>
            )}

            <div className="flex gap-2">
              {job.status === "failed" && (
                <Button size="sm" className="bg-white text-zinc-900" onClick={() => handleRetry(job.clipforgeJobId)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              )}
              {["queued", "uploading", "processing"].includes(job.status) && (
                <Button size="sm" variant="outline" onClick={() => handleCancel(job.clipforgeJobId)}>
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => pollJob(job.clipforgeJobId)}>
                Check status
              </Button>
              <span className="ml-auto text-xs text-zinc-600 self-center">users/&#123;uid&#125;/jobs/{job.clipforgeJobId}</span>
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-zinc-600">Polling every 5s stops automatically when jobs are completed/failed/cancelled. Webhook at <span className="font-mono">/api/clipforge/webhook</span> also updates Firestore idempotently.</p>
    </div>
  );
}
