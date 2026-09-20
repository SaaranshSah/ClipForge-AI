import { cn } from "@/lib/utils";

export function Logo({ className, showText = true, size = 28 }: { className?: string; showText?: boolean; size?: number }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="flex items-center justify-center rounded-lg bg-white text-zinc-900 font-bold tracking-tighter shrink-0"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* Geometric mark: CF monogram */}
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <path d="M6 4 L14 4 L10 12 L18 12 L6 20 L10 12 L2 12 Z" fill="currentColor" />
        </svg>
      </div>
      {showText && (
        <span className="text-[15px] font-semibold tracking-tight text-white leading-none">
          ClipForge <span className="font-light text-zinc-400">AI</span>
        </span>
      )}
    </div>
  );
}
