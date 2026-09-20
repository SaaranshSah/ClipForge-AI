"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Upload,
  FolderOpen,
  Film,
  Settings,
  Plug2,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-client";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/clips", label: "Clip Library", icon: Film },
  { href: "/integrations", label: "Integrations", icon: Plug2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  const NavContent = () => (
    <>
      <div className="flex h-16 items-center gap-2 px-6">
        <Link href="/dashboard" onClick={() => setOpen(false)}>
          <Logo size={32} />
        </Link>
      </div>
      <Separator className="bg-zinc-800" />
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-white text-zinc-900" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 mb-3">
          <p className="text-xs font-medium text-zinc-200 truncate">{user?.name || user?.email || "—"}</p>
          <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-zinc-400">Free plan · V1</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-zinc-400"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
        <p className="mt-4 text-[10px] leading-relaxed text-zinc-600 text-center">
          ClipForge AI V1<br />
          Direct-upload architecture
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800 bg-[#09090b] px-4">
        <Logo />
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:w-[260px] lg:flex-col border-r border-zinc-800 bg-[#09090b]">
        <NavContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative flex w-[300px] flex-col bg-[#09090b] border-r border-zinc-800">
            <NavContent />
          </div>
        </div>
      )}
    </>
  );
}
