"use client";

import { useState } from "react";
import { VideoLibrary } from "@/components/cloudinary/VideoLibrary";
import { CloudinaryUploader } from "@/components/cloudinary/CloudinaryUploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LibraryPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Video Library</h1>
          <Badge className="bg-white text-zinc-900">Cloudinary</Badge>
          <Badge variant="secondary" className="bg-zinc-900 border-zinc-800 text-zinc-400">users/&#123;uid&#125;/videos</Badge>
        </div>
        <p className="text-sm text-zinc-400 mt-1">
          All videos stored in Cloudinary — <span className="font-mono text-xs">users/&#123;uid&#125;/videos/&#123;videoId&#125;/original/</span> + <span className="font-mono text-xs">clips/</span> <span className="font-mono text-xs">shorts/</span> <span className="font-mono text-xs">thumbnails/</span> — metadata in Firestore <span className="font-mono text-xs">users/&#123;uid&#125;/videos/&#123;videoId&#125;</span>
        </p>
      </div>

      <CloudinaryUploader onUploaded={() => setRefreshKey((k) => k + 1)} />

      <div>
        <h2 className="text-lg font-semibold mb-3">Your videos</h2>
        <VideoLibrary refreshKey={refreshKey} />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm">Cloudinary architecture — for developers</CardTitle>
          <CardDescription>Secure signed uploads, per-user isolation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs font-mono leading-relaxed">
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// 1) Client requests signed params (server generates HMAC with API_SECRET)"}</p>
            <p className="text-zinc-300">{`POST /api/cloudinary/signature { filename, fileSize, mimeType }`}</p>
            <p className="text-zinc-500">{`-> { signature, timestamp, apiKey, cloudName, folder: users/{uid}/videos/{videoId}/original/, publicId, uploadUrl, params }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// 2) Browser POSTs directly to Cloudinary (no Netlify proxy)"}</p>
            <p className="text-zinc-300">{`POST https://api.cloudinary.com/v1_1/<cloud>/video/upload`}</p>
            <p className="text-zinc-500">{`Form: file + api_key + timestamp + signature + folder + public_id — XHR onprogress for % + abort()`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-emerald-400 mb-2">{"// 3) On success, client saves metadata to Firestore (server verifies uid owns publicId)"}</p>
            <p className="text-zinc-300">{`POST /api/cloudinary/complete { videoId, cloudinaryPublicId, cloudinaryUrl, ...duration,width,height }`}</p>
            <p className="text-zinc-500">{`-> Firestore users/{uid}/videos/{videoId} { fileName, cloudinaryPublicId, cloudinaryUrl, resourceType, format, fileSize, duration, width, height, status, ownerId }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// 4) Library & delete (per-user only)"}</p>
            <p className="text-zinc-300">{`GET /api/cloudinary/videos -> list own videos | DELETE /api/cloudinary/videos/{videoId} -> Cloudinary destroy + Firestore delete`}</p>
            <p className="text-zinc-500">{`Per-user: server checks doc.ownerId === uid and publicId prefix users/{uid}/videos/`}</p>
          </div>
          <p className="text-zinc-500 font-sans">Folders auto-created by Cloudinary on first upload. Never expose CLOUDINARY_API_SECRET — only timestamp/signature/apiKey go to browser.</p>
        </CardContent>
      </Card>
    </div>
  );
}
