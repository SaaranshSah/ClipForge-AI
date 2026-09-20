// V4 Metadata — auto-generate title/description/hashtags/keywords, no virality claims
import type { HighlightType } from "@/lib/highlights/types";

export type ShortMetadata = {
  title: string; // short, punchy, <70 chars
  description: string; // 1-2 lines, no guaranteed virality
  hashtags: string[]; // 3-5
  keywords: string[]; // 3-5 for SEO
};

// Generate metadata from highlight — deterministic, no virality guarantee language
export function generateMetadataForHighlight(opts: {
  highlightType: HighlightType;
  score: number;
  signals?: Record<string, number>;
  captionStyle: string;
  duration: number;
  highlightId: string;
}): ShortMetadata {
  const { highlightType, score } = opts;
  // Deterministic seed for variety but consistent per highlight
  let seed = 0;
  for (let i = 0; i < opts.highlightId.length; i++) seed = (seed * 31 + opts.highlightId.charCodeAt(i)) >>> 0;
  function pick<T>(arr: T[]): T {
    seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
    return arr[(seed >>> 0) % arr.length];
  }

  const titles: Record<string, string[]> = {
    clutch: ["1v3 Clutch That Shouldn't Have Worked", "Clutch Under Pressure", "The Clutch Everyone's Talking About"],
    win: ["Clean Win — Watch the Finish", "How We Closed the Game", "Winning Play Breakdown"],
    funny: ["This Fail Had Me Laughing", "When Timing Goes Wrong 😂", "Funny Moment You Missed"],
    fail: ["That Miss Hurt to Watch", "Close But Not Quite", "Fail That Became a Lesson"],
    reaction: ["His Reaction Says It All", "Pure Reaction Moment", "When It Hits Different"],
    high_energy_commentary: ["Hype Commentary + Insane Play", "Energy Through the Roof", "Commentary Made This Moment"],
    surprising: ["Did That Really Happen?!", "Most Surprising Play", "You Won't Believe This"],
    comeback: ["The Comeback Started Here", "From Behind to Ahead", "Comeback Complete"],
    impressive_gameplay: ["Mechanics Check — Watch Closely", "200 IQ Play", "Aim That Breaks the Game"],
    story_moment: ["The Moment That Changed the Game", "Story Twist In-Game", "This Play Mattered"],
  };
  const descs: Record<string, string[]> = {
    clutch: ["Caught this clutch in a recent game. Clean execution under pressure.", "One vs three, no panic — just focus."],
    win: ["Closing the game with good teamwork. Full match highlights on channel.", "Win secured — here's the final play."],
    funny: ["Timing was everything and it went wrong in the funniest way.", "We had to clip this — too good not to share."],
    fail: ["Not every play works out — this one taught us something.", "Tough miss, but worth reviewing."],
    reaction: ["Genuine reaction to an unexpected moment.", "When the game surprises you."],
    high_energy_commentary: ["High-energy call paired with high-energy play.", "Audio and action lined up perfectly here."],
    surprising: ["Unexpected and unscripted — that's gaming.", "Surprise factor was high on this one."],
    comeback: ["Down but not out — momentum shifted here.", "Comeback logic: stay calm, play together."],
    impressive_gameplay: ["Focus on the mechanics — timing and placement.", "Clean execution worth a second look."],
    story_moment: ["Context matters — this play shifted the story.", "Small moment, big impact."],
  };

  const titlePool = titles[highlightType] || ["Gaming Highlight Worth Watching", "Moment From the Game"];
  const descPool = descs[highlightType] || ["Gaming moment worth sharing.", "Clip from a recent session."];

  const title = pick(titlePool);
  // Ensure title <70 chars
  const finalTitle = title.length > 65 ? title.slice(0, 62) + "..." : title;

  const description = pick(descPool) + ` • Score ${score}/100 • ${opts.duration}s • No virality claims, just a good moment.`;

  // Hashtags: relevant, not spammy, 3-5
  const baseHashtags: Record<string, string[]> = {
    clutch: ["#Clutch", "#Gaming", "#FPS"],
    win: ["#Gaming", "#Win", "#Gameplay"],
    funny: ["#GamingFails", "#FunnyGaming", "#Clip"],
    fail: ["#Gaming", "#Fail", "#Learn"],
    reaction: ["#Reaction", "#Gaming", "#Moments"],
    high_energy_commentary: ["#Gaming", "#Hype", "#Commentary"],
    surprising: ["#Gaming", "#Surprise", "#Clip"],
    comeback: ["#Comeback", "#Gaming", "#Clutch"],
    impressive_gameplay: ["#Gaming", "#Mechanics", "#Aim"],
    story_moment: ["#Gaming", "#Story", "#Highlights"],
  };
  const hashtags = (baseHashtags[highlightType] || ["#Gaming", "#Highlights", "#Clip"]).slice(0, 3);
  // Add generic but relevant
  if (hashtags.length < 4) hashtags.push("#Shorts");
  if (hashtags.length < 5 && score > 80) hashtags.push("#GamingShorts");

  const keywords = [highlightType.replace(/_/g, " "), "gaming highlight", "short", ...(hashtags.map((h) => h.replace("#", "").toLowerCase()).slice(0, 2))];

  return { title: finalTitle, description, hashtags, keywords: [...new Set(keywords)].slice(0, 5) };
}
