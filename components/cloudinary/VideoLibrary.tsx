"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase";
import { formatBytes, timeAgo, formatDuration } from "@/lib/utils";
import { Trash2, Play, Eye, Loader2, Search, RefreshCw, Video, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { HighlightsPanel } from "@/components/highlights/HighlightsPanel";
import { ShortsPanel } from "@/components/shorts/ShortsPanel";
import { Sparkles, Film as FilmIcon } from "lucide-react";

type VideoDoc = {
  videoId: string;
  fileName: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  resourceType: string;
  format: string;
  fileSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  status: string;
  processingStatus?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
  error?: string;
};

type HlSummary = {
  videoId: string;
  count: number;
  jobStatus?: string;
  jobProgress?: number;
};

export function VideoLibrary({ refreshKey }: { refreshKey?: number }) {
  const [videos, setVideos] = useState<VideoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expandedHl, setExpandedHl] = useState<string | null>(null);
  const [hlSummary, setHlSummary] = useState<Record<string, HlSummary>>({});
  const [shortsSummary, setShortsSummary] = useState<Record<string, { count: number; status?: string; progress?: number }>>({});

  const fetchHighlightsSummary = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      const headers: Record<string, string> = {};
      if (user) {
        try { const token = await user.getIdToken(); headers["Authorization"] = `Bearer ${token}`; } catch {}
      }
      const [hlRes, jobRes, shortRes] = await Promise.all([
        fetch("/api/highlights", { credentials: "include", headers, cache: "no-store" }),
        fetch("/api/highlights/jobs", { credentials: "include", headers, cache: "no-store" }),
        fetch("/api/shorts", { credentials: "include", headers, cache: "no-store" }),
      ]);
      const hlMap: Record<string, HlSummary> = {};
      if (hlRes.ok) {
        const hlData = await hlRes.json();
        const byVideo: Record<string, number> = {};
        (hlData.highlights || []).forEach((h: any) => {
          const vid = h.videoId;
          byVideo[vid] = (byVideo[vid] || 0) + 1;
        });
        Object.entries(byVideo).forEach(([vid, count]) => {
          hlMap[vid] = { videoId: vid, count };
        });
      }
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        (jobData.jobs || []).forEach((j: any) => {
          const vid = j.videoId;
          if (!hlMap[vid]) hlMap[vid] = { videoId: vid, count: 0 };
          hlMap[vid].jobStatus = j.status;
          hlMap[vid].jobProgress = j.progress;
        });
      }
      setHlSummary(hlMap);
      if (shortRes.ok) {
        const sData = await shortRes.json();
        const byVideo: Record<string, { count: number; status?: string; progress?: number }> = {};
        (sData.shorts || []).forEach((s: any) => {
          const vid = s.sourceVideoId || s.videoId;
          if (!vid) return;
          byVideo[vid] = byVideo[vid] || { count: 0 };
          byVideo[vid].count += 1;
          // Keep active status if any short is processing
          if (["QUEUED", "PROCESSING", "EDITING", "CAPTIONING", "QUALITY_CHECK", "RETRYING"].includes(s.status)) {
            byVideo[vid].status = s.status;
            byVideo[vid].progress = s.progress;
          } else if (!byVideo[vid].status) {
            byVideo[vid].status = s.status;
          }
        });
        setShortsSummary(byVideo);
      }
    } catch {}
  }, []);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
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
      const res = await fetch("/api/cloudinary/videos", { credentials: "include", headers, cache: "no-store" });
      if (res.status === 401) {
        setVideos([]);
        return;
      }
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setVideos(data.videos || []);
      // After videos, also refresh highlights summary
      fetchHighlightsSummary();
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, [fetchHighlightsSummary]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos, refreshKey]);

  useEffect(() => {
    // Poll highlights summary every 8s for dashboard progress updates
    const iv = setInterval(fetchHighlightsSummary, 8000);
    return () => clearInterval(iv);
  }, [fetchHighlightsSummary]);

  const handleDelete = async (videoId: string) => {
    if (!confirm(`Delete video ${videoId}? This removes Cloudinary asset and Firestore metadata.`)) return;
    setDeleting(videoId);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch(`/api/cloudinary/videos/${encodeURIComponent(videoId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Video deleted");
      setVideos((prev) => prev.filter((v) => v.videoId !== videoId));
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const filtered = videos.filter((v) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return v.fileName.toLowerCase().includes(q) || v.videoId.toLowerCase().includes(q) || v.format.toLowerCase().includes(q);
  });

  const getThumb = (v: VideoDoc) => {
    if (v.thumbnailUrl) return v.thumbnailUrl;
    // derive from cloudinaryUrl: replace /video/upload/ with /video/upload/so_1,w_320... and change extension to jpg
    if (v.cloudinaryUrl && v.cloudinaryUrl.includes("/video/upload/")) {
      return v.cloudinaryUrl.replace("/video/upload/", "/video/upload/so_1,w_320,h_180,c_fill/").replace(/\.[^/.]+$/, ".jpg");
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-8 flex items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading library…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search filename, id, format…" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 bg-zinc-900 border-zinc-800" />
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="bg-zinc-900 border-zinc-800 text-zinc-400 self-center">{filtered.length} videos</Badge>
          <Button variant="outline" size="sm" onClick={fetchVideos}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 border-dashed">
          <CardContent className="p-8 text-center">
            <Video className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm font-medium">No videos yet</p>
            <p className="text-xs text-zinc-500 mt-1">Upload via Cloudinary — your library will appear here with thumbnails, duration, size and status.</p>
            <p className="text-xs text-zinc-600 mt-2 font-mono">users/&#123;uid&#125;/videos/&#123;videoId&#125; • Cloudinary folders: original / clips / shorts / thumbnails</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => {
            const thumb = getThumb(v);
            const isPreview = previewId === v.videoId;
            return (
              <Card key={v.videoId} className="bg-zinc-900 border-zinc-800 overflow-hidden group hover:border-zinc-700 transition-colors">
                <div className="relative aspect-video bg-black overflow-hidden">
                  {isPreview ? (
                    <video src={v.cloudinaryUrl} controls autoPlay className="w-full h-full object-contain" />
                  ) : thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={v.fileName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="h-8 w-8 text-zinc-600" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <Badge variant={v.status === "ready" ? "success" : v.status === "failed" ? "destructive" : "secondary"} className="capitalize text-xs">
                      {v.status}
                    </Badge>
                    {v.processingStatus && v.processingStatus !== "completed" && (
                      <Badge variant="warning" className="capitalize text-xs">{v.processingStatus}</Badge>
                    )}
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur rounded-md px-1.5 py-0.5 text-xs text-white flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {v.duration ? formatDuration(v.duration) : "--:--"}
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button size="sm" variant="secondary" className="bg-white/90 text-zinc-900" onClick={() => setPreviewId(isPreview ? null : v.videoId)}>
                      {isPreview ? <Eye className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" /> } {isPreview ? "Close" : "Preview"}
                    </Button>
                  </div>
                </div>
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium truncate" title={v.fileName}>{v.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="truncate font-mono">{v.videoId}</span>
                    <span>•</span>
                    <span>{v.format?.toUpperCase()}</span>
                    {v.width && v.height && <span>• {v.width}x{v.height}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{formatBytes(v.fileSize)}</span>
                    <span>•</span>
                    <span>{timeAgo(v.createdAt)}</span>
                  </div>
                  {v.error && (
                    <div className="flex gap-1.5 rounded-lg bg-red-950/40 border border-red-900 p-2 text-xs text-red-300">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span className="truncate">{v.error}</span>
                    </div>
                  )}
                  {v.status === "ready" && (
                    <div className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Cloudinary ready</div>
                  )}
                  {/* V4 Shorts inline summary */}
                  {(() => {
                    const ss = shortsSummary[v.videoId];
                    if (!ss) {
                      return (
                        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 p-2 flex items-center justify-between">
                          <span className="text-xs text-zinc-500 flex items-center gap-1.5"><FilmIcon className="h-3 w-3 text-zinc-600" /> No Shorts yet — best highlight → 9:16</span>
                          <Badge variant="secondary" className="text-xs">—</Badge>
                        </div>
                      );
                    }
                    const isActive = ["QUEUED", "PROCESSING", "EDITING", "CAPTIONING", "QUALITY_CHECK", "RETRYING"].includes(ss.status || "");
                    const isDone = ss.status === "COMPLETED";
                    const isFailed = ss.status === "FAILED";
                    return (
                      <div className={`rounded-lg border p-2 flex items-center justify-between ${isDone ? "border-pink-900/50 bg-pink-950/10" : isFailed ? "border-red-900/50 bg-red-950/10" : isActive ? "border-pink-900/30 bg-pink-950/5" : "border-zinc-800 bg-zinc-950"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FilmIcon className={`h-3.5 w-3.5 shrink-0 ${isDone ? "text-pink-400" : isActive ? "text-pink-300" : isFailed ? "text-red-400" : "text-zinc-600"}`} />
                          <div className="min-w-0">
                            <div className="text-xs font-medium flex items-center gap-1.5">
                              {isActive ? `${ss.status?.toLowerCase()} ${ss.progress ?? 0}%` : isDone ? `${ss.count} Short${ss.count > 1 ? "s" : ""} ready 1080×1920` : `${ss.count} Short${ss.count > 1 ? "s" : ""} • ${ss.status?.toLowerCase()}`}
                              {isActive && <Loader2 className="h-3 w-3 animate-spin text-pink-400" />}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono truncate">9:16 • shorts/*.mp4 + .jpg</div>
                          </div>
                        </div>
                        <Badge variant={isDone ? "success" : isFailed ? "destructive" : "secondary"} className="capitalize text-xs shrink-0">{ss.status?.toLowerCase() || `${ss.count} shorts`}</Badge>
                      </div>
                    );
                  })()}
                  {/* V3 AI Highlights inline */}
                  {(() => {
                    const hl = hlSummary[v.videoId];
                    if (!hl) {
                      return (
                        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 p-2 flex items-center justify-between">
                          <span className="text-xs text-zinc-500 flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-zinc-600" /> No AI highlights yet</span>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setExpandedHl(expandedHl === v.videoId ? null : v.videoId)}>
                            {expandedHl === v.videoId ? "Close" : "AI"}
                          </Button>
                        </div>
                      );
                    }
                    const status = hl.jobStatus || (hl.count > 0 ? "COMPLETED" : "QUEUED");
                    const isActive = ["QUEUED", "PROCESSING", "RETRYING"].includes(status);
                    const isFailed = status === "FAILED";
                    const isDone = status === "COMPLETED";
                    return (
                      <div className={`rounded-lg border p-2 flex items-center justify-between ${isDone ? "border-emerald-900/50 bg-emerald-950/10" : isFailed ? "border-red-900/50 bg-red-950/10" : isActive ? "border-violet-900/50 bg-violet-950/10" : "border-zinc-800 bg-zinc-950"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles className={`h-3.5 w-3.5 shrink-0 ${isDone ? "text-emerald-400" : isActive ? "text-violet-400" : isFailed ? "text-red-400" : "text-zinc-600"}`} />
                          <div className="min-w-0">
                            <div className="text-xs font-medium flex items-center gap-1.5">
                              {isDone ? `${hl.count} highlights` : isActive ? `${status.toLowerCase()} ${hl.jobProgress ?? 0}%` : isFailed ? "AI failed" : `${hl.count} highlights`}
                              {isActive && <Loader2 className="h-3 w-3 animate-spin text-violet-400" />}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono truncate">fpq • {status.toLowerCase()}</div>
                          </div>
                        </div>
                        <Button size="sm" variant={isDone ? "secondary" : "outline"} className="h-6 text-xs px-2 shrink-0" onClick={() => setExpandedHl(expandedHl === v.videoId ? null : v.videoId)}>
                          {expandedHl === v.videoId ? "Close" : isDone ? "View" : "Status"}
                        </Button>
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPreviewId(isPreview ? null : v.videoId)}>
                      {isPreview ? "Close" : "Preview"}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setExpandedHl(expandedHl === v.videoId ? null : v.videoId)}>
                      <Sparkles className="h-3.5 w-3.5" /> {expandedHl === v.videoId ? "Hide AI" : "AI Highlights"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={deleting === v.videoId}
                      onClick={() => handleDelete(v.videoId)}
                    >
                      {deleting === v.videoId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                    </Button>
                  </div>
                  {expandedHl === v.videoId && (
                    <div className="pt-2 space-y-3">
                      <HighlightsPanel videoId={v.videoId} />
                      <ShortsPanel videoId={v.videoId} />
                    </div>
                  )}
                  <p className="text-[11px] font-mono text-zinc-600 truncate">{v.cloudinaryPublicId}</p>
                  <p className="text-[11px] text-zinc-600">Folder: <span className="font-mono">users/{v.ownerId}/videos/{v.videoId}/original/</span></p>
                  <p className="text-[11px] text-zinc-600 font-mono">clips: <span className="font-mono">users/{v.ownerId}/videos/{v.videoId}/clips/*.mp4</span> • highlights: <span className="font-mono">…/highlights</span> • shorts: <span className="font-mono">…/shorts/*.mp4 + .jpg</span></p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
        <span className="font-medium text-zinc-300">Cloudinary</span> — videos stored as <span className="font-mono">users/&#123;uid&#125;/videos/&#123;videoId&#125;/original/</span> (plus <span className="font-mono">clips/</span>, <span className="font-mono">shorts/</span>, <span className="font-mono">thumbnails/</span>). Firestore at <span className="font-mono">users/&#123;uid&#125;/videos/&#123;videoId&#125;</span> holds only metadata — never file bytes. API secret stays server-side (signature at <span className="font-mono">/api/cloudinary/signature</span>).
      </div>
    </div>
  );
}
