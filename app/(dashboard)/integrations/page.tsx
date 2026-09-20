"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug2, Youtube, Instagram, ExternalLink, Shield, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Integration = {
  id: string;
  provider: string;
  status: string;
  externalAccountName: string | null;
  connectedAt: string | null;
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch {
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onConnect = (provider: string) => {
    toast.info(`${provider} OAuth arrives in V2`, {
      description: "V1 keeps integrations as placeholder cards. No fake success — real OAuth next.",
    });
  };

  const getStatus = (provider: string) => {
    const i = integrations.find((x) => x.provider === provider);
    return i?.status || "DISCONNECTED";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading integrations...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-zinc-400 mt-1">Connect your publishing destinations. V1 shows honest placeholder states — no faked OAuth.</p>
      </div>

      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 flex gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-amber-200">V1 placeholder mode</p>
          <p className="text-amber-200/70 text-xs mt-1 leading-relaxed">
            Buttons are intentionally disabled from faking a successful connection. The database schema, API contracts and UI are production-ready; OAuth handlers land in V2 with real YouTube and Instagram flows.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* YouTube */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="h-11 w-11 rounded-xl bg-red-600 flex items-center justify-center">
                <Youtube className="h-6 w-6 text-white" />
              </div>
              <Badge variant={getStatus("YOUTUBE") === "CONNECTED" ? "success" : "muted"}>{getStatus("YOUTUBE") === "CONNECTED" ? "Connected" : "Not connected"}</Badge>
            </div>
            <CardTitle className="text-base mt-3">YouTube</CardTitle>
            <CardDescription>Auto-post Shorts, schedule, and sync publishing status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs leading-relaxed text-zinc-400">
              <p className="font-medium text-zinc-300 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                What V2 will request
              </p>
              <p className="mt-1">youtube.upload · youtube.readonly — scoped, revocable, never stored in browser.</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-white text-zinc-900 hover:bg-zinc-100" onClick={() => onConnect("YouTube")}>
                <Plug2 className="h-4 w-4" />
                Connect YouTube
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Connection status is per-user and stored as Integration(provider=YOUTUBE).</p>
          </CardContent>
        </Card>

        {/* Instagram */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 flex items-center justify-center">
                <Instagram className="h-6 w-6 text-white" />
              </div>
              <Badge variant={getStatus("INSTAGRAM") === "CONNECTED" ? "success" : "muted"}>{getStatus("INSTAGRAM") === "CONNECTED" ? "Connected" : "Not connected"}</Badge>
            </div>
            <CardTitle className="text-base mt-3">Instagram</CardTitle>
            <CardDescription>Publish Reels and cross-post clips</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs leading-relaxed text-zinc-400">
              <p className="font-medium text-zinc-300 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                What V2 will request
              </p>
              <p className="mt-1">instagram_content_publish · instagram_basic — via Facebook Graph, business account required.</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-white text-zinc-900 hover:bg-zinc-100" onClick={() => onConnect("Instagram")}>
                <Plug2 className="h-4 w-4" />
                Connect Instagram
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href="https://developers.facebook.com/docs/instagram-api" target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Connection status is per-user and stored as Integration(provider=INSTAGRAM).</p>
          </CardContent>
        </Card>
      </div>

      {/* Third placeholder */}
      <Card className="bg-zinc-900 border-zinc-800 border-dashed">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
            <Plug2 className="h-5 w-5 text-zinc-500" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium">More destinations in V2</p>
            <p className="text-xs text-zinc-500 mt-1">TikTok is already in the Prisma enum (provider=TIKTOK) and ready to activate without schema changes.</p>
          </div>
          <Badge variant="outline" className="sm:ml-auto">Planned</Badge>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm">Developer contract</CardTitle>
          <CardDescription>API shape that V2 OAuth will fulfill</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-xs leading-relaxed space-y-3">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500">GET /api/integrations → list per-user integrations</p>
            <p className="text-zinc-300">{`{ integrations: { provider, status, externalAccountName }[] }`}</p>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 overflow-x-auto">
            <p className="text-zinc-500">POST /api/integrations — (V2) initiates OAuth</p>
            <p className="text-zinc-300">{`{ provider: "YOUTUBE" | "INSTAGRAM" } -> { authUrl }`}</p>
          </div>
          <p className="text-zinc-600 font-sans">Tokens are encrypted at rest, httpOnly, never exposed to the browser. Users can only access their own integrations (where userId = session).</p>
        </CardContent>
      </Card>
    </div>
  );
}
