// The only file that knows how X's web app loads bookmarks. If X changes, fix it here.
// Runs in the x.com content script so the logged-in session cookies apply.
//
// X rotates its GraphQL query ids and feature flags, so instead of hard-coding them we
// copy them from X's own Bookmarks request: the page makes one whenever the user opens
// x.com/i/bookmarks, and we read it back from the browser's resource timing.
import { LEARNED_KEY, NEEDS_BOOKMARKS_PAGE } from "./messages";
import type { Bookmark } from "./schema";

// Public bearer token shipped in X's own web client.
const BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A Bookmarks request as X's own app made it. */
export type LearnedRequest = {
  queryId: string;
  variables: Record<string, unknown>;
  features: string; // JSON string, copied verbatim
  fieldToggles?: string;
};

/** Parse a `.../graphql/<id>/Bookmarks?variables=...&features=...` URL. */
export function parseBookmarksUrl(url: string): LearnedRequest | null {
  const m = url.match(/\/graphql\/([^/?]+)\/Bookmarks\?(.*)$/);
  if (!m?.[1]) return null;
  const params = new URLSearchParams(m[2]);
  const features = params.get("features");
  if (!features) return null;
  let variables: Record<string, unknown> = {};
  try {
    variables = JSON.parse(params.get("variables") ?? "{}");
  } catch {
    return null;
  }
  return { queryId: m[1], variables, features, fieldToggles: params.get("fieldToggles") ?? undefined };
}

/** Look through the page's own network history for X's Bookmarks request. */
export function learnFromPage(): LearnedRequest | null {
  const entries = performance.getEntriesByType("resource");
  for (let i = entries.length - 1; i >= 0; i--) {
    const learned = parseBookmarksUrl(entries[i]!.name);
    if (learned) return learned;
  }
  return null;
}

async function learnedRequest(): Promise<LearnedRequest | null> {
  const fresh = learnFromPage();
  if (fresh) {
    await chrome.storage.local.set({ [LEARNED_KEY]: fresh });
    return fresh;
  }
  const stored = (await chrome.storage.local.get(LEARNED_KEY))[LEARNED_KEY] as LearnedRequest | undefined;
  return stored ?? null;
}

/** Start watching so a Bookmarks request made later is remembered too. */
export function watchForBookmarksRequest(): void {
  const save = (name: string) => {
    const learned = parseBookmarksUrl(name);
    if (learned) void chrome.storage.local.set({ [LEARNED_KEY]: learned });
  };
  performance.getEntriesByType("resource").forEach((e) => save(e.name));
  new PerformanceObserver((list) => list.getEntries().forEach((e) => save(e.name))).observe({ type: "resource", buffered: true });
}

function csrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
  if (!m?.[1]) throw new Error("Not logged in to X (no ct0 cookie)");
  return m[1];
}

function unwrap(result: J | undefined): J | undefined {
  return result?.tweet ?? result; // TweetWithVisibilityResults wraps the tweet
}

export function tweetToBookmark(result: J | undefined): Bookmark | null {
  const t = unwrap(result);
  if (!t?.legacy) return null;
  const user = unwrap(t.core?.user_results?.result);
  const handle: string = user?.core?.screen_name ?? user?.legacy?.screen_name ?? "i";
  const name: string = user?.core?.name ?? user?.legacy?.name ?? handle;
  const id: string = t.rest_id ?? t.legacy.id_str;
  const text: string = t.note_tweet?.note_tweet_results?.result?.text ?? t.legacy.full_text ?? "";
  const media: J[] = t.legacy.extended_entities?.media ?? t.legacy.entities?.media ?? [];
  const quoted = unwrap(t.quoted_status_result?.result);
  return {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    authorHandle: handle,
    authorName: name,
    text,
    createdAt: new Date(t.legacy.created_at).toISOString(),
    imageUrls: media.filter((m) => m.type === "photo").map((m) => m.media_url_https as string).slice(0, 4),
    quotedText: quoted?.note_tweet?.note_tweet_results?.result?.text ?? quoted?.legacy?.full_text,
  };
}

/** Find the first `instructions` array anywhere under `data`, so a renamed timeline key still works. */
function findInstructions(node: unknown, depth = 0): J[] | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  const obj = node as J;
  if (Array.isArray(obj.instructions)) return obj.instructions;
  for (const v of Object.values(obj)) {
    const hit = findInstructions(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Parse one timeline response into bookmarks plus the next-page cursor. */
export function parseTimeline(json: J): { bookmarks: Bookmark[]; cursor: string | null } {
  const instructions = findInstructions(json?.data);
  if (!instructions) {
    const keys = Object.keys(json?.data ?? json ?? {}).join(", ") || "none";
    const err = json?.errors?.[0]?.message;
    throw new Error(`X returned bookmarks in an unexpected shape (top-level keys: ${keys}${err ? `; error: ${err}` : ""})`);
  }
  const bookmarks: Bookmark[] = [];
  let cursor: string | null = null;
  for (const ins of instructions) {
    for (const entry of (ins.entries ?? []) as J[]) {
      const c = entry.content;
      if (c?.cursorType === "Bottom") cursor = c.value ?? null;
      const b = tweetToBookmark(c?.itemContent?.tweet_results?.result);
      if (b) bookmarks.push(b);
    }
  }
  return { bookmarks, cursor };
}

async function fetchPage(req: LearnedRequest, cursor: string | null): Promise<J> {
  const variables: Record<string, unknown> = { ...req.variables, count: 20 };
  if (cursor) variables.cursor = cursor;
  else delete variables.cursor;
  const url =
    `https://x.com/i/api/graphql/${req.queryId}/Bookmarks` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(req.features)}` +
    (req.fieldToggles ? `&fieldToggles=${encodeURIComponent(req.fieldToggles)}` : "");
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      authorization: `Bearer ${BEARER}`,
      "x-csrf-token": csrf(),
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en",
    },
  });
  if (res.status === 400 || res.status === 404) {
    // X rotated its query id or flags: forget what we learned so it gets re-learned.
    await chrome.storage.local.remove(LEARNED_KEY);
    throw new Error(NEEDS_BOOKMARKS_PAGE);
  }
  if (!res.ok) throw new Error(`X bookmarks HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Newest first. Stops when a whole page is already seen, there is no next page,
 * or maxPages is reached. `limit` caps the number returned (used by "Test on last 10").
 */
export async function fetchBookmarks(seen: Set<string>, maxPages = 3, limit = Infinity): Promise<Bookmark[]> {
  const req = await learnedRequest();
  if (!req) throw new Error(NEEDS_BOOKMARKS_PAGE);
  const out: Bookmark[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const { bookmarks, cursor: next } = parseTimeline(await fetchPage(req, cursor));
    const fresh = bookmarks.filter((b) => !seen.has(b.id));
    out.push(...fresh);
    if (out.length >= limit || !fresh.length || !next || next === cursor) break;
    cursor = next;
  }
  return out.slice(0, limit);
}
