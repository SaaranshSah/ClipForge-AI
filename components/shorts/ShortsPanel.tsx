"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getFirebaseAuth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Sparkles, Play, RotateCcw, AlertCircle, CheckCircle2, Clock, Video, Eye, Film, Type, Zap, Scissors, ShieldCheck } from "lucide-react";
import { formatDuration, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type Short = {
  shortId: string;
  sourceVideoId: string;
  sourceClipId: string;
  sourceHighlightId: string;
  status: string;
  progress: number;
  title: string;
  description: string;
  hashtags: string[];
  keywords?: string[];
  storagePath: string;
  shortUrl?: string | null;
  thumbnailPath?: string | null;
  thumbnailUrl?: string | null;
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  captionStyle: string;
  captions?: Array<{ text: string; start: number; end: number; isEmphasis?: boolean }>;
  captionsVtt?: string | null;
  editing?: any;
  qualityChecks?: any;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  error?: string | null;
};

export function ShortsPanel({ videoId }: { videoId: string }) {
  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  const [videoLoading, setVideoLoading] = useState<Record<string, boolean>>({});

  const fetchShorts = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/shorts?videoId=${encodeURIComponent(videoId)}`, { credentials: "include", headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setShorts(data.shorts || []);
      }
    } catch {}
    setLoading(false);
  }, [videoId]);

  const pollShorts = useCallback(async () => {
    for (const s of shorts) {
      if (["COMPLETED", "FAILED"].includes(s.status)) continue;
      try {
        const auth = getFirebaseAuth();
        const user = authUser || auth.currentUser;
        const token = await user?.getIdToken().catch(() => null);
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/shorts/${encodeURIComponent(s.shortId)}?videoId=${encodeURIComponent(videoId)}`, { credentials: "include", headers, cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setShorts((prev) => prev.map((p) => (p.shortId === s.shortId ? data.short : p)));
        }
      } catch {}
    }
  }, [shorts, videoId]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    setAuthLoading(true);
    if (auth.currentUser) {
      setAuthUser(auth.currentUser);
      setAuthLoading(false);
      fetchShorts();
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthLoading(false);
      if (u) fetchShorts();
      else setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (!authLoading && authUser && loading) fetchShorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser]);

  useEffect(() => {
    const hasActive = shorts.some((s) => !["COMPLETED", "FAILED"].includes(s.status));
    if (!hasActive) return;
    const iv = setInterval(pollShorts, 4000);
    return () => clearInterval(iv);
  }, [shorts, pollShorts]);

  const handleAuto = async (style: string = "Clean") => {
    setActionLoading("auto");
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      const res = await fetch("/api/shorts/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ videoId, captionStyle: style }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to queue short");
      toast.success(data.created ? `Short queued (${style}) — 1080x1920` : `Short already exists (${style})`);
      fetchShorts();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (short: Short) => {
    setActionLoading(short.shortId);
    try {
      const auth = getFirebaseAuth();
      const user = authUser || auth.currentUser;
      const token = await user?.getIdToken().catch(() => null);
      const res = await fetch(`/api/shorts/${encodeURIComponent(short.shortId)}/retry?videoId=${encodeURIComponent(videoId)}`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Retry failed");
      toast.success("Retrying short");
      fetchShorts();
    } catch (e: any) {
      toast.error(e.message || "Retry failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || authLoading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-6 flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> {authLoading ? "Checking authentication…" : "Loading Shorts…"}
        </CardContent>
      </Card>
    );
  }

  if (shorts.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 border-dashed">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Film className="h-4 w-4 text-pink-400" /> YouTube Shorts & Reels — V4
          </CardTitle>
          <CardDescription>Auto-converts best highlight → 9:16 vertical 1080×1920, smart crop, captions, audio, thumbnail, quality check</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500 font-mono">users/&#123;uid&#125;/videos/{videoId}/shorts/&#123;shortId&#125;.mp4 + .jpg thumbnail</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {["Clean", "Bold", "Gaming", "Minimal"].map((style) => (
              <Button key={style} size="sm" variant="outline" onClick={() => handleAuto(style)} disabled={!!actionLoading} className="text-xs">
                {actionLoading === "auto" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Type className="h-3 w-3" />} {style}
              </Button>
            ))}
          </div>
          <Button onClick={() => handleAuto("Clean")} disabled={!!actionLoading} className="w-full bg-white text-zinc-900">
            {actionLoading === "auto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Auto-create Short (Clean) — best highlight
          </Button>
          <p className="text-xs text-zinc-600">Captions: synchronized, safe areas, readable sizing, emphasis on important moments. Editing: smart zoom, crop, cuts, transitions, audio normalized. Metadata auto-generated (no virality claims).</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Film className="h-4 w-4 text-pink-400" /> Shorts — {shorts.length} {shorts.length === 1 ? "finished Short" : "Shorts"}
        </h3>
        <Button size="sm" variant="ghost" onClick={fetchShorts}>
          Refresh
        </Button>
      </div>
      {shorts.map((s) => {
        const isActive = ["QUEUED", "PROCESSING", "EDITING", "CAPTIONING", "QUALITY_CHECK", "RETRYING"].includes(s.status);
        const isFailed = s.status === "FAILED";
        const isCompleted = s.status === "COMPLETED";
        const qualityPassed = s.qualityChecks?.passed;
        return (
          <Card key={s.shortId} className="bg-zinc-900 border-zinc-800 overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm truncate flex items-center gap-2">
                    {s.title}
                    <Badge variant={isCompleted ? "success" : isFailed ? "destructive" : s.status === "RETRYING" ? "warning" : "secondary"} className="capitalize shrink-0">
                      {s.status.toLowerCase()}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="truncate">{s.description}</CardDescription>
                </div>
                <span className="text-xs text-zinc-500 shrink-0">{s.progress}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="secondary" className="text-xs">9:16 {s.width}×{s.height}</Badge>
                <Badge variant="outline" className="text-xs">{s.captionStyle}</Badge>
                <Badge variant="outline" className="text-xs">{formatDuration(s.duration)}</Badge>
                {s.hashtags?.slice(0, 3).map((h) => (
                  <Badge key={h} variant="secondary" className="text-xs">
                    {h}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isActive && <Progress value={s.progress} />}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Clock className="h-3 w-3" /> {s.status === "QUEUED" ? "Queued — vertical conversion next" : s.status === "EDITING" ? "Smart crop 1080×1920, avoid black bars, preserve gameplay…" : s.status === "CAPTIONING" ? `Captioning (${s.captionStyle}) — synchronized, safe areas…` : s.status === "QUALITY_CHECK" ? "Quality check — aspect, duration, audio, captions…" : isCompleted ? `Ready — ${s.duration}s • ${s.aspectRatio}` : s.status.toLowerCase()}
                <span className="ml-auto flex items-center gap-1">{isActive && <Loader2 className="h-3 w-3 animate-spin" />} {timeAgo(s.updatedAt)}</span>
              </div>

              {/* Editing & caption details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
                  <div className="font-medium flex items-center gap-1">
                    <Scissors className="h-3 w-3" /> Editing
                  </div>
                  <div className="text-zinc-500 mt-1 space-y-0.5">
                    <div>Smart crop: {s.editing?.smartCrop ? "yes" : "no"} • {s.editing?.cropFocus || "center gameplay"}</div>
                    <div>Zoom: {s.editing?.smartZoom ? "1.08x" : "1.0x"} • {s.editing?.transitions || "cut"}</div>
                    <div>Audio: {s.editing?.audioNormalized ? "normalized -14 LUFS" : "raw"} • speech clear</div>
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
                  <div className="font-medium flex items-center gap-1">
                    <Type className="h-3 w-3" /> Captions — {s.captionStyle}
                  </div>
                  <div className="text-zinc-500 mt-1">
                    {s.captions?.length || 0} cues • {s.captions?.filter((c) => c.isEmphasis).length || 0} emphasized
                    <div className="truncate mt-1">{s.captions?.slice(0, 2).map((c) => c.text).join(" • ") || "generating…"}</div>
                  </div>
                </div>
              </div>

              {/* Quality checks */}
              {s.qualityChecks && (
                <div className={`rounded-lg border p-2 ${s.qualityChecks.passed ? "bg-emerald-950/10 border-emerald-900" : "bg-red-950/10 border-red-900"}`}>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <ShieldCheck className={`h-3.5 w-3.5 ${s.qualityChecks.passed ? "text-emerald-400" : "text-red-400"}`} /> Quality {s.qualityChecks.passed ? "passed" : "failed"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(s.qualityChecks)
                      .filter(([k]) => k !== "passed" && k !== "checkedAt")
                      .map(([k, v]) => (
                        <Badge key={k} variant={v ? "success" : "destructive"} className="text-[10px] capitalize">
                          {k.replace(/([A-Z])/g, " $1")}: {v ? "✓" : "✗"}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {s.error && (
                <div className="rounded-lg bg-red-950/20 border border-red-900 p-2 text-xs text-red-300 flex gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {s.error}
                </div>
              )}
              {isCompleted && (
                <div className="rounded-lg bg-emerald-950/10 border border-emerald-900 p-2 text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Short ready — 1080×1920 9:16, captions synchronized, audio normalized, no black frames
                </div>
              )}

              <div className="flex gap-2">
                {isFailed && (
                  <Button size="sm" onClick={() => handleRetry(s)} disabled={!!actionLoading} className="bg-white text-zinc-900">
                    {actionLoading === s.shortId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Retry
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setPreviewId(previewId === s.shortId ? null : s.shortId)}>
                  {previewId === s.shortId ? <Eye className="h-3 w-3" /> : <Play className="h-3 w-3" />} {previewId === s.shortId ? "Close" : "Preview Short"}
                </Button>
                {s.thumbnailUrl && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={s.thumbnailUrl} target="_blank" rel="noreferrer">
                      <Eye className="h-3 w-3" /> Thumbnail
                    </a>
                  </Button>
                )}
                <span className="ml-auto text-[10px] font-mono text-zinc-600 self-center truncate">{s.storagePath}</span>
              </div>

              {previewId === s.shortId && s.shortUrl && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 rounded-lg overflow-hidden border border-zinc-800 bg-black aspect-[9/16] max-h-[420px] mx-auto relative">
                    {videoLoading[s.shortId] && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs gap-1 z-10">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading short...
                      </div>
                    )}
                    {videoErrors[s.shortId] ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-red-300 text-xs p-3 text-center gap-1 z-10">
                        <AlertCircle className="h-4 w-4" />
                        <span>Preview failed: {videoErrors[s.shortId]}</span>
                        <span className="text-[10px] text-zinc-400 break-all">{s.shortUrl.slice(0,120)}</span>
                        <span className="text-[10px] text-zinc-500">9:16 vertical • Cloudinary video • resource_type video</span>
                        <div className="flex gap-1 mt-1">
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={()=>{setVideoErrors(prev=>({...prev, [s.shortId]: ''})); setPreviewId(null); setTimeout(()=>setPreviewId(s.shortId), 50);}}>Retry</Button>
                          <a href={s.shortUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] underline text-zinc-400">Open URL</a>
                        </div>
                      </div>
                    ) : null}
                    <video
                      src={s.shortUrl}
                      controls
                      controlsList="nodownload"
                      preload="metadata"
                      playsInline
                      crossOrigin="anonymous"
                      className="w-full h-full object-contain bg-black"
                      onLoadStart={() => setVideoLoading(prev=>({...prev, [s.shortId]: true}))}
                      onLoadedData={() => setVideoLoading(prev=>({...prev, [s.shortId]: false}))}
                      onCanPlay={() => setVideoLoading(prev=>({...prev, [s.shortId]: false}))}
                      onError={(e)=> {
                        const el = e.currentTarget;
                        let msg = "Media error";
                        if (el.error) msg = `${el.error.message || 'Error'} (code ${el.error.code})`;
                        console.warn(`[ShortsPanel] video error ${s.shortId}`, msg, s.shortUrl);
                        setVideoLoading(prev=>({...prev, [s.shortId]: false}));
                        setVideoErrors(prev=>({...prev, [s.shortId]: msg}));
                      }}
                    />
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">9:16 • 1080×1920 • Cloudinary</div>
                  </div>
                  <div className="space-y-2">
                    {s.thumbnailUrl && (
                      <div className="rounded-lg overflow-hidden border border-zinc-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.thumbnailUrl} alt="thumbnail" className="w-full aspect-[9/16] object-cover" />
                        <div className="p-1 text-[10px] font-mono text-zinc-500 truncate">{s.thumbnailPath}</div>
                      </div>
                    )}
                    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-xs">
                      <div className="font-medium">Metadata</div>
                      <div className="text-zinc-500 mt-1">Title: {s.title}</div>
                      <div className="text-zinc-500 truncate">Hashtags: {s.hashtags.join(" ")}</div>
                      <div className="text-zinc-500">Keywords: {s.keywords?.join(", ")}</div>
                      <div className="text-zinc-500 mt-1">Source highlight {s.sourceHighlightId} (clip {s.sourceClipId})</div>
                    </div>
                    {s.captionsVtt && (
                      <details className="rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-xs">
                        <summary className="cursor-pointer">Captions VTT ({s.captionStyle})</summary>
                        <pre className="mt-1 text-[10px] whitespace-pre-wrap max-h-32 overflow-auto">{s.captionsVtt.slice(0, 600)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              )}
              {!s.shortUrl && isCompleted && (
                <div className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Video file missing — quality check flagged noMissingFiles
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => handleAuto("Clean")}>
          <Sparkles className="h-3 w-3" /> Clean
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleAuto("Bold")}>
          <Type className="h-3 w-3" /> Bold
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleAuto("Gaming")}>
          <Zap className="h-3 w-3" /> Gaming
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleAuto("Minimal")}>
          <Film className="h-3 w-3" /> Minimal
        </Button>
      </div>
    </div>
  );
}
