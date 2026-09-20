"use client";

import { useState } from "react";
import { Dropzone } from "@/components/upload/dropzone";
import { ClipForgeUploader } from "@/components/clipforge/ClipForgeUploader";
import { ClipForgeJobs } from "@/components/clipforge/ClipForgeJobs";
import { CloudinaryUploader } from "@/components/cloudinary/CloudinaryUploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UploadPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
          <Badge variant="secondary" className="bg-zinc-900 border-zinc-800 text-zinc-400">Direct upload</Badge>
          <Badge variant="secondary" className="bg-white text-zinc-900">Cloudinary</Badge>
          <Badge variant="secondary" className="bg-zinc-900 border-zinc-800 text-zinc-400">fpq</Badge>
        </div>
        <p className="text-sm text-zinc-400 mt-1">Professional Cloudinary pipeline (primary) + ClipForge fpq + legacy S3 — all preserved. Use Cloudinary for actual video files.</p>
      </div>

      <Tabs defaultValue="cloudinary" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 flex-wrap h-auto">
          <TabsTrigger value="cloudinary">Cloudinary — Signed direct</TabsTrigger>
          <TabsTrigger value="clipforge">ClipForge (fpq)</TabsTrigger>
          <TabsTrigger value="legacy">Legacy S3</TabsTrigger>
        </TabsList>
        <TabsContent value="cloudinary" className="space-y-4 mt-4">
          <CloudinaryUploader onUploaded={() => setRefreshKey((k) => k + 1)} />
          <Card className="bg-zinc-900 border-zinc-800 border-dashed">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Video Library</p>
                <p className="text-xs text-zinc-500">Your Cloudinary videos live at <span className="font-mono">/library</span> — thumbnails, duration, delete.</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/library">Open library</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
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
          <CardDescription>Cloudinary (V2 primary) + ClipForge fpq + signed URL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs font-mono leading-relaxed">
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-emerald-400 mb-2">{"// V2 Cloudinary: signed direct (primary — use for all videos)"}</p>
            <p className="text-zinc-300">{`1) POST /api/cloudinary/signature { filename, fileSize, mimeType, videoId } -> { signature, timestamp, folder: users/{uid}/videos/{videoId}/original/, publicId }`}</p>
            <p className="text-zinc-300">{`2) POST https://api.cloudinary.com/v1_1/<cloud>/video/upload (direct from browser) + XHR progress + abort`}</p>
            <p className="text-zinc-300">{`3) POST /api/cloudinary/complete { videoId, publicId, secure_url, bytes, duration, width, height } -> Firestore users/{uid}/videos/{videoId}`}</p>
            <p className="text-zinc-500">{`Metadata: fileName, cloudinaryPublicId, cloudinaryUrl, resourceType, format, fileSize, duration, width, height, status, ownerId`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// V1 ClipForge (fpq): preserved"}</p>
            <p className="text-zinc-300">{`ClipForge Storage path now also Cloudinary-friendly: result clips to users/{uid}/videos/{videoId}/clips/`}</p>
            <p className="text-zinc-300">{`POST /api/clipforge/jobs { sourceVideoId, sourceUrl (Cloudinary url), filename, project: fpq }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// Legacy: Frontend requests a signed URL"}</p>
            <p className="text-zinc-300">POST /api/uploads/signed-url</p>
            <p className="text-zinc-500">{`{ filename, fileSize, mimeType } -> { uploadUrl, storageKey, videoId, expiresAt }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// Library & delete"}</p>
            <p className="text-zinc-300">{`GET /api/cloudinary/videos -> Video Library | DELETE /api/cloudinary/videos/{videoId} (Cloudinary destroy + Firestore)`}</p>
            <p className="text-zinc-500">Per-user: never cross-uid. API secret server-only.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
