"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getFirebaseAuth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Sparkles, Play, RotateCcw, AlertCircle, CheckCircle2, Clock, Video, Eye, Trophy, Smile, Frown, MessageCircle, Zap, Star } from "lucide-react";
import { formatDuration, timeAgo } from "@/lib/utils";

function verifyCloudinaryVideoUrl(url: string, expectedCloud?: string): { ok: boolean; reason?: string; checks: Record<string, boolean> } {
  const checks: Record<string, boolean> = {};
  try {
    const u = new URL(url);
    checks["URL exists"] = !!url;
    checks["HTTPS"] = u.protocol === "https:";
    checks["Cloudinary domain"] = url.includes("res.cloudinary.com");
    const cloudInUrl = url.match(/res\\.cloudinary\\.com\/([^/]+)\//)?.[1] || "";
    if (expectedCloud) {
      checks["Correct cloud name"] = cloudInUrl === expectedCloud;
      checks["Not demo placeholder"] = cloudInUrl !== "demo" || expectedCloud === "demo";
    } else {
      checks["Correct cloud name"] = !!cloudInUrl;
      checks["Not demo placeholder"] = cloudInUrl !== "demo";
    }
    checks["Resource type video"] = url.includes("/video/upload/");
    checks["Not image/raw"] = !url.includes("/image/upload/") && !url.includes("/raw/upload/");
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    checks["Browser compatible format"] = ["mp4","webm","mov","m4v"].includes(ext);
    checks["Not HTML/JSON"] = !url.includes(".html") && !url.includes(".json");
    checks["Actual uploaded asset"] = !url.includes("storage.mock") && !url.includes("storage.googleapis.com");
    const ok = Object.values(checks).every(v => v);
    const failed = Object.entries(checks).filter(([k,v]) => !v).map(([k]) => k).join(", ");
    return { ok, reason: failed ? `Failed checks: ${failed}` : undefined, checks };
  } catch (e:any) {
    return { ok: false, reason: e.message, checks: { "Valid URL": false } };
  }
}
import { toast } from "sonner";

type Job = {
  jobId: string;
  videoId: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING";
  progress: number;
  attempts: number;
  maxAttempts: number;
  error?: string | null;
  result?: { highlightsCount: number; selectedCount: number; clipIds: string[] } | null;
  createdAt: string;
  updatedAt: string;
};

type Highlight = {
  highlightId: string;
  videoId: string;
  startTime: number;
  endTime: number;
  duration: number;
  highlightType: string;
  score: number;
  confidence: number;
  reason: string;
  signals: Record<string, number>;
  status: string;
  clipId?: string | null;
  clipStoragePath?: string | null;
  clipUrl?: string | null;
  createdAt: string;
};

const TYPE_ICON: Record<string, any> = {
  clutch: Trophy,
  win: Trophy,
  funny: Smile,
  fail: Frown,
  reaction: MessageCircle,
  high_energy_commentary: Zap,
  surprising: Star,
  comeback: Trophy,
  impressive_gameplay: Star,
  story_moment: Video,
};

function typeBadgeVariant(type: string): any {
  if (["clutch", "win", "comeback", "impressive_gameplay"].includes(type)) return "success";
  if (["fail"].includes(type)) return "destructive";
  if (["funny", "reaction", "surprising"].includes(type)) return "warning";
  return "secondary";
}

export function HighlightsPanel({ videoId }: { videoId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<any>(null);
  const [polling, setPolling] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  const [videoLoading, setVideoLoading] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch job for this video
      const jobRes = await fetch(`/api/highlights/jobs?videoId=${encodeURIComponent(videoId)}`, { credentials: "include", headers, cache: "no-store" });
      if (jobRes.ok) {
        const j = await jobRes.json();
        if (j.jobs && j.jobs.length > 0) {
          // Most recent job
          const sorted = j.jobs.sort((a: Job, b: Job) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setJob(sorted[0]);
        } else {
          setJob(null);
        }
      }

      // Fetch highlights
      const hlRes = await fetch(`/api/highlights?videoId=${encodeURIComponent(videoId)}`, { credentials: "include", headers, cache: "no-store" });
      if (hlRes.ok) {
        const h = await hlRes.json();
        setHighlights(h.highlights || []);
      }
    } catch {}
    setLoading(false);
  }, [videoId]);

  const pollJob = useCallback(async () => {
    if (!job) return;
    if (["COMPLETED", "FAILED"].includes(job.status)) return;
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/highlights/jobs/${encodeURIComponent(job.jobId)}`, { credentials: "include", headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        // Also refresh highlights if completed
        if (data.job.status === "COMPLETED") {
          const hlRes = await fetch(`/api/highlights?videoId=${encodeURIComponent(videoId)}`, { credentials: "include", headers, cache: "no-store" });
          if (hlRes.ok) {
            const h = await hlRes.json();
            setHighlights(h.highlights || []);
          }
        }
      }
    } catch {}
  }, [job, videoId]);

  // Auth-ready effect for refresh persistence fix
  useEffect(() => {
    const auth = getFirebaseAuth();
    setAuthLoading(true);
    if (auth.currentUser) {
      setAuthUser(auth.currentUser);
      setAuthLoading(false);
      fetchData();
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthLoading(false);
      if (u) fetchData();
      else setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Also refetch when authUser becomes available if we haven't loaded
  useEffect(() => {
    if (!authLoading && authUser && loading) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser]);

  useEffect(() => {
    if (!polling || !job) return;
    if (["COMPLETED", "FAILED"].includes(job.status)) return;
    const iv = setInterval(pollJob, 4000);
    return () => clearInterval(iv);
  }, [job, polling, pollJob]);

  const handleRetry = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      const res = await fetch(`/api/highlights/jobs/${encodeURIComponent(job.jobId)}/retry`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Retry failed");
      toast.success("Retrying highlights detection");
      setJob(data.job);
    } catch (e: any) {
      toast.error(e.message || "Retry failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoQueue = async () => {
    setActionLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      // Need sourceUrl — fetch video doc first
      const videoRes = await fetch(`/api/cloudinary/videos/${encodeURIComponent(videoId)}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      let sourceUrl = "";
      let filename = `${videoId}.mp4`;
      let duration: number | null = null;
      if (videoRes.ok) {
        const v = await videoRes.json();
        sourceUrl = v.video?.cloudinaryUrl || v.video?.storageUrl || v.video?.sourceUrl || "";
        filename = v.video?.fileName || v.video?.filename || filename;
        duration = v.video?.duration || null;
      }
      // Fallback to Firestore video via highlights discover
      if (!sourceUrl) {
        // try generic
        sourceUrl = `https://storage.mock/${videoId}`;
      }
      const res = await fetch("/api/highlights/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ videoId, sourceUrl, filename, duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to queue");
      toast.success(data.created ? "Highlights job queued (fpq)" : "Job already exists (idempotent)");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to queue");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-6 flex items-center gap-2 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {authLoading ? "Checking authentication…" : "Loading AI highlights…"}
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 border-dashed">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" /> AI Highlights — fpq
          </CardTitle>
          <CardDescription>No highlights job yet for this video. Queue automatically or manually.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">Pipeline: <span className="font-mono">Video stored → ClipForge fpq → scoring → highlights → clips → Cloudinary (video, resource_type video)</span></p>
          <Button onClick={handleAutoQueue} disabled={actionLoading} className="bg-white text-zinc-900 w-full">
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Queue AI Highlights
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isActive = ["QUEUED", "PROCESSING", "RETRYING"].includes(job.status);
  const isFailed = job.status === "FAILED";
  const isCompleted = job.status === "COMPLETED";

  return (
    <div className="space-y-3">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" /> AI Highlights
              <Badge variant={isCompleted ? "success" : isFailed ? "destructive" : job.status === "RETRYING" ? "warning" : "secondary"} className="capitalize">
                {job.status.toLowerCase()}
              </Badge>
            </CardTitle>
            <span className="text-xs text-zinc-500">{job.progress}%</span>
          </div>
          <CardDescription>
            Project <span className="font-mono text-zinc-300">fpq</span> • Job {job.jobId.slice(0, 12)}… • {timeAgo(job.updatedAt)} • Attempts {job.attempts}/{job.maxAttempts}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isActive && <Progress value={job.progress} />}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Clock className="h-3 w-3" /> {job.status === "QUEUED" ? "Queued for AI analysis" : job.status === "RETRYING" ? `Retrying (${job.attempts}/${job.maxAttempts})` : job.status === "PROCESSING" ? "ClipForge analyzing gaming moments..." : isCompleted ? `Completed — ${highlights.length} highlights selected` : `Failed`}
            <span className="ml-auto flex items-center gap-1">{isActive && <Loader2 className="h-3 w-3 animate-spin" />} {polling ? "Polling 4s" : "Paused"}</span>
          </div>
          {job.error && (
            <div className="rounded-lg bg-red-950/40 border border-red-900 p-3 text-sm text-red-300 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">AI Error</p>
                <p className="text-xs text-red-400/80 mt-1">{job.error}</p>
              </div>
            </div>
          )}
          {isCompleted && job.result && (
            <div className="rounded-lg bg-emerald-950/20 border border-emerald-900 p-3 text-sm text-emerald-300">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {job.result.selectedCount} highlights scored & selected from {job.result.highlightsCount} candidates</div>
            </div>
          )}
          <div className="flex gap-2">
            {isFailed && (
              <Button size="sm" onClick={handleRetry} disabled={actionLoading} className="bg-white text-zinc-900">
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry {job.attempts < job.maxAttempts ? "" : "(limit reached)"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setPolling((v) => !v)}>
              {polling ? "Pause polling" : "Resume polling"}
            </Button>
            <Button size="sm" variant="ghost" onClick={fetchData}>
              Refresh
            </Button>
            <span className="ml-auto text-xs text-zinc-600 self-center font-mono">users/&#123;uid&#125;/videos/{videoId}/highlights</span>
          </div>
        </CardContent>
      </Card>

      {highlights.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Highlights — {highlights.length} selected</CardTitle>
              <Badge variant="secondary">{highlights.length} clips → Cloudinary (video)</Badge>
            </div>
            <CardDescription>Scored by action, audio, emotion, event importance, context, uniqueness, viewer interest</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {highlights.map((h) => {
              const Icon = TYPE_ICON[h.highlightType] || Video;
              const isPreview = previewId === h.highlightId;
              return (
                <div key={h.highlightId} className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                  <div className="p-3 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-violet-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={typeBadgeVariant(h.highlightType) as any} className="capitalize text-xs">{h.highlightType.replace(/_/g, " ")}</Badge>
                        <Badge variant="secondary" className="text-xs">Score {h.score}/100</Badge>
                        <span className="text-xs text-zinc-500">Conf {Math.round(h.confidence * 100)}%</span>
                        <span className="text-xs text-zinc-600">{formatDuration(h.startTime)}–{formatDuration(h.endTime)} ({formatDuration(h.duration)})</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{h.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(h.signals).map(([k, v]) => (
                          <span key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        {h.clipUrl ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPreviewId(isPreview ? null : h.highlightId)}>
                            {isPreview ? <Eye className="h-3 w-3" /> : <Play className="h-3 w-3" />} {isPreview ? "Close" : "Preview clip"}
                          </Button>
                        ) : (
                          <span className="text-xs text-zinc-600 flex items-center gap-1"><Clock className="h-3 w-3" /> Clip generating…</span>
                        )}
                        <span className="text-xs text-zinc-600 self-center font-mono">clips/{h.clipId}.mp4</span>
                      </div>
                      {isPreview && h.clipUrl && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-zinc-800 bg-black relative">
                          {videoLoading[h.highlightId] && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs gap-1 z-10">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading clip...
                            </div>
                          )}
                          {videoErrors[h.highlightId] ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-red-300 text-xs p-3 text-center gap-1 z-10">
                              <AlertCircle className="h-4 w-4" />
                              <span>Preview failed: {videoErrors[h.highlightId]}</span>
                              <span className="text-[10px] text-zinc-400 break-all">{h.clipUrl.slice(0,120)}</span>
                              <span className="text-[10px] text-zinc-500">Resource: video • Format: mp4 • Try retry or check Cloudinary URL</span>
                              <div className="flex gap-1 mt-1">
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={()=>{setVideoErrors(prev=>({...prev, [h.highlightId]: ''})); setPreviewId(null); setTimeout(()=>setPreviewId(h.highlightId), 50);}}>Retry</Button>
                                <a href={h.clipUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] underline text-zinc-400">Open URL</a>
                              </div>
                            </div>
                          ) : null}
                          <video
                            src={h.clipUrl}
                            controls
                            controlsList="nodownload"
                            preload="metadata"
                            playsInline
                            crossOrigin="anonymous"
                            className="w-full max-h-64 object-contain"
                            onLoadStart={() => setVideoLoading(prev=>({...prev, [h.highlightId]: true}))}
                            onLoadedData={() => setVideoLoading(prev=>({...prev, [h.highlightId]: false}))}
                            onCanPlay={() => setVideoLoading(prev=>({...prev, [h.highlightId]: false}))}
                            onError={async (e)=> {
                              const el = e.currentTarget;
                              let msg = "Media error";
                              if (el.error) msg = `${el.error.message || 'Error'} (code ${el.error.code})`;
                              console.warn(`[HighlightsPanel] video error ${h.highlightId}`, msg, h.clipUrl);
                              const cloudName = (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "")) || "";
                              const verify = verifyCloudinaryVideoUrl(h.clipUrl || "", cloudName);
                              let debug = "";
                              if (el.error?.code === 4) {
                                debug = ` — Format error code 4: ${verify.reason || 'unknown'}. Checks: ${JSON.stringify(verify.checks)}`;
                                try {
                                  const head = h.clipUrl ? await fetch(h.clipUrl, { method: "HEAD" }) : null;
                                  if (head) {
                                    const ct = head.headers.get("content-type") || "(none)";
                                    debug += ` | HTTP ${head.status} Content-Type: ${ct} ${head.ok ? "(OK)" : "(FAIL)"} — ${ct.startsWith("video/") ? "is video" : "NOT video (maybe HTML/JSON 404 or wrong resource_type)"}`;
                                    if (!head.ok) debug += " — URL 404, resource not in Cloudinary (cloudName maybe demo/placeholder) or not uploaded as video";
                                    if (ct.includes("text/html") || ct.includes("application/json")) debug += " — Browser received HTML/JSON not video (check Cloudinary URL, cloudName, public_id, resource_type)";
                                  }
                                } catch (err:any) {
                                  debug += ` | HEAD failed: ${err.message}`;
                                }
                              }
                              setVideoLoading(prev=>({...prev, [h.highlightId]: false}));
                              setVideoErrors(prev=>({...prev, [h.highlightId]: msg + debug}));
                            }}
                          >
                            Your browser does not support the video tag.
                          </video>
                          <div className="p-2 text-xs text-zinc-500 font-mono truncate flex justify-between">
                            <span>{h.clipStoragePath}</span>
                            <span className="text-zinc-600">Cloudinary video • {h.clipUrl.includes('cloudinary') ? 'cloudinary' : 'other'}</span>
                          </div>
                          <div className="px-2 pb-2 text-[11px] text-zinc-600">
                            MIME: video/mp4 • Controls: play/pause, seek, volume, fullscreen • No image URL
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {isCompleted && highlights.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800 border-dashed">
          <CardContent className="p-6 text-center">
            <Sparkles className="h-6 w-6 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm font-medium">No highlights selected</p>
            <p className="text-xs text-zinc-500 mt-1">ClipForge returned no candidates above threshold. Try a longer or more action-packed video.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
