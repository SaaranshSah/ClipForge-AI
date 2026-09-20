"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { useAuth } from "@/lib/auth-client";

const NICHES = ["general", "gaming", "podcast", "education", "fitness", "finance", "tech", "lifestyle", "comedy"];
const LANGUAGES = [
  { v: "en", l: "English" },
  { v: "es", l: "Spanish" },
  { v: "fr", l: "French" },
  { v: "de", l: "German" },
  { v: "pt", l: "Portuguese" },
  { v: "hi", l: "Hindi" },
];
const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
const CAPTION_STYLES = ["minimal", "bold", "karaoke", "none"];

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // profile
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [niche, setNiche] = useState("general");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  // niche settings
  const [targetDuration, setTargetDuration] = useState(30);
  const [captionStyle, setCaptionStyle] = useState("bold");
  const [captionEnabled, setCaptionEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store", credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setName(data.profile?.name || user?.name || "");
          setBio(data.profile?.bio || "");
          setNiche(data.profile?.niche || data.nicheSettings?.niche || "general");
          setLanguage(data.profile?.language || data.nicheSettings?.language || "en");
          setTimezone(data.profile?.timezone || "UTC");
          setTargetDuration(data.nicheSettings?.targetDuration || 30);
          setCaptionStyle(data.nicheSettings?.captionStyle || "bold");
          setCaptionEnabled(data.nicheSettings?.captionEnabled ?? true);
        } else {
          setName(user?.name || "");
        }
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profile: { name, bio, niche, language, timezone },
          nicheSettings: { niche, targetDuration, captionStyle, captionEnabled, language },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">Profile, niche, language, timezone and clip defaults.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Visible to you only — not shared publicly in V1</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Creator" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="opacity-60" />
              <p className="text-xs text-zinc-500">Email cannot be changed in V1</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do you create?" rows={3} maxLength={500} />
            <p className="text-xs text-zinc-500 text-right">{bio.length}/500</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Workspace preferences</CardTitle>
          <CardDescription>Niche, language and timezone affect defaults and future AI prompts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Niche</Label>
              <Select value={niche} onChange={(e) => setNiche(e.target.value)}>
                {NICHES.map((n) => (
                  <option key={n} value={n} className="bg-zinc-900">
                    {n.charAt(0).toUpperCase() + n.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.v} value={l.v} className="bg-zinc-900">
                    {l.l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} className="bg-zinc-900">
                    {tz}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Clip defaults</CardTitle>
          <CardDescription>Applied to every new clip generation (V2 AI will respect these)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default clip duration</Label>
              <Select value={String(targetDuration)} onChange={(e) => setTargetDuration(Number(e.target.value))}>
                <option value="15" className="bg-zinc-900">15 seconds</option>
                <option value="30" className="bg-zinc-900">30 seconds</option>
                <option value="45" className="bg-zinc-900">45 seconds</option>
                <option value="60" className="bg-zinc-900">60 seconds</option>
                <option value="90" className="bg-zinc-900">90 seconds</option>
              </Select>
              <p className="text-xs text-zinc-500">Vertical Shorts best at 30–45s</p>
            </div>
            <div className="space-y-2">
              <Label>Caption style</Label>
              <Select value={captionStyle} onChange={(e) => setCaptionStyle(e.target.value)}>
                {CAPTION_STYLES.map((s) => (
                  <option key={s} value={s} className="bg-zinc-900">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Separator className="bg-zinc-800" />
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable captions by default</Label>
              <p className="text-xs text-zinc-500">Burn-in captions on generated clips</p>
            </div>
            <Switch checked={captionEnabled} onCheckedChange={setCaptionEnabled} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button onClick={onSave} disabled={saving} className="bg-white text-zinc-900 hover:bg-zinc-100 min-w-[140px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed text-center">
        All writes are authenticated and scoped to your user ID. No cross-account access. Secrets stay server-side.
      </p>
    </div>
  );
}
