"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";
import { UploadCloud, X, CheckCircle2, AlertCircle, Loader2, RotateCcw, Eye } from "lucide-react";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska,.mp4,.mov,.avi,.webm,.mkv";
const MAX_BYTES = 2147483648; // 2GB

type UploadState = "idle" | "signing" | "uploading" | "saving" | "done" | "error" | "cancelled";

export function CloudinaryUploader({ onUploaded }: { onUploaded?: (videoId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
  const [uploadedInfo, setUploadedInfo] = useState<any | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setState("idle");
    setProgress(0);
    setError(null);
    setVideoId(null);
    setCloudinaryUrl(null);
    setUploadedInfo(null);
    if (inputRef.current) inputRef.current.value = "";
    xhrRef.current = null;
    abortRef.current = null;
  }, [previewUrl]);

  const validate = (f: File): string | null => {
    const allowedMime = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska"];
    if (!allowedMime.includes(f.type) && !f.type.startsWith("video/")) return "File must be a video (MP4, MOV, AVI, WebM, MKV)";
    if (f.size > MAX_BYTES) return "File exceeds 2GB limit — split or compress";
    if (f.size < 1024) return "File is too small";
    return null;
  };

  const handleFile = (f: File) => {
    const err = validate(f);
    if (err) {
      setError(err);
      setState("error");
      toast.error(err);
      return;
    }
    setError(null);
    setFile(f);
    setState("idle");
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const cancel = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState("cancelled");
    setError("Upload cancelled");
    toast.info("Upload cancelled");
  };

  const retry = () => {
    if (file) startUpload(file);
  };

  const startUpload = async (f: File) => {
    setError(null);
    setProgress(2);
    setState("signing");

    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser) {
      setError("Please log in via Firebase first.");
      setState("error");
      return;
    }
    let idToken: string | null = null;
    try {
      idToken = await fbUser.getIdToken();
    } catch {}

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

    const vid = `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setVideoId(vid);

    try {
      // 1) Get Cloudinary signature (server-side, secure)
      setProgress(5);
      const sigRes = await fetch("/api/cloudinary/signature", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          filename: f.name,
          fileSize: f.size,
          mimeType: f.type,
          videoId: vid,
          folderType: "original",
        }),
      });
      const sigData = await sigRes.json().catch(() => ({}));
      if (!sigRes.ok) {
        throw new Error(sigData.error || `Failed to get upload signature (${sigRes.status})`);
      }

      const { signature, timestamp, apiKey, cloudName, folder, publicId, uploadUrl, mock } = sigData;

      setState("uploading");
      setProgress(10);

      let uploadResult: any;

      // Keep mock testing strictly separate — production (TEST_MODE=false) must NOT fake Cloudinary success
      const isTestMode = (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_TEST_MODE === "true" || process.env.TEST_MODE === "true")) || false;
      // Also check if cloudName is demo — indicates placeholder, not real account
      const isDemoCloud = cloudName === "demo";

      if (mock) {
        // In production, do NOT simulate Cloudinary — show real config error
        if (!isTestMode) {
          throw new Error(
            isDemoCloud
              ? `Cloudinary not configured: cloudName is "demo" (placeholder). Set CLOUDINARY_CLOUD_NAME to your actual Cloudinary cloud name, plus CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Current .env.local uses demo — replace with real credentials from cloudinary.com/console.`
              : `Cloudinary not configured: missing CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET. Set real credentials in .env.local and Netlify env. Received mock=${mock} cloudName=${cloudName}.`
          );
        }
        // Only in explicit test mode, allow mock with warning
        console.warn(`[cloudinary] TEST_MODE mock upload for ${publicId} — not a real Cloudinary resource (cloudName=${cloudName})`);
        uploadResult = await new Promise((resolve, reject) => {
          let p = 10;
          const iv = setInterval(() => {
            if (abortRef.current?.signal.aborted) {
              clearInterval(iv);
              reject(new Error("Upload cancelled"));
              return;
            }
            p += Math.random() * 18;
            if (p >= 98) {
              p = 100;
              clearInterval(iv);
              setProgress(100);
              // In test mode, still construct URL via SDK helper pattern, but warn it's mock
              // Use actual SDK url generation if available, not manual string, to ensure correct cloudName
              resolve({
                public_id: publicId,
                secure_url: `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`,
                url: `http://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`,
                resource_type: "video",
                format: f.name.split(".").pop() || "mp4",
                bytes: f.size,
                duration: 42,
                width: 1920,
                height: 1080,
                created_at: new Date().toISOString(),
                version: Date.now(),
                original_filename: f.name,
              });
            } else {
              setProgress(Math.min(98, Math.round(p)));
            }
          }, 250);

          // allow cancellation
          abortRef.current = new AbortController();
          abortRef.current.signal.addEventListener("abort", () => {
            clearInterval(iv);
            reject(new Error("Upload cancelled"));
          });
        });
      } else {
        // Real direct upload to Cloudinary — large video support via XHR with progress
        uploadResult = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.open("POST", uploadUrl);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 85) + 10; // 10-95
              setProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const json = JSON.parse(xhr.responseText);
                if (json.error) {
                  reject(new Error(json.error.message || "Cloudinary upload failed"));
                } else {
                  setProgress(98);
                  resolve(json);
                }
              } catch {
                reject(new Error("Invalid Cloudinary response"));
              }
            } else {
              let msg = `Cloudinary upload failed (${xhr.status})`;
              try {
                const j = JSON.parse(xhr.responseText);
                msg = j.error?.message || msg;
              } catch {}
              reject(new Error(msg));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during Cloudinary upload"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));

          const form = new FormData();
          form.append("file", f);
          form.append("api_key", apiKey);
          form.append("timestamp", String(timestamp));
          form.append("signature", signature);
          form.append("folder", folder);
          form.append("public_id", publicId);
          // resource_type is already in uploadUrl (/video/upload), but also send for safety
          // Cloudinary will store under folder/publicId
          xhr.send(form);
        });
      }

      setProgress(95);
      setState("saving");
      // 2) Save metadata to Firestore via secure server endpoint
      const completeRes = await fetch("/api/cloudinary/complete", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          videoId: vid,
          fileName: f.name,
          cloudinaryPublicId: uploadResult.public_id,
          cloudinaryUrl: uploadResult.secure_url || uploadResult.url,
          resourceType: uploadResult.resource_type,
          format: uploadResult.format,
          fileSize: uploadResult.bytes,
          duration: uploadResult.duration,
          width: uploadResult.width,
          height: uploadResult.height,
          version: uploadResult.version,
          original_filename: uploadResult.original_filename,
        }),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        throw new Error(completeData.error || "Failed to save video metadata");
      }

      setUploadedInfo(uploadResult);
      setCloudinaryUrl(uploadResult.secure_url || uploadResult.url);
      setProgress(100);
      setState("done");
      toast.success("Video uploaded to Cloudinary!");
      onUploaded?.(vid);
    } catch (e: any) {
      if (e.message === "Upload cancelled") {
        setState("cancelled");
        setError("Upload cancelled");
      } else {
        console.error("[cloudinary] upload error", e);
        let msg = e.message || "Upload failed";
        if (msg.includes("FILE_TOO_LARGE")) msg = "File too large — Cloudinary limit exceeded. Try compressing.";
        setError(msg);
        setState("error");
        toast.error(msg);
      }
    } finally {
      xhrRef.current = null;
      abortRef.current = null;
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white text-zinc-900 flex items-center justify-center">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              Cloudinary Upload
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Cloudinary</Badge>
            </CardTitle>
            <CardDescription>
              Direct signed upload → <span className="font-mono text-xs">users/&#123;uid&#125;/videos/&#123;videoId&#125;/original/</span> → Firestore metadata
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!file ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950 p-8 py-10 text-center hover:border-zinc-700 transition-colors"
          >
            <p className="text-sm font-medium text-white">Drag & drop video for Cloudinary</p>
            <p className="text-xs text-zinc-500 mt-1">MP4/MOV/WebM up to 2GB — direct to Cloudinary (no Netlify proxy)</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => inputRef.current?.click()} className="bg-white text-zinc-900">Browse</Button>
            </div>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <p className="text-[11px] text-zinc-600 mt-3">Flow: Firebase UID → signed Cloudinary upload → Firestore <span className="font-mono">users/&#123;uid&#125;/videos/&#123;videoId&#125;</span></p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] w-full max-w-xl">
              {["original/", "clips/", "shorts/", "thumbnails/"].map((f) => (
                <div key={f} className="rounded-lg bg-zinc-900 border border-zinc-800 p-2 font-mono text-zinc-500">{f}</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <video src={previewUrl} className="h-20 w-32 rounded-lg bg-black object-cover" muted playsInline />
              ) : (
                <div className="h-20 w-32 rounded-lg bg-zinc-800" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{formatBytes(file.size)} • {file.type || "video/*"}</p>
                <p className="text-xs text-zinc-600 mt-1 font-mono">users/&#123;uid&#125;/videos/{videoId || "…"} /original/</p>
              </div>
              {(state === "idle" || state === "error" || state === "cancelled" || state === "done") && (
                <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={error ? "text-red-400" : "text-zinc-400"}>
                  {state === "idle" && "Ready — direct signed upload to Cloudinary"}
                  {state === "signing" && "Getting secure Cloudinary signature..."}
                  {state === "uploading" && `Uploading to Cloudinary — ${progress}%`}
                  {state === "saving" && "Saving Firestore metadata..."}
                  {state === "done" && "Upload complete — Cloudinary + Firestore"}
                  {state === "error" && "Failed"}
                  {state === "cancelled" && "Cancelled"}
                </span>
                <span className="text-zinc-500">{progress}%</span>
              </div>
              <Progress value={progress} />
              {error && (
                <div className="flex gap-2 rounded-lg bg-red-950/50 border border-red-900 p-3 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span className="flex-1">{error}</span>
                  {(state === "error" || state === "cancelled") && (
                    <Button size="sm" variant="outline" className="ml-2" onClick={retry}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>
                  )}
                </div>
              )}
              {state === "done" && cloudinaryUrl && (
                <div className="rounded-lg bg-emerald-950/30 border border-emerald-900 p-3 text-sm text-emerald-300">
                  <div className="flex gap-2 items-start">
                    <CheckCircle2 className="h-4 w-4 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">Cloudinary ready: {videoId}</p>
                      <p className="text-xs text-emerald-400/70 truncate font-mono mt-1">{uploadedInfo?.public_id}</p>
                      <p className="text-xs text-emerald-400/70 truncate">{cloudinaryUrl}</p>
                      {uploadedInfo?.duration && <p className="text-xs text-zinc-400 mt-1">{uploadedInfo.duration}s • {uploadedInfo.width}x{uploadedInfo.height} • {formatBytes(uploadedInfo.bytes)}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="text-emerald-300" onClick={() => window.open(cloudinaryUrl, "_blank")}><Eye className="h-3.5 w-3.5" /> Preview</Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {state === "done" ? (
                <>
                  <Button variant="secondary" className="flex-1" onClick={reset}>Upload another</Button>
                  <Button className="flex-1 bg-white text-zinc-900" onClick={() => (window.location.href = "/library")}>Go to library</Button>
                </>
              ) : state === "uploading" || state === "signing" || state === "saving" ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={cancel}><X className="h-4 w-4" /> Cancel</Button>
                  <Button disabled className="flex-1"><Loader2 className="h-4 w-4 animate-spin" /> {state === "uploading" ? "Uploading..." : state === "signing" ? "Signing..." : "Saving..."}</Button>
                </>
              ) : state === "error" || state === "cancelled" ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={reset}>Pick another</Button>
                  <Button className="flex-1" onClick={retry}><RotateCcw className="h-4 w-4" /> Retry upload</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" className="flex-1" onClick={reset}>Cancel</Button>
                  <Button className="flex-1 bg-white text-zinc-900" onClick={() => startUpload(file)}>Upload to Cloudinary</Button>
                </>
              )}
            </div>

            {cloudinaryUrl && state === "done" && (
              <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black">
                <video src={cloudinaryUrl} controls className="w-full max-h-64 object-contain" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
