"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, FileVideo, X, CheckCircle2, AlertCircle, Play } from "lucide-react";
import { formatBytes } from "@/lib/utils";

type UploadState = "idle" | "validating" | "requesting" | "uploading" | "completing" | "done" | "error";

export type DropzoneProps = {
  onCompleted?: (videoId: string) => void;
};

const ACCEPT = "video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska,.mp4,.mov,.avi,.webm,.mkv";
const MAX_BYTES = 2147483648;

export function Dropzone({ onCompleted }: DropzoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setState("idle");
    setProgress(0);
    setError(null);
    setVideoId(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [previewUrl]);

  const validate = (f: File): string | null => {
    const allowedMime = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska"];
    if (!allowedMime.includes(f.type) && !f.type.startsWith("video/")) return "File must be a video (MP4, MOV, AVI, WebM, MKV)";
    if (f.size > MAX_BYTES) return "File exceeds 2GB limit";
    if (f.size < 1024) return "File is too small";
    return null;
  };

  const handleFile = (f: File) => {
    const err = validate(f);
    if (err) {
      setError(err);
      setState("error");
      return;
    }
    setError(null);
    setFile(f);
    setState("idle");
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const startUpload = async () => {
    if (!file) return;
    setError(null);

    try {
      setState("requesting");
      setProgress(5);

      // 1) Get signed URL from our API (auth + validation + key generation)
      const sigRes = await fetch("/api/uploads/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || "video/mp4",
        }),
      });

      if (!sigRes.ok) {
        const j = await sigRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to create upload URL");
      }

      const { videoId: vid, uploadUrl, storageKey }: { videoId: string; uploadUrl: string; storageKey: string } =
        await sigRes.json();
      setVideoId(vid);
      setState("uploading");
      setProgress(10);

      // 2) Direct PUT to object storage (or mock endpoint in dev)
      // If uploadUrl is mock (same-origin /api/uploads/mock), we simulate progress
      const isMock = uploadUrl.includes("/api/uploads/mock");

      if (isMock) {
        // Simulate chunked progress for demo without actually sending 2GB
        await new Promise<void>((resolve) => {
          let p = 10;
          const iv = setInterval(() => {
            p += Math.random() * 18;
            if (p >= 98) {
              p = 100;
              clearInterval(iv);
              setProgress(100);
              resolve();
            } else {
              setProgress(Math.min(98, Math.round(p)));
            }
          }, 250);
        });
        // Optionally actually POST the file to mock endpoint if small (<50MB) — skip for large
        if (file.size < 50 * 1024 * 1024) {
          try {
            await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
          } catch {}
        }
      } else {
        // Real storage: XHR for progress events
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const pct = Math.round((evt.loaded / evt.total) * 90) + 10; // 10-100
              setProgress(pct);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));
          xhr.send(file);
        });
      }

      // 3) Complete
      setState("completing");
      setProgress(100);
      const completeRes = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: vid, storageKey }),
      });
      if (!completeRes.ok) {
        const j = await completeRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to finalize upload");
      }

      setState("done");
      onCompleted?.(vid);
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setState("error");
    }
  };

  const cancel = () => {
    xhrRef.current?.abort();
    reset();
  };

  return (
    <div className="space-y-4">
      {/* Drop area */}
      {!file ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/50 p-8 py-12 text-center transition-colors hover:border-zinc-700 hover:bg-zinc-900"
        >
          <div className="rounded-2xl bg-zinc-800 p-4 mb-4 group-hover:bg-zinc-700 transition-colors">
            <UploadCloud className="h-8 w-8 text-zinc-300" />
          </div>
          <h3 className="text-base font-semibold text-white">Drag and drop your stream</h3>
          <p className="mt-1 text-sm text-zinc-400">MP4, MOV, AVI, WebM or MKV — up to 2GB</p>
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => inputRef.current?.click()} className="bg-white text-zinc-900 hover:bg-zinc-100">
              Browse files
            </Button>
            <span className="text-xs text-zinc-500">or drop here</span>
          </div>
          <p className="mt-6 text-xs text-zinc-500 max-w-md">
            Direct upload to object storage via signed URL — your browser streams straight to the bucket without touching our serverless function.
          </p>
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          {/* Preview */}
          <div className="grid md:grid-cols-[320px_1fr] gap-0">
            <div className="bg-black relative aspect-video md:aspect-[4/3] overflow-hidden flex items-center justify-center">
              {previewUrl ? (
                <video src={previewUrl} controls className="h-full w-full object-contain" muted preload="metadata" />
              ) : (
                <FileVideo className="h-10 w-10 text-zinc-600" />
              )}
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white backdrop-blur">
                <Play className="h-3 w-3" />
                {file.name}
              </div>
            </div>
            <div className="p-5 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {formatBytes(file.size)} • {file.type || "video/*"}
                  </p>
                </div>
                {state === "idle" && (
                  <Button variant="ghost" size="icon" onClick={reset} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className={cn("font-medium", state === "error" ? "text-red-400" : "text-zinc-400")}>
                    {state === "idle" && "Ready to upload"}
                    {state === "validating" && "Validating..."}
                    {state === "requesting" && "Requesting signed URL..."}
                    {state === "uploading" && `Uploading — ${progress}%`}
                    {state === "completing" && "Finalizing..."}
                    {state === "done" && "Upload complete"}
                    {state === "error" && "Upload failed"}
                  </span>
                  <span className="text-zinc-500">{progress}%</span>
                </div>
                <Progress value={progress} />
                {error && (
                  <div className="flex gap-2 rounded-lg bg-red-950/50 border border-red-900 p-3 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                {state === "done" && (
                  <div className="flex gap-2 rounded-lg bg-emerald-950/40 border border-emerald-900 p-3 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Upload finalized</p>
                      <p className="text-xs text-emerald-400/80 mt-1">Video ID: {videoId} — processing will start shortly. You can close this and check Projects.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-auto flex gap-2 pt-6">
                {state === "done" ? (
                  <>
                    <Button onClick={reset} variant="secondary" className="flex-1">
                      Upload another
                    </Button>
                    <Button asChild className="flex-1 bg-white text-zinc-900 hover:bg-zinc-100">
                      <a href="/projects">Go to Projects</a>
                    </Button>
                  </>
                ) : state === "uploading" || state === "requesting" || state === "completing" ? (
                  <>
                    <Button variant="outline" className="flex-1" onClick={cancel}>
                      Cancel
                    </Button>
                    <Button disabled className="flex-1 opacity-60">
                      Uploading...
                    </Button>
                  </>
                ) : state === "error" ? (
                  <>
                    <Button variant="outline" onClick={reset} className="flex-1">
                      Try again
                    </Button>
                    <Button onClick={startUpload} className="flex-1 bg-white text-zinc-900 hover:bg-zinc-100">
                      Retry upload
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={reset} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={startUpload} className="flex-1 bg-white text-zinc-900 hover:bg-zinc-100">
                      Start upload
                    </Button>
                  </>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Architecture: Frontend → POST /api/uploads/signed-url (validated, auth’d) → signed PUT URL → browser streams directly to bucket → POST /api/uploads/complete. Huge files never traverse Next.js serverless.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Helper cards */}
      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="font-medium text-zinc-200">Max 2GB · 4h limit</p>
          <p className="text-zinc-500 mt-1">Direct multipart recommended for &gt;100MB (V2)</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="font-medium text-zinc-200">Private by default</p>
          <p className="text-zinc-500 mt-1">Storage keys are scoped to your user ID</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="font-medium text-zinc-200">Cancellable</p>
          <p className="text-zinc-500 mt-1">Abort anytime — no orphaned server load</p>
        </div>
      </div>
    </div>
  );
}
