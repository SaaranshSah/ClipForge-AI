"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDuration, timeAgo } from "@/lib/utils";
import { Search, Filter, Video, Clock, FileVideo, Loader2, UploadCloud } from "lucide-react";

type VideoItem = {
  id: string;
  filename: string;
  status: string;
  fileSize: number;
  duration: number | null;
  createdAt: string;
  _count: { clips: number };
};

export default function ProjectsPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/videos?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setVideos(data.videos || []);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVideos();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-zinc-400 mt-1">All your uploaded streams — searchable, filterable, scoped to your account.</p>
        </div>
        <Button asChild className="bg-white text-zinc-900 hover:bg-zinc-100 shrink-0">
          <Link href="/upload">
            <UploadCloud className="h-4 w-4" />
            New upload
          </Link>
        </Button>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <form onSubmit={onSearch} className="flex-1 relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Search by filename..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-500 hidden sm:block" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="UPLOADING">Uploading</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="PROCESSING">Processing</option>
              <option value="READY">Ready</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading projects...
        </div>
      ) : videos.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 border-dashed">
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-zinc-800 flex items-center justify-center mb-3">
              <FileVideo className="h-6 w-6 text-zinc-500" />
            </div>
            <h3 className="font-medium">No streams yet</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
              Upload your first long-form stream. We&apos;ll track its processing status, duration, and how many clips it generates — no fake data, just your real projects.
            </p>
            <Button asChild className="mt-6 bg-white text-zinc-900 hover:bg-zinc-100">
              <Link href="/upload">Upload your first video</Link>
            </Button>
            <p className="text-xs text-zinc-600 mt-3">Supports MP4, MOV, AVI, WebM, MKV up to 2GB via direct signed URL</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {/* Table header - desktop */}
          <div className="hidden lg:grid grid-cols-[1fr_120px_100px_110px_140px] gap-4 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wide">
            <span>Stream</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Clips</span>
            <span>Date</span>
          </div>
          {videos.map((v) => (
            <Card key={v.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
              <CardContent className="p-4">
                <div className="flex lg:grid lg:grid-cols-[1fr_120px_100px_110px_140px] gap-3 items-center">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                      <Video className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{v.filename}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {formatBytes(v.fileSize)} • {v.id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <div>
                    <Badge
                      variant={
                        v.status === "READY" ? "success" : v.status === "FAILED" ? "destructive" : v.status === "PROCESSING" ? "warning" : "secondary"
                      }
                      className="capitalize"
                    >
                      {v.status.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-sm text-zinc-300">
                    <Clock className="h-3.5 w-3.5 text-zinc-500" />
                    {formatDuration(v.duration)}
                  </div>
                  <div className="hidden sm:block text-sm text-zinc-300">{v._count.clips} clips</div>
                  <div className="hidden lg:block text-xs text-zinc-500">{timeAgo(v.createdAt)}</div>
                </div>
                {/* Mobile meta */}
                <div className="lg:hidden flex flex-wrap gap-2 mt-3 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDuration(v.duration)}
                  </span>
                  <span>• {v._count.clips} clips</span>
                  <span>• {timeAgo(v.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
