// V4 Editing — subtle, not over-edit
// Vertical conversion 1080x1920, smart crop, preserve gameplay, avoid black bars, maintain quality, normalize audio

export type EditingPreset = {
  verticalConversion: boolean;
  smartCrop: boolean;
  avoidBlackBars: boolean;
  maintainQuality: boolean;
  smartZoom: boolean;
  cuts: number;
  transitions: "cut" | "fade" | "none";
  audioNormalized: boolean;
  audioExists: boolean;
  speechUnderstandable: boolean;
  // Details for UI
  cropFocus: string; // e.g. "center gameplay, top 60% for action"
  zoomLevel: string; // e.g. "1.1x subtle"
};

// Determine editing based on highlight type and signals — subtle, not over-edit
export function getEditingForHighlight(opts: {
  highlightType: string;
  duration: number;
  signals?: Record<string, number>;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}): EditingPreset {
  const { highlightType, duration } = opts;
  // Smart crop: 9:16 vertical, preserve important gameplay/action
  // Source is typically 1920x1080 (16:9) -> crop to 608x1080 then scale to 1080x1920? Actually we need to simulate.
  // For gaming, focus on center where action is, avoid cutting HUD/minimap? Keep center 60%.
  const isHighAction = ["clutch", "impressive_gameplay", "win", "comeback"].includes(highlightType);
  const isReaction = ["reaction", "funny", "fail"].includes(highlightType);

  return {
    verticalConversion: true, // always 1080x1920
    smartCrop: true, // smart subject/gameplay framing
    avoidBlackBars: true, // crop not letterbox
    maintainQuality: true, // keep source quality, upscale with lanczos
    smartZoom: isHighAction, // subtle 1.1x zoom on important moments
    cuts: duration > 15 ? 1 : 0, // simple cuts only if useful
    transitions: duration > 18 ? "fade" : "cut", // simple, not over-edit
    audioNormalized: true, // normalize to -14 LUFS for Shorts
    audioExists: true, // will be verified in quality check
    speechUnderstandable: true, // keep speech clear, duck bg
    cropFocus: isReaction ? "face cam + center gameplay (picture-in-picture safe)" : "center gameplay, preserve top 60% action, bottom safe for captions",
    zoomLevel: isHighAction ? "1.08x subtle emphasis on action" : "1.0x (no zoom, preserve framing)",
  };
}

export function describeEditing(preset: EditingPreset): string {
  const parts = [
    `9:16 vertical 1080×1920, smart crop (${preset.cropFocus})`,
    preset.avoidBlackBars ? "avoid black bars (crop-to-fill)" : "letterbox",
    preset.maintainQuality ? "maintain source quality" : "re-encode",
    preset.smartZoom ? `smart zoom ${preset.zoomLevel}` : "no zoom",
    preset.cuts > 0 ? `${preset.cuts} cut(s)` : "no extra cuts",
    `transition: ${preset.transitions}`,
    preset.audioNormalized ? "audio normalized (-14 LUFS)" : "audio raw",
  ];
  return parts.join(" • ");
}
