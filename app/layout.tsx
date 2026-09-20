import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-client";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "ClipForge AI — Turn long streams into Shorts automatically",
    template: "%s | ClipForge AI",
  },
  description:
    "AI stream-clipping platform. Upload long videos, generate viral Shorts automatically. Premium dark SaaS for creators.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "ClipForge AI",
    description: "Turn long streams into Shorts automatically",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans bg-[#09090b] text-zinc-100 antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
