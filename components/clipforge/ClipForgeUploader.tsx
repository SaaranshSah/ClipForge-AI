"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { UploadCloud, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska,.mp4,.mov,.avi,.webm,.mkv";
const MAX_BYTES = 2147483648;

type State = "idle" | "firebase-upload" | "clipforge-queue" | "done" | "error";

export function ClipForgeUploader({ onJobCreated }: { onJobCreated?: (jobId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setState("idle");
    setProgress(0);
    setError(null);
    setJobId(null);
    if (inputRef.current) inputRef.current.value = "";
  };

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
    setPreviewUrl(URL.createObjectURL(f));
  };

  const start = async () => {
    if (!file) return;
    setError(null);

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

    const videoId = `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      setState("firebase-upload");
      setProgress(5);

      // 1) Upload to Firebase Storage at users/{uid}/videos/{videoId}/source.mp4
      const storage = getFirebaseStorage();
      const storagePath = `users/${fbUser.uid}/videos/${videoId}/source.mp4`;
      const storageRef = ref(storage, storagePath);

      const task = uploadBytesResumable(storageRef, file, { contentType: file.type || "video/mp4" });

      const downloadUrl: string = await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 80) + 5; // 5-85
            setProgress(pct);
          },
          (err) => reject(err),
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref);
              resolve(url);
            } catch (e: any) {
              reject(e);
            }
          }
        );
      });

      setProgress(85);
      setState("clipforge-queue");

      // 2) Call server-side ClipForge API (project fpq) — never exposes API key
      const res = await fetch("/api/clipforge/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          sourceVideoId: videoId,
          filename: file.name,
          sourceUrl: downloadUrl,
          contentType: file.type,
          fileSize: file.size,
          project: "fpq",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || `ClipForge request failed (${res.status})`;
        const code = data.code || "";
        // Map to user-friendly messages
        if (code === "FILE_TOO_LARGE") throw new Error("File too large for ClipForge (2GB). Compress and retry.");
        if (code === "UNSUPPORTED_FILE") throw new Error("Unsupported file type. Use MP4/MOV/WebM.");
        if (code === "UNAUTHORIZED") throw new Error("Invalid ClipForge API key. Check server env CLIPFORGE_API_KEY.");
        if (code === "RATE_LIMIT") throw new Error("ClipForge rate limit — wait and retry.");
        if (code === "DUPLICATE_JOB") throw new Error("A job for this video is already processing.");
        throw new Error(msg);
      }

      const jid = data.clipforgeJobId || data.job?.clipforgeJobId || data.jobId;
      setJobId(jid);
      setProgress(100);
      setState("done");
      toast.success("Video sent to ClipForge (project fpq) — processing started");
      onJobCreated?.(jid);

      // Firestore will have job; dashboard polling will show status
    } catch (e: any) {
      console.error("[clipforge] upload error", e);
      let msg = e.message || "Upload failed";
      if (msg.includes("storage/unauthorized")) msg = "Firebase Storage unauthorized — check Storage rules for users/{uid}/videos/**";
      if (msg.includes("network")) msg = "Network failure — retry.";
      setError(msg);
      setState("error");
      toast.error(msg);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white text-zinc-900 flex items-center justify-center">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">ClipForge — Project <Badge variant="secondary" className="ml-2">fpq</Badge></CardTitle>
            <CardDescription>Firebase Storage → secure server ClipForge API → Firestore → Dashboard</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!file ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950 p-8 py-10 text-center"
          >
            <p className="text-sm font-medium text-white">Drag & drop for ClipForge (fpq)</p>
            <p className="text-xs text-zinc-500 mt-1">MP4/MOV/WebM up to 2GB → Firebase Storage → ClipForge</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => inputRef.current?.click()} className="bg-white text-zinc-900">Browse for ClipForge</Button>
            </div>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <p className="text-[11px] text-zinc-600 mt-3">Flow: Firebase Auth → Storage (users/&#123;uid&#125;/videos/...) → server ClipForge (project fpq) → jobs in Firestore → clips in Storage → dashboard</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {previewUrl ? <video src={previewUrl} className="h-20 w-32 rounded-lg bg-black object-cover" muted /> : <div className="h-20 w-32 rounded-lg bg-zinc-800" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{formatBytes(file.size)} • {file.type}</p>
                <p className="text-xs text-zinc-500 mt-1">Project: <span className="font-mono text-zinc-300">fpq</span> • Storage: <span className="font-mono">users/&#123;uid&#125;/videos/...</span></p>
              </div>
              {state === "idle" && (
                <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={error ? "text-red-400" : "text-zinc-400"}>
                  {state === "idle" && "Ready — will upload to Firebase Storage then ClipForge"}
                  {state === "firebase-upload" && `Uploading to Firebase — ${progress}%`}
                  {state === "clipforge-queue" && "Creating ClipForge job (server-side, secure)..."}
                  {state === "done" && "Sent to ClipForge — see Jobs below"}
                  {state === "error" && "Failed"}
                </span>
                <span className="text-zinc-500">{progress}%</span>
              </div>
              <Progress value={progress} />
              {error && (
                <div className="flex gap-2 rounded-lg bg-red-950/50 border border-red-900 p-3 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}
              {state === "done" && jobId && (
                <div className="rounded-lg bg-emerald-950/30 border border-emerald-900 p-3 text-sm text-emerald-300">
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5" />
                    <div>
                      <p className="font-medium">Job created: {jobId}</p>
                      <p className="text-xs text-emerald-400/70">Project fpq • Check Jobs panel or dashboard for status (queued → processing → completed)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {state === "done" ? (
                <>
                  <Button variant="secondary" className="flex-1" onClick={reset}>Upload another</Button>
                  <Button className="flex-1 bg-white text-zinc-900" onClick={() => (window.location.href = "/dashboard")}>Go to dashboard</Button>
                </>
              ) : state === "firebase-upload" || state === "clipforge-queue" ? (
                <Button disabled className="flex-1"><Loader2 className="h-4 w-4 animate-spin" /> {state === "firebase-upload" ? "Uploading..." : "Queuing..."}</Button>
              ) : state === "error" ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={reset}>Try again</Button>
                  <Button className="flex-1" onClick={start}>Retry</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" className="flex-1" onClick={reset}>Cancel</Button>
                  <Button className="flex-1 bg-white text-zinc-900" onClick={start}>Upload to ClipForge</Button>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
