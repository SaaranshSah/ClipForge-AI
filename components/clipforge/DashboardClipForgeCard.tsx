"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase";
import { Loader2, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";

type Job = {
  clipforgeJobId: string;
  sourceVideoId: string;
  status: string;
  filename?: string;
  createdAt: string;
};

export function DashboardClipForgeCard() {
  const [jobs, setJobs] = useState<Job[]>([]);
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
        const res = await fetch("/api/clipforge/jobs", { credentials: "include", headers, cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setJobs((data.jobs || []).slice(0, 3));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">ClipForge — fpq</CardTitle>
          <Badge variant="secondary" className="bg-zinc-800">project fpq</Badge>
        </div>
        <CardDescription>Recent ClipForge jobs (users/&#123;uid&#125;/jobs)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 p-4 text-center">
            <Clock className="h-6 w-6 mx-auto text-zinc-600 mb-1" />
            <p className="text-sm text-zinc-400">No ClipForge jobs yet</p>
            <p className="text-xs text-zinc-600 mt-1">Upload via Upload → ClipForge (fpq) to see status here</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/upload">Upload to ClipForge</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.clipforgeJobId} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{j.filename || j.sourceVideoId}</p>
                  <p className="text-xs text-zinc-500 truncate">{j.clipforgeJobId} • {j.status}</p>
                </div>
                <Badge variant={j.status === "completed" ? "success" : j.status === "failed" ? "destructive" : "secondary"} className="capitalize">{j.status}</Badge>
              </div>
            ))}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/upload">View all jobs <ExternalLink className="h-3 w-3 ml-1" /></Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
