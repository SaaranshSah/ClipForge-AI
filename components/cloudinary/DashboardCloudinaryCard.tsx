"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase";
import { Loader2, Video, Eye } from "lucide-react";
import Link from "next/link";

type VideoDoc = {
  videoId: string;
  fileName: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  format: string;
  fileSize: number;
  duration: number | null;
  status: string;
  createdAt: string;
};

export function DashboardCloudinaryCard() {
  const [videos, setVideos] = useState<VideoDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;
        const headers: Record<string, string> = {};
        if (user) {
          const token = await user.getIdToken().catch(() => null);
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch("/api/cloudinary/videos", { credentials: "include", headers, cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setVideos((data.videos || []).slice(0, 3));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">Cloudinary Library <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">V2</Badge></CardTitle>
          <Badge variant="secondary" className="bg-zinc-800">{videos.length} recent</Badge>
        </div>
        <CardDescription>Videos in <span className="font-mono text-xs">users/&#123;uid&#125;/videos</span> — Cloudinary folders auto-prepared</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 p-4 text-center">
            <Video className="h-6 w-6 mx-auto text-zinc-600 mb-1" />
            <p className="text-sm text-zinc-400">No Cloudinary videos yet</p>
            <p className="text-xs text-zinc-600 mt-1">Upload via Upload → Cloudinary to see them here</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/upload">Upload to Cloudinary</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {videos.map((v) => (
              <div key={v.videoId} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="h-10 w-16 rounded-md bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {v.cloudinaryUrl ? (
                    <video src={v.cloudinaryUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <Video className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{v.fileName}</p>
                  <p className="text-xs text-zinc-500 truncate">{v.videoId} • {v.format?.toUpperCase()} {v.duration ? `• ${Math.round(v.duration)}s` : ""}</p>
                </div>
                <Badge variant={v.status === "ready" ? "success" : "secondary"} className="capitalize text-xs">{v.status}</Badge>
              </div>
            ))}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/library">View library <Eye className="h-3 w-3 ml-1" /></Link>
            </Button>
          </div>
        )}
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px] font-mono text-zinc-600">
          {["original/", "clips/", "shorts/", "thumbnails/"].map((f) => (
            <div key={f} className="rounded bg-zinc-950 border border-zinc-800 p-1 text-center">{f}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
