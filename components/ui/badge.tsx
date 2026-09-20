import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-white text-zinc-900",
        secondary: "border-transparent bg-zinc-800 text-zinc-100",
        destructive: "border-transparent bg-red-600 text-white",
        outline: "text-zinc-300 border-zinc-700",
        success: "border-transparent bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
        warning: "border-transparent bg-amber-500/15 text-amber-400 border-amber-500/20",
        muted: "border-zinc-800 bg-zinc-900 text-zinc-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
