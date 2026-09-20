// V3 Gaming Highlights — scoring system
// Uses 7 signals: actionIntensity, audioEnergy, emotionalReaction, eventImportance, context, uniqueness, viewerInterest
// Deterministic mock that simulates ClipForge analysis — no real ML, but structure matches real ClipForge results.

import type { HighlightSignals, HighlightType } from "./types";
import { ALL_HIGHLIGHT_TYPES } from "./types";

export type CandidateSegment = {
  startTime: number;
  endTime: number;
  rawType: HighlightType;
  signals: HighlightSignals;
  // optional transcript/context snippet from ClipForge
  transcriptSnippet?: string;
};

// Weights tuned for gaming highlights — high-energy commentary & clutches score higher for viral potential
const WEIGHTS: Record<keyof HighlightSignals, number> = {
  actionIntensity: 0.22,
  audioEnergy: 0.18,
  emotionalReaction: 0.15,
  eventImportance: 0.20,
  context: 0.08,
  uniqueness: 0.07,
  viewerInterest: 0.10,
};

export function scoreSignals(signals: HighlightSignals): number {
  let total = 0;
  (Object.keys(WEIGHTS) as (keyof HighlightSignals)[]).forEach((k) => {
    total += (signals[k] / 100) * WEIGHTS[k] * 100;
  });
  // Bonus for balanced high scores (no zero-signal highlight)
  const minSignal = Math.min(...Object.values(signals));
  if (minSignal > 60) total += 5;
  if (minSignal > 75) total += 5;
  return Math.min(100, Math.round(total));
}

export function confidenceFromScore(score: number, signals: HighlightSignals): number {
  // High score + low variance => higher confidence
  const vals = Object.values(signals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
  const std = Math.sqrt(variance);
  // std low => confidence higher
  let conf = 0.5 + (score / 100) * 0.4 - (std / 100) * 0.3;
  conf = Math.max(0.35, Math.min(0.98, conf));
  return Math.round(conf * 100) / 100;
}

export function reasonForHighlight(type: HighlightType, signals: HighlightSignals, score: number): string {
  const topSignal = (Object.entries(signals) as [keyof HighlightSignals, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const topValue = signals[topSignal];
  const map: Record<HighlightType, string> = {
    clutch: `Clutch moment — ${topSignal} ${topValue}/100, score ${score}: isolated 1vX with comeback`,
    win: `Win — eventImportance ${signals.eventImportance}/100, viewerInterest ${signals.viewerInterest}/100`,
    funny: `Funny moment — emotionalReaction ${signals.emotionalReaction}/100 + audioEnergy ${signals.audioEnergy}/100`,
    fail: `Fail — surprising ${signals.uniqueness}/100, chat would clip`,
    reaction: `Reaction — emotionalReaction ${signals.emotionalReaction}/100, audio spike ${signals.audioEnergy}/100`,
    high_energy_commentary: `High-energy commentary — audioEnergy ${signals.audioEnergy}/100, action ${signals.actionIntensity}/100`,
    surprising: `Surprising event — uniqueness ${signals.uniqueness}/100, context ${signals.context}/100`,
    comeback: `Comeback — eventImportance ${signals.eventImportance}/100, context ${signals.context}/100`,
    impressive_gameplay: `Impressive gameplay — actionIntensity ${signals.actionIntensity}/100, viewerInterest ${signals.viewerInterest}/100`,
    story_moment: `Story moment — context ${signals.context}/100, eventImportance ${signals.eventImportance}/100`,
  };
  return map[type] || `${type} — top signal ${topSignal} ${topValue}`;
}

// Generate mock candidates from ClipForge-like analysis
// In production, this would parse ClipForge's transcript/timestamps/audio waveform
export function generateMockCandidates(videoDuration: number, opts?: { seed?: string }): CandidateSegment[] {
  // Deterministic pseudo-random based on seed/duration so same video gives same highlights
  const seedStr = opts?.seed || `clipforge_fpq_${Math.round(videoDuration)}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;

  function rand(): number {
    // xorshift
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  }

  const count = Math.max(6, Math.min(15, Math.floor(videoDuration / 25) + 5));
  const candidates: CandidateSegment[] = [];

  for (let i = 0; i < count; i++) {
    const type = ALL_HIGHLIGHT_TYPES[Math.floor(rand() * ALL_HIGHLIGHT_TYPES.length)];
    // Random segment 8-25s, not overlapping too much
    const dur = 8 + Math.floor(rand() * 18);
    const maxStart = Math.max(0, videoDuration - dur - 2);
    const start = Math.floor(rand() * maxStart);
    const end = start + dur;

    // Generate signals — bias by type
    const base = 45 + rand() * 35;
    const signals: HighlightSignals = {
      actionIntensity: clamp(base + (["clutch", "impressive_gameplay", "win"].includes(type) ? 15 : 0) + (rand() * 10 - 5)),
      audioEnergy: clamp(base + (["high_energy_commentary", "reaction", "clutch"].includes(type) ? 18 : 0) + (rand() * 10 - 5)),
      emotionalReaction: clamp(base + (["reaction", "funny", "fail", "surprising"].includes(type) ? 16 : 0) + (rand() * 12 - 6)),
      eventImportance: clamp(base + (["win", "clutch", "comeback", "story_moment"].includes(type) ? 20 : 0) + (rand() * 10 - 5)),
      context: clamp(base + (["story_moment", "comeback"].includes(type) ? 12 : 0) + (rand() * 10 - 5)),
      uniqueness: clamp(30 + rand() * 50 + (["surprising", "funny", "fail"].includes(type) ? 15 : 0)),
      viewerInterest: clamp(base + 5 + rand() * 10),
    };

    candidates.push({
      startTime: start,
      endTime: end,
      rawType: type,
      signals,
      transcriptSnippet: `Mock ClipForge transcript for ${type} at ${start}s — "${["Let's go!", "No way!", "Clutch!", "What a play!", "Haha"][Math.floor(rand() * 5)]}"`,
    });
  }

  // Sort by startTime
  candidates.sort((a, b) => a.startTime - b.startTime);

  // De-duplicate overlapping candidates: keep higher scoring if overlap >50%
  const filtered: CandidateSegment[] = [];
  for (const c of candidates) {
    const overlap = filtered.find((f) => Math.max(0, Math.min(f.endTime, c.endTime) - Math.max(f.startTime, c.startTime)) > Math.min(f.endTime - f.startTime, c.endTime - c.startTime) * 0.5);
    if (!overlap) filtered.push(c);
  }

  return filtered;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Score and select best highlights
export type ScoredHighlight = CandidateSegment & {
  score: number;
  confidence: number;
  reason: string;
};

export function scoreAndSelectHighlights(candidates: CandidateSegment[], opts?: { topK?: number; minScore?: number }): ScoredHighlight[] {
  const minScore = opts?.minScore ?? 58;
  const topK = opts?.topK ?? 5;

  const scored: ScoredHighlight[] = candidates
    .map((c) => {
      const score = scoreSignals(c.signals);
      return {
        ...c,
        score,
        confidence: confidenceFromScore(score, c.signals),
        reason: reasonForHighlight(c.rawType, c.signals, score),
      };
    })
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score);

  // Select topK but ensure diversity: at least 2 types if possible
  const selected: ScoredHighlight[] = [];
  const usedTypes = new Set<HighlightType>();
  for (const c of scored) {
    if (selected.length >= topK) break;
    // Prefer new types early
    if (selected.length < 2 || !usedTypes.has(c.rawType) || selected.length >= 3) {
      selected.push(c);
      usedTypes.add(c.rawType);
    }
  }
  // If still under topK, fill remaining
  if (selected.length < topK) {
    for (const c of scored) {
      if (selected.includes(c)) continue;
      selected.push(c);
      if (selected.length >= topK) break;
    }
  }

  // Re-sort selected by timeline order for pleasant UX
  selected.sort((a, b) => a.startTime - b.startTime);
  return selected;
}
