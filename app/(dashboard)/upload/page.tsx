import { Dropzone } from "@/components/upload/dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function UploadPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
          <Badge variant="secondary" className="bg-zinc-900 border-zinc-800 text-zinc-400">Direct upload</Badge>
        </div>
        <p className="text-sm text-zinc-400 mt-1">Streams go straight to object storage via signed URLs. Files never traverse the Next.js serverless function.</p>
      </div>

      <Dropzone />

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm">Upload contracts — for developers</CardTitle>
          <CardDescription>How the signed URL flow works (implemented in /api/uploads)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs font-mono leading-relaxed">
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// 1) Frontend requests a signed URL"}</p>
            <p className="text-zinc-300">POST /api/uploads/signed-url</p>
            <p className="text-zinc-500">{`{ filename, fileSize, mimeType } -> { uploadUrl, storageKey, videoId, expiresAt }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// 2) Browser PUTs directly to storage"}</p>
            <p className="text-zinc-300">PUT uploadUrl</p>
            <p className="text-zinc-500">Headers: Content-Type, Content-Length — no Next.js proxy</p>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500 mb-2">{"// 3) Frontend confirms completion"}</p>
            <p className="text-zinc-300">POST /api/uploads/complete</p>
            <p className="text-zinc-500">{`{ videoId, storageKey } -> { video, processingJob }`}</p>
          </div>
          <p className="text-zinc-500 font-sans">For &gt;100MB files, V2 will add multipart signed URLs (create-multipart / sign-part / complete). The DB already tracks ProcessingJob so workers can resume.</p>
        </CardContent>
      </Card>
    </div>
  );
}
