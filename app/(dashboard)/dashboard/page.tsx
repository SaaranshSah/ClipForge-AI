import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Video, Scissors, CalendarClock, CheckCircle2, Loader2, Plug2, ArrowUpRight, UploadCloud, Film } from "lucide-react";
import { formatBytes, timeAgo } from "@/lib/utils";
import { DashboardClipForgeCard } from "@/components/clipforge/DashboardClipForgeCard";
import { DashboardCloudinaryCard } from "@/components/cloudinary/DashboardCloudinaryCard";
import { SyncingCard } from "@/components/dashboard/SyncingCard";

export const dynamic = "force-dynamic";

async function getStats(userId: string) {
  const [totalVideos, clipsGenerated, scheduledClips, publishedClips, processingJobs, recentClips, recentVideos, integrations] = await Promise.all([
    prisma.video.count({ where: { userId } }),
    prisma.clip.count({ where: { userId } }),
    prisma.clip.count({ where: { userId, status: "READY" } }), // placeholder for scheduled
    prisma.clip.count({ where: { userId, status: "READY" } }),
    prisma.processingJob.count({ where: { userId, status: { in: ["QUEUED", "RUNNING"] } } }),
    prisma.clip.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5, include: { video: { select: { filename: true } } } }),
    prisma.video.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.integration.findMany({ where: { userId } }),
  ]);
  return { totalVideos, clipsGenerated, scheduledClips, publishedClips, processingJobs, recentClips, recentVideos, integrations };
}

function StatCard({ title, value, subtitle, icon: Icon, href }: { title: string; value: string | number; subtitle: string; icon: any; href?: string }) {
  const content = (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
            <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Icon className="h-4 w-4 text-zinc-300" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

export default async function DashboardPage() {
  const session = await getSessionUser();
  // If session is null but Firebase marker allowed layout to render (refresh race),
  // gracefully show empty dashboard instead of crashing. Client will re-sync JWT shortly.
  if (!session) {
    const stats = {
      totalVideos: 0,
      clipsGenerated: 0,
      scheduledClips: 0,
      publishedClips: 0,
      processingJobs: 0,
      recentClips: [] as any[],
      recentVideos: [] as any[],
      integrations: [] as any[],
    };
    const connectedCount = 0;
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-zinc-400 mt-1">Syncing your session — dashboard will populate shortly.</p>
          </div>
          <Button asChild className="bg-white text-zinc-900 hover:bg-zinc-100 shrink-0">
            <Link href="/upload">
              <UploadCloud className="h-4 w-4" />
              Upload stream
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard title="Total videos" value={stats.totalVideos} subtitle="Uploaded streams" icon={Video} href="/projects" />
          <StatCard title="Clips generated" value={stats.clipsGenerated} subtitle="Across all videos" icon={Scissors} href="/clips" />
          <StatCard title="Scheduled clips" value={stats.scheduledClips} subtitle="Queued for publish (V2)" icon={CalendarClock} />
          <StatCard title="Published clips" value={stats.publishedClips} subtitle="Ready to share" icon={CheckCircle2} href="/clips" />
        </div>
        <SyncingCard />
      </div>
    );
  }
  const userId = session.id;
  let stats;
  try {
    stats = await getStats(userId);
  } catch (e) {
    // DB not configured/migrated yet — show empty states without crashing
    stats = {
      totalVideos: 0,
      clipsGenerated: 0,
      scheduledClips: 0,
      publishedClips: 0,
      processingJobs: 0,
      recentClips: [] as any[],
      recentVideos: [] as any[],
      integrations: [] as any[],
    };
  }

  const connectedCount = stats.integrations.filter((i: any) => i.status === "CONNECTED").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">Welcome back — here&apos;s what&apos;s happening in your workspace.</p>
        </div>
        <Button asChild className="bg-white text-zinc-900 hover:bg-zinc-100 shrink-0">
          <Link href="/upload">
            <UploadCloud className="h-4 w-4" />
            Upload stream
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total videos" value={stats.totalVideos} subtitle="Uploaded streams" icon={Video} href="/projects" />
        <StatCard title="Clips generated" value={stats.clipsGenerated} subtitle="Across all videos" icon={Scissors} href="/clips" />
        <StatCard title="Scheduled clips" value={stats.scheduledClips} subtitle="Queued for publish (V2)" icon={CalendarClock} />
        <StatCard title="Published clips" value={stats.publishedClips} subtitle="Ready to share" icon={CheckCircle2} href="/clips" />
      </div>

      {/* Cloudinary — V2 primary + ClipForge — project fpq */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <DashboardCloudinaryCard />
        <DashboardClipForgeCard />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Processing jobs */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Processing jobs</CardTitle>
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-zinc-700">
                <Loader2 className={`h-3 w-3 mr-1 ${stats.processingJobs > 0 ? "animate-spin" : ""}`} />
                {stats.processingJobs} active
              </Badge>
            </div>
            <CardDescription>Transcode, thumbnail, clip extraction</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.processingJobs === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-center">
                <div className="mx-auto h-9 w-9 rounded-lg bg-zinc-900 flex items-center justify-center mb-2">
                  <Loader2 className="h-4 w-4 text-zinc-600" />
                </div>
                <p className="text-sm font-medium">No jobs running</p>
                <p className="text-xs text-zinc-500 mt-1">Upload a video to start a processing job. Jobs will appear here with progress.</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/upload">Upload video</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">{stats.processingJobs} job(s) in queue/running</p>
                <Link href="/projects" className="text-xs text-white hover:underline inline-flex items-center gap-1">
                  View in Projects <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent clips */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Recent clips</CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link href="/clips">View all</Link>
              </Button>
            </div>
            <CardDescription>Latest generated clips</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentClips.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-center">
                <div className="mx-auto h-9 w-9 rounded-lg bg-zinc-900 flex items-center justify-center mb-2">
                  <Film className="h-4 w-4 text-zinc-600" />
                </div>
                <p className="text-sm font-medium">No clips yet</p>
                <p className="text-xs text-zinc-500 mt-1">Clips will appear here after you upload and process a video. No fake data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentClips.map((clip: any) => (
                  <div key={clip.id} className="flex gap-3 rounded-lg border border-zinc-800 p-3 bg-zinc-950">
                    <div className="h-14 w-20 rounded-md bg-zinc-800 shrink-0 flex items-center justify-center">
                      <Film className="h-5 w-5 text-zinc-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{clip.title || "Untitled clip"}</p>
                      <p className="text-xs text-zinc-500 truncate">{clip.video.filename} • {clip.status}</p>
                      <p className="text-xs text-zinc-600">{timeAgo(clip.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connected platforms */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Connected platforms</CardTitle>
              <Badge variant={connectedCount > 0 ? "success" : "muted"}>{connectedCount} connected</Badge>
            </div>
            <CardDescription>YouTube, Instagram — V1 placeholder states</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: "YouTube", provider: "YOUTUBE", desc: "Auto-post Shorts (V2)" },
              { name: "Instagram", provider: "INSTAGRAM", desc: "Reels publishing (V2)" },
            ].map((p) => {
              const integ = stats.integrations.find((i: any) => i.provider === p.provider);
              const isConnected = integ?.status === "CONNECTED";
              return (
                <div key={p.provider} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      <Plug2 className="h-4 w-4 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.desc}</p>
                    </div>
                  </div>
                  <Badge variant={isConnected ? "success" : "muted"} className="shrink-0">
                    {isConnected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              );
            })}
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/integrations">Manage integrations</Link>
            </Button>
            <p className="text-[11px] text-zinc-600 leading-relaxed">V1 shows placeholder states only. We never fake a successful OAuth connection. V2 will add real YouTube/Instagram OAuth.</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent videos strip */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent uploads</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/projects">View projects</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stats.recentVideos.length === 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-950 p-6">
              <div className="h-12 w-12 rounded-xl bg-zinc-900 flex items-center justify-center shrink-0">
                <Video className="h-6 w-6 text-zinc-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-sm font-medium">No videos uploaded yet</p>
                <p className="text-xs text-zinc-500 mt-1">Your streams will appear here with status, duration and clip counts. Upload your first video to get started.</p>
              </div>
              <Button asChild className="sm:ml-auto bg-white text-zinc-900 hover:bg-zinc-100">
                <Link href="/upload">Upload now</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentVideos.map((v: any) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 p-3 bg-zinc-950">
                  <div className="h-10 w-10 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                    <Video className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{v.filename}</p>
                    <p className="text-xs text-zinc-500">{v.status} • {v.fileSize ? formatBytes(v.fileSize) : "—"} • {timeAgo(v.createdAt)}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{v.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col sm:flex-row gap-3 text-xs text-zinc-500">
        <span className="font-medium text-zinc-300">Architecture note</span>
        <Separator orientation="vertical" className="hidden sm:block h-4 bg-zinc-800" />
        <span>Frontend (Next.js) · API (Next API + FastAPI worker) · DB (Postgres/Prisma) · Storage (S3/R2 via signed URLs) — cleanly separated, Netlify-compatible.</span>
      </div>
    </div>
  );
}
