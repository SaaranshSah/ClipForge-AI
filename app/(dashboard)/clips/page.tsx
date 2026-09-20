"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDuration, timeAgo } from "@/lib/utils";
import { Film, Play, Clock, Search, Loader2, Sparkles } from "lucide-react";

type ClipItem = {
  id: string;
  title: string | null;
  status: string;
  duration: number;
  startTime: number;
  endTime: number;
  thumbnailUrl: string | null;
  outputUrl: string | null;
  createdAt: string;
  video: { filename: string };
};

export default function ClipsPage() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const fetchClips = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/clips?${params.toString()}`, { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setClips(data.clips || []);
    } catch {
      setClips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClips();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clip Library</h1>
          <p className="text-sm text-zinc-400 mt-1">All generated clips — thumbnails, duration, source and status. AI generation lands in V2.</p>
        </div>
        <Badge variant="secondary" className="shrink-0 bg-amber-500/10 text-amber-300 border-amber-500/20">
          <Sparkles className="h-3 w-3 mr-1" />
          AI clipping — V2
        </Badge>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <form onSubmit={onSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Search clips by title or source..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading clips...
        </div>
      ) : clips.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 border-dashed">
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-zinc-800 flex items-center justify-center mb-3">
              <Film className="h-6 w-6 text-zinc-500" />
            </div>
            <h3 className="font-medium">No clips yet</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
              Clips you generate will appear here as cards with thumbnail, duration, source video, status and a preview button. No placeholder clips — only your real work.
            </p>
            <div className="mt-6 grid sm:grid-cols-3 gap-3 text-left max-w-2xl mx-auto">
              {[
                { t: "Thumbnail", d: "Auto-generated 9:16 preview" },
                { t: "Duration", d: "From your niche default (15–60s)" },
                { t: "Status", d: "Pending → Processing → Ready" },
              ].map((x) => (
                <div key={x.t} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-xs font-medium text-zinc-300">{x.t}</p>
                  <p className="text-xs text-zinc-500 mt-1">{x.d}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-6">In V1, clip generation is contract-ready. Upload a video in Projects to create the ProcessingJob that V2 will consume.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip) => (
            <Card key={clip.id} className="bg-zinc-900 border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors group">
              <div className="relative aspect-[9/16] max-h-[320px] bg-zinc-950 flex items-center justify-center overflow-hidden">
                {clip.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clip.thumbnailUrl} alt={clip.title || "clip"} className="h-full w-full object-cover" />
                ) : (
                  <Film className="h-10 w-10 text-zinc-700" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <Badge variant="secondary" className="bg-black/70 text-white border-white/10 backdrop-blur text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDuration(clip.duration)}
                  </Badge>
                  <Badge variant={clip.status === "READY" ? "success" : clip.status === "FAILED" ? "destructive" : "secondary"} className="capitalize text-xs">
                    {clip.status.toLowerCase()}
                  </Badge>
                </div>
                {clip.status === "READY" && clip.outputUrl && (
                  <button className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 backdrop-blur-sm">
                    <span className="h-12 w-12 rounded-full bg-white text-zinc-900 flex items-center justify-center">
                      <Play className="h-5 w-5 ml-0.5" />
                    </span>
                  </button>
                )}
              </div>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium truncate">{clip.title || "Untitled clip"}</h3>
                <p className="text-xs text-zinc-500 truncate mt-1">{clip.video.filename}</p>
                <p className="text-xs text-zinc-600 mt-1">
                  {formatDuration(clip.startTime)} → {formatDuration(clip.endTime)} • {timeAgo(clip.createdAt)}
                </p>
                <Button size="sm" variant="outline" className="w-full mt-3" disabled={clip.status !== "READY"}>
                  <Play className="h-3.5 w-3.5" />
                  Preview
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
