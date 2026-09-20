"use client";

import { useState } from "react";
import { Dropzone } from "@/components/upload/dropzone";
import { ClipForgeUploader } from "@/components/clipforge/ClipForgeUploader";
import { ClipForgeJobs } from "@/components/clipforge/ClipForgeJobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function UploadPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
          <Badge variant="secondary" className="bg-zinc-900 border-zinc-800 text-zinc-400">Direct upload</Badge>
          <Badge variant="secondary" className="bg-white text-zinc-900">fpq</Badge>
        </div>
        <p className="text-sm text-zinc-400 mt-1">Two flows: legacy S3 signed URL (existing) and new Firebase + ClipForge (project fpq) — both preserved.</p>
      </div>

      <Tabs defaultValue="clipforge" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="clipforge">ClipForge (fpq) — Firebase</TabsTrigger>
          <TabsTrigger value="legacy">Legacy S3</TabsTrigger>
        </TabsList>
        <TabsContent value="clipforge" className="space-y-4 mt-4">
          <ClipForgeUploader onJobCreated={() => setRefreshKey((k) => k + 1)} />
          <ClipForgeJobs refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="legacy" className="space-y-4 mt-4">
          <Dropzone />
        </TabsContent>
      </Tabs>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm">Upload contracts — for developers</CardTitle>
          <CardDescription>How the signed URL flow works (implemented in /api/uploads) and where ClipForge plugs in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs font-mono leading-relaxed">
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// Legacy: Frontend requests a signed URL"}</p>
            <p className="text-zinc-300">POST /api/uploads/signed-url</p>
            <p className="text-zinc-500">{`{ filename, fileSize, mimeType } -> { uploadUrl, storageKey, videoId, expiresAt }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-emerald-400 mb-2">{"// ClipForge (fpq): Firebase Storage -> ClipForge API (server-side)"}</p>
            <p className="text-zinc-300">{`1) Firebase Storage: users/{uid}/videos/{videoId}/source.mp4 -> getDownloadURL()`}</p>
            <p className="text-zinc-300">{`2) POST /api/clipforge/jobs { sourceVideoId, sourceUrl, filename, project: fpq }`}</p>
            <p className="text-zinc-500">{`-> server calls ClipForge with CLIPFORGE_API_KEY (Bearer), stores job in users/{uid}/jobs/{jobId} { provider: clipforge, project: fpq }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// Polling: check status"}</p>
            <p className="text-zinc-300">{`GET /api/clipforge/jobs/{jobId} -> { status: queued|uploading|processing|completed|failed|cancelled }`}</p>
            <p className="text-zinc-500">Poll every 5s until terminal; webhook /api/clipforge/webhook also updates Firestore idempotently</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// Clip Storage"}</p>
            <p className="text-zinc-300">{`completed -> ClipForge resultUrl -> Firebase Storage: users/{uid}/videos/{videoId}/clips/{clipId}.mp4`}</p>
            <p className="text-zinc-500">Firestore updated: clipStoragePath, resultUrl, updatedAt</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
