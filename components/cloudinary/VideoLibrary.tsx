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

export function VideoLibrary({ refreshKey }: { refreshKey?: number }) {
  const [videos, setVideos] = useState<VideoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

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
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos, refreshKey]);

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
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPreviewId(isPreview ? null : v.videoId)}>
                      {isPreview ? "Close" : "Preview"}
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
                  <p className="text-[11px] font-mono text-zinc-600 truncate">{v.cloudinaryPublicId}</p>
                  <p className="text-[11px] text-zinc-600">Folder: <span className="font-mono">users/{v.ownerId}/videos/{v.videoId}/original/</span></p>
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
