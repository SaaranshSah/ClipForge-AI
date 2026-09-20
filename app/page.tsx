import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  UploadCloud,
  Scissors,
  Captions,
  Calendar,
  BarChart3,
  Play,
  ArrowRight,
  Check,
  Zap,
  Shield,
  Layers,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-white selection:text-zinc-900">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-900">
        <div className="mx-auto max-w-[1160px] flex h-14 items-center justify-between px-6">
          <Logo size={30} />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm" className="bg-white text-zinc-900 hover:bg-zinc-100 rounded-full px-5">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1160px] px-6 pt-16 sm:pt-24 pb-10">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-6 bg-zinc-900 border-zinc-800 text-zinc-300 gap-1.5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            VERSION 1 — Foundation live
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-semibold tracking-tight leading-[1.05] text-balance">
            Turn long streams
            <br />
            <span className="font-light text-zinc-400">into Shorts automatically</span>
          </h1>
          <p className="mt-5 text-[15px] sm:text-base leading-relaxed text-zinc-400 max-w-xl mx-auto text-balance">
            Upload your streams. ClipForge carves them into vertical, captioned, ready-to-publish Shorts.
            Direct-upload architecture, private by default, built for creators who ship daily.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto bg-white text-zinc-900 hover:bg-zinc-100 rounded-full px-8 h-11 text-sm font-medium">
              <Link href="/signup">
                Start clipping free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-full px-8 h-11 border-zinc-800 hover:bg-zinc-900">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">No credit card · 2GB uploads · Signed-URL infrastructure</p>

          {/* Hero mock */}
          <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900 p-2 sm:p-3 shadow-2xl">
            <div className="rounded-xl overflow-hidden border border-zinc-800 bg-[#0a0a0a]">
              <div className="flex items-center gap-1.5 px-4 h-9 border-b border-zinc-800 bg-zinc-900/50">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <span className="ml-3 text-xs text-zinc-500 font-mono">clipforge.ai/dashboard</span>
                <span className="ml-auto text-[11px] text-zinc-500">V1 Preview</span>
              </div>
              <div className="grid sm:grid-cols-[200px_1fr] gap-0 text-left">
                <div className="hidden sm:block border-r border-zinc-800 p-4 space-y-2 bg-[#09090b]">
                  <div className="h-2 w-24 bg-zinc-800 rounded" />
                  <div className="space-y-2 pt-2">
                    {["Dashboard", "Upload", "Projects", "Clips"].map((l) => (
                      <div key={l} className="h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center px-3 text-xs text-zinc-500">
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { k: "Total videos", v: "—" },
                      { k: "Clips generated", v: "—" },
                      { k: "Processing", v: "—" },
                    ].map((s) => (
                      <div key={s.k} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                        <p className="text-[11px] text-zinc-500">{s.k}</p>
                        <p className="text-lg font-semibold mt-1">{s.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-900/50 p-6 flex flex-col items-center text-center">
                    <UploadCloud className="h-7 w-7 text-zinc-600 mb-2" />
                    <p className="text-sm font-medium">Drop your stream here</p>
                    <p className="text-xs text-zinc-500">Direct to object storage · 2GB max</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-600">Dashboard preview — realistic empty states, no fake data.</p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-[1160px] px-6 py-14">
        <div className="mx-auto max-w-2xl text-center mb-10">
          <Badge variant="outline" className="mb-3">Features — V1 Foundation</Badge>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Everything for the clip workflow</h2>
          <p className="mt-3 text-sm text-zinc-400">V1 ships the foundation: upload, organize, and prepare. AI clipping and auto-posting land in V2.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: UploadCloud,
              title: "Direct uploads",
              desc: "Signed URLs stream straight to S3/R2. Huge files never hit serverless. Cancellable, resumable-ready.",
            },
            {
              icon: Scissors,
              title: "Clip library",
              desc: "Cards with thumbnails, duration, source and status. Ready for AI extraction in V2.",
            },
            {
              icon: Layers,
              title: "Projects",
              desc: "Search, filter, status and duration at a glance. Your streams, organized.",
            },
            {
              icon: Captions,
              title: "Caption prefs",
              desc: "Default duration, caption style, language and timezone — saved per workspace.",
            },
            {
              icon: Calendar,
              title: "Scheduling (prep)",
              desc: "DB and UI ready. Scheduler and queue activate in V2.",
            },
            {
              icon: Shield,
              title: "Private & secure",
              desc: "Auth’d routes, scoped data, no secrets in browser, validated uploads.",
            },
          ].map((f) => (
            <Card key={f.title} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-6">
                <div className="h-9 w-9 rounded-lg bg-white text-zinc-900 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-medium text-sm">{f.title}</h3>
                <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-zinc-900 bg-zinc-900/30">
        <div className="mx-auto max-w-[1160px] px-6 py-14">
          <div className="mx-auto max-w-2xl text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 text-sm text-zinc-400">Three steps today, automation tomorrow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "01", title: "Upload your stream", desc: "Drag & drop or browse. We validate, mint a signed URL, and your browser streams directly to storage.", icon: UploadCloud },
              { n: "02", title: "We organize & prepare", desc: "Videos land in Projects with status, duration and processing jobs. Clip cards await generation.", icon: Layers },
              { n: "03", title: "Publish when ready", desc: "V1 gets you organized. V2 adds AI clip detection, captions and one-click YouTube/Instagram.", icon: Sparkles },
            ].map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-zinc-800 bg-[#09090b] p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-mono text-zinc-500 border border-zinc-800 rounded-full px-2 py-1">{s.n}</span>
                  <s.icon className="h-4 w-4 text-zinc-500" />
                </div>
                <h3 className="font-medium">{s.title}</h3>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Card className="bg-amber-950/20 border-amber-900/50 max-w-xl">
              <CardContent className="p-4 flex gap-3 text-sm">
                <Zap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-amber-200/90 leading-relaxed">
                  <span className="font-medium">V1 scope:</span> No auto-posting, no creator scraping, no advanced analytics yet. We ship a rock-solid foundation so V2 can be pure AI velocity.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats / trust */}
      <section className="mx-auto max-w-[1160px] px-6 py-12">
        <div className="grid sm:grid-cols-3 gap-4 text-center">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
            <p className="text-2xl font-semibold">2GB</p>
            <p className="text-xs text-zinc-500 mt-1">Max upload per file</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
            <p className="text-2xl font-semibold">Signed URLs</p>
            <p className="text-xs text-zinc-500 mt-1">Direct-to-bucket architecture</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
            <p className="text-2xl font-semibold">Netlify-ready</p>
            <p className="text-xs text-zinc-500 mt-1">Frontend + API + DB separate</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1160px] px-6 pb-14">
        <div className="rounded-2xl border border-zinc-800 bg-white text-zinc-900 p-8 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Ready to forge your first Short?</h3>
            <p className="text-sm text-zinc-600 mt-1">Create an account, upload a stream, and watch your Projects fill.</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> No fake data</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Empty states</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Scoped to your account</li>
            </ul>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button asChild size="lg" className="bg-zinc-900 text-white hover:bg-zinc-800 rounded-full">
              <Link href="/signup">Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full border-zinc-300">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-[1160px] px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={24} />
            <Separator orientation="vertical" className="h-4 bg-zinc-800" />
            <span className="text-xs text-zinc-500">© {new Date().getFullYear()} ClipForge AI · V1 Foundation</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="hidden sm:inline">Built with Next.js · Prisma · PostgreSQL</span>
            <span className="hidden sm:inline">·</span>
            <Link href="/login" className="hover:text-zinc-300">Login</Link>
            <Link href="/signup" className="hover:text-zinc-300">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
