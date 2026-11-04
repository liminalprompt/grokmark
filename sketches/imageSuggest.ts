/**
 * DRAFT FOR DISCUSSION. NOT PRODUCTION-READY. NOT WIRED INTO THE EXTENSION.
 *
 * Image suggestions with the same Clef pattern Grokmark uses for bookmarks:
 * paste blog post text, ask Clef-flash one yes-or-no question per "visual angle",
 * keep the three angles with the highest P(yes), and search a free image API
 * (Pexels here) with each winning angle's search phrase.
 *
 * It lives outside src/ on purpose: nothing imports it, the extension build and dist/ are unchanged,
 * and the network allowlist test (test/network.test.ts) still holds, since Pexels is not an extension host.
 * It reuses callClef() from ../src/clef.ts for the Workers AI call and retries.
 */
import { callClef, type ClefAuth, type ClefRequest } from "../src/clef";

/** One visual angle: a single-idea yes-or-no question plus the phrase to search for if it wins. */
export type VisualAngle = {
  id: string;
  question: string;
  instructions: string;
  /** Base search phrase. TODO: let the post's own nouns refine it (see refineQuery). */
  query: string;
};

// TODO: tune these on real posts, like the stock VIP List. Keep questions short and single-idea;
// Clef-flash scores those well and long ones badly.
export const STOCK_ANGLES: VisualAngle[] = [
  { id: "dashboard", question: "Would a screenshot of a dashboard or app screen illustrate this post?", instructions: "Yes for posts about software, analytics, metrics or a tool's interface.", query: "analytics dashboard screen" },
  { id: "abstract", question: "Would an abstract illustration fit this post better than a photo?", instructions: "Yes for conceptual posts about ideas, strategy or AI in general.", query: "abstract technology illustration" },
  { id: "person_working", question: "Is a photo of someone working at a desk or laptop the right vibe?", instructions: "Yes for posts about productivity, workflows or a day in the life.", query: "person working on laptop" },
  { id: "team", question: "Is this post about people working together or a team?", instructions: "Yes for posts about hiring, collaboration, meetings or customers.", query: "team meeting collaboration" },
  { id: "code", question: "Would a close-up of code on a screen illustrate this post?", instructions: "Yes for developer how-tos, repos or programming topics.", query: "code on screen" },
  { id: "data_chart", question: "Is this post centered on numbers, results or a chart?", instructions: "Yes when the post leads with metrics, benchmarks or growth figures.", query: "chart graph data" },
  { id: "product", question: "Is this post about a physical product or a store?", instructions: "Yes for e-commerce, packaging, retail or shopping posts.", query: "product photography ecommerce" },
  { id: "nature_calm", question: "Would a calm outdoor or nature scene suit this post's tone?", instructions: "Yes for posts about rest, burnout, focus or slowing down.", query: "calm nature landscape" },
];

/** Clef request builder: same shape as buildRequest() in ../clef.ts, one noul question per angle. */
export function buildAngleRequest(postText: string, angles: VisualAngle[] = STOCK_ANGLES): ClefRequest {
  const questions: ClefRequest["questions"] = {};
  for (const a of angles) questions[`angle.${a.id}`] = { type: "noul", instructions: `${a.question} ${a.instructions}` };
  // TODO: cap or summarize long posts before sending (Clef input limits, cost).
  return { model: "clef-flash", state: { post: { text: postText.slice(0, 8000) } }, questions };
}

/** Pull P(yes) per angle out of Clef's answers. TODO: share the parsing helper with parseResponse(). */
export function parseAngles(raw: unknown, angles: VisualAngle[] = STOCK_ANGLES): Record<string, number> {
  const body = (raw as { result?: unknown })?.result ?? raw;
  const answers = ((body as { answers?: Record<string, unknown> })?.answers ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const a of angles) {
    const ans = answers[`angle.${a.id}`];
    out[a.id] = typeof ans === "number" ? ans : typeof (ans as { noul?: unknown })?.noul === "number" ? (ans as { noul: number }).noul : 0;
  }
  return out;
}

// TODO: calibrate. Grokmark's themes use 0.3 (on-topic posts land around 0.3 to 0.6).
export const ANGLE_MIN = 0.3;

/** Scoring: the top three angles above ANGLE_MIN, highest P(yes) first. Falls back to the top three if fewer pass. */
export function pickTopAngles(probs: Record<string, number>, angles: VisualAngle[] = STOCK_ANGLES, n = 3): VisualAngle[] {
  const ranked = [...angles].sort((a, b) => (probs[b.id] ?? 0) - (probs[a.id] ?? 0));
  const passing = ranked.filter((a) => (probs[a.id] ?? 0) > ANGLE_MIN);
  return (passing.length >= n ? passing : ranked).slice(0, n);
}

/** TODO: add one or two of the post's own key nouns so results match the topic, not just the vibe. */
export function refineQuery(angle: VisualAngle, _postText: string): string {
  return angle.query;
}

export type ImageResult = { angle: string; query: string; url: string; pageUrl: string; photographer: string };

/**
 * Image API call: Pexels search (free key, attribution requested).
 * TODO: Unsplash as an alternative; add caching and rate limits before any public endpoint.
 */
export async function searchPexels(apiKey: string, query: string): Promise<{ url: string; pageUrl: string; photographer: string } | null> {
  const res = await fetch(`https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=${encodeURIComponent(query)}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { photos?: { src: { large: string }; url: string; photographer: string }[] };
  const p = data.photos?.[0];
  return p ? { url: p.src.large, pageUrl: p.url, photographer: p.photographer } : null;
}

/** The whole path: post text in, up to three image suggestions out. */
export async function suggestImages(clef: ClefAuth, pexelsKey: string, postText: string): Promise<ImageResult[]> {
  const probs = parseAngles(await callClef(clef, buildAngleRequest(postText)));
  const top = pickTopAngles(probs);
  const results: ImageResult[] = [];
  for (const a of top) {
    const query = refineQuery(a, postText);
    const hit = await searchPexels(pexelsKey, query);
    if (hit) results.push({ angle: a.id, query, ...hit });
  }
  // TODO: dedupe identical photos across angles; expose as an MCP tool (e.g. suggest_images) on a Worker.
  return results;
}
