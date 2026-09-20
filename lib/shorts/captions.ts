// V4 Captions — 4 styles, synchronized, safe areas, readable sizing, emphasis
import type { CaptionStyle } from "./types";

export type CaptionCue = {
  text: string;
  start: number; // seconds in short
  end: number;
  isEmphasis?: boolean;
};

// Style presets — all stay inside safe areas (bottom 18% with side padding), avoid covering gameplay center
export const CAPTION_PRESETS: Record<CaptionStyle, { fontSize: string; styleDesc: string; safeArea: string }> = {
  Clean: {
    fontSize: "text-lg",
    styleDesc: "White text, thin black outline, Inter, center bottom — minimal, high readability",
    safeArea: "bottom-6 left-4 right-4 (safe: avoid center gameplay, keep inside 90% width, 15% bottom margin)",
  },
  Bold: {
    fontSize: "text-xl font-black",
    styleDesc: "Yellow bold, black background box, heavy outline — high contrast, gaming headlines",
    safeArea: "bottom-8 left-6 right-6 (safe: boxed, avoids center, 18% bottom)",
  },
  Gaming: {
    fontSize: "text-lg font-bold",
    styleDesc: "Neon cyan/pink, glitch outline, Rajdhani — highlights important spoken moments in neon",
    safeArea: "bottom-6 left-3 right-3 (safe: neon glow, stays inside safe, avoids center)",
  },
  Minimal: {
    fontSize: "text-sm",
    styleDesc: "Small white, 60% opacity black bar, subtle — least gameplay cover",
    safeArea: "bottom-4 left-8 right-8 (safe: tiny, bottom edge, 12% bottom)",
  },
};

// Generate mock captions from highlight transcription — deterministic, synchronized
export function generateCaptionsForHighlight(opts: {
  highlightType: string;
  duration: number;
  transcript?: string;
  style: CaptionStyle;
  highlightId: string;
  videoId: string;
}): CaptionCue[] {
  const { duration, transcript, style, highlightType } = opts;
  // Deterministic seed from highlightId
  let seed = 0;
  for (let i = 0; i < opts.highlightId.length; i++) seed = (seed * 31 + opts.highlightId.charCodeAt(i)) >>> 0;
  function rand() {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  }

  // Base transcript snippets per type
  const typePhrases: Record<string, string[]> = {
    clutch: ["Let's go! 1v3 clutch!", "No way he hits that!", "Clutch or kick!"],
    win: ["We won! GG!", "Victory is ours!", "Clean win!"],
    funny: ["Haha what was that?", "No way that happened", "LOL look at this fail"],
    fail: ["Oh no! Missed!", "That's a whiff", "Unlucky!"],
    reaction: ["Oh my god!", "What?!", "No way!"],
    high_energy_commentary: ["He's going in! Big play!", "Huge energy! Let's go!", "What a moment!"],
    surprising: ["Wait what?!", "Did you see that?!", "Impossible!"],
    comeback: ["Comeback starts now!", "We can still win!", "Never give up!"],
    impressive_gameplay: ["Insane aim!", "200 IQ play!", "Mechanics!"],
    story_moment: ["This changes everything", "Plot twist!", "History made"],
  };
  const phrases = typePhrases[highlightType] || ["Nice play!", "Let's go!", "What a moment!"];
  const baseText = transcript || phrases[Math.floor(rand() * phrases.length)];

  // Split into 2-4 cues across duration, synchronized
  const cueCount = Math.max(2, Math.min(4, Math.floor(duration / 4) + 1));
  const cues: CaptionCue[] = [];
  const words = baseText.split(" ");
  // Distribute words across cues
  for (let i = 0; i < cueCount; i++) {
    const start = (duration / cueCount) * i + 0.1;
    const end = (duration / cueCount) * (i + 1) - 0.1;
    // Slice words
    const perCue = Math.ceil(words.length / cueCount);
    const slice = words.slice(i * perCue, (i + 1) * perCue).join(" ") || words[0];
    // Decide emphasis for important moments: high audioEnergy or clutch/win -> emphasize 30% cues
    const isEmphasis = rand() < 0.3 && ["clutch", "win", "high_energy_commentary", "comeback"].includes(highlightType);
    const text = isEmphasis && style === "Gaming" ? slice.toUpperCase() + "!" : slice;
    cues.push({ text, start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, isEmphasis });
  }
  return cues;
}

export function cuesToVtt(cues: CaptionCue[]): string {
  let vtt = "WEBVTT\n\n";
  cues.forEach((c, idx) => {
    const fmt = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      const ms = Math.round((sec % 1) * 1000);
      const secInt = Math.floor(sec);
      return `${String(m).padStart(2, "0")}:${String(secInt).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
    };
    vtt += `${idx + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n\n`;
  });
  return vtt;
}

// Validate captions synchronized & inside safe areas (mock check)
export function validateCaptions(cues: CaptionCue[], duration: number): { synchronized: boolean; readable: boolean } {
  let synchronized = true;
  for (const c of cues) {
    if (c.start < 0 || c.end > duration + 0.5 || c.start >= c.end) synchronized = false;
    if (c.text.length === 0 || c.text.length > 80) synchronized = false; // too long unreadable
  }
  // Check overlap: cues should not heavily overlap
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start < cues[i - 1].end - 0.2) synchronized = false;
  }
  const readable = cues.every((c) => c.text.length <= 42); // readable sizing
  return { synchronized, readable };
}
