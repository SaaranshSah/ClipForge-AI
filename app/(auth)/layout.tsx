import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <header className="h-14 flex items-center px-6 border-b border-zinc-900">
        <Link href="/"><Logo /></Link>
      </header>
      <div className="flex-1 flex">
        {/* Left: form */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        {/* Right: brand panel */}
        <div className="hidden lg:flex flex-1 bg-zinc-900 border-l border-zinc-800 p-10 flex-col justify-between">
          <div />
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Trusted by creators shipping daily
            </div>
            <h2 className="text-2xl font-semibold leading-tight">
              Turn long streams
              <br />
              <span className="text-zinc-400 font-light">into Shorts automatically</span>
            </h2>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              Upload once. ClipForge organizes, prepares, and — in V2 — auto-detects the viral moments.
            </p>
            <div className="mt-8 rounded-2xl border border-zinc-800 bg-[#09090b] p-4">
              <div className="h-2 w-20 bg-zinc-800 rounded mb-3" />
              <div className="space-y-2">
                <div className="h-12 rounded-xl bg-zinc-900 border border-zinc-800" />
                <div className="h-12 rounded-xl bg-zinc-900 border border-zinc-800" />
                <div className="h-12 rounded-xl bg-white text-zinc-900 flex items-center px-4 text-xs font-medium">Direct-upload architecture — no serverless bottleneck</div>
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-600">© {new Date().getFullYear()} ClipForge AI — V1</p>
        </div>
      </div>
    </div>
  );
}
