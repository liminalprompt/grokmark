"use strict";
(() => {
  // src/messages.ts
  var LEARNED_KEY = "xBookmarksRequest";
  var NEEDS_BOOKMARKS_PAGE = "Grokmark hasn't seen X load your bookmarks yet. Open x.com/i/bookmarks once in this tab, then try again";

  // src/fetchBookmarks.ts
  var BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  function parseBookmarksUrl(url) {
    const m = url.match(/\/graphql\/([^/?]+)\/Bookmarks\?(.*)$/);
    if (!m?.[1]) return null;
    const params = new URLSearchParams(m[2]);
    const features = params.get("features");
    if (!features) return null;
    let variables = {};
    try {
      variables = JSON.parse(params.get("variables") ?? "{}");
    } catch {
      return null;
    }
    return { queryId: m[1], variables, features, fieldToggles: params.get("fieldToggles") ?? void 0 };
  }
  function learnFromPage() {
    const entries = performance.getEntriesByType("resource");
    for (let i = entries.length - 1; i >= 0; i--) {
      const learned = parseBookmarksUrl(entries[i].name);
      if (learned) return learned;
    }
    return null;
  }
  async function learnedRequest() {
    const fresh = learnFromPage();
    if (fresh) {
      await chrome.storage.local.set({ [LEARNED_KEY]: fresh });
      return fresh;
    }
    const stored = (await chrome.storage.local.get(LEARNED_KEY))[LEARNED_KEY];
    return stored ?? null;
  }
  function watchForBookmarksRequest() {
    const save = (name) => {
      const learned = parseBookmarksUrl(name);
      if (learned) void chrome.storage.local.set({ [LEARNED_KEY]: learned });
    };
    performance.getEntriesByType("resource").forEach((e) => save(e.name));
    new PerformanceObserver((list) => list.getEntries().forEach((e) => save(e.name))).observe({ type: "resource", buffered: true });
  }
  function csrf() {
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    if (!m?.[1]) throw new Error("Not logged in to X (no ct0 cookie)");
    return m[1];
  }
  function unwrap(result) {
    return result?.tweet ?? result;
  }
  function tweetToBookmark(result) {
    const t = unwrap(result);
    if (!t?.legacy) return null;
    const user = unwrap(t.core?.user_results?.result);
    const handle = user?.core?.screen_name ?? user?.legacy?.screen_name ?? "i";
    const name = user?.core?.name ?? user?.legacy?.name ?? handle;
    const id = t.rest_id ?? t.legacy.id_str;
    const text = t.note_tweet?.note_tweet_results?.result?.text ?? t.legacy.full_text ?? "";
    const media = t.legacy.extended_entities?.media ?? t.legacy.entities?.media ?? [];
    const quoted = unwrap(t.quoted_status_result?.result);
    return {
      id,
      url: `https://x.com/${handle}/status/${id}`,
      authorHandle: handle,
      authorName: name,
      text,
      createdAt: new Date(t.legacy.created_at).toISOString(),
      imageUrls: media.filter((m) => m.type === "photo").map((m) => m.media_url_https).slice(0, 4),
      quotedText: quoted?.note_tweet?.note_tweet_results?.result?.text ?? quoted?.legacy?.full_text
    };
  }
  function findInstructions(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6) return null;
    const obj = node;
    if (Array.isArray(obj.instructions)) return obj.instructions;
    for (const v of Object.values(obj)) {
      const hit = findInstructions(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  function parseTimeline(json) {
    const instructions = findInstructions(json?.data);
    if (!instructions) {
      const keys = Object.keys(json?.data ?? json ?? {}).join(", ") || "none";
      const err = json?.errors?.[0]?.message;
      throw new Error(`X returned bookmarks in an unexpected shape (top-level keys: ${keys}${err ? `; error: ${err}` : ""})`);
    }
    const bookmarks = [];
    let cursor = null;
    for (const ins of instructions) {
      for (const entry of ins.entries ?? []) {
        const c = entry.content;
        if (c?.cursorType === "Bottom") cursor = c.value ?? null;
        const b = tweetToBookmark(c?.itemContent?.tweet_results?.result);
        if (b) bookmarks.push(b);
      }
    }
    return { bookmarks, cursor };
  }
  async function fetchPage(req, cursor) {
    const variables = { ...req.variables, count: 20 };
    if (cursor) variables.cursor = cursor;
    else delete variables.cursor;
    const url = `https://x.com/i/api/graphql/${req.queryId}/Bookmarks?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(req.features)}` + (req.fieldToggles ? `&fieldToggles=${encodeURIComponent(req.fieldToggles)}` : "");
    const res = await fetch(url, {
      credentials: "include",
      headers: {
        authorization: `Bearer ${BEARER}`,
        "x-csrf-token": csrf(),
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en"
      }
    });
    if (res.status === 400 || res.status === 404) {
      await chrome.storage.local.remove(LEARNED_KEY);
      throw new Error(NEEDS_BOOKMARKS_PAGE);
    }
    if (!res.ok) throw new Error(`X bookmarks HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  async function fetchBookmarks(seen, maxPages = 3, limit = Infinity) {
    const req = await learnedRequest();
    if (!req) throw new Error(NEEDS_BOOKMARKS_PAGE);
    const out = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
      const { bookmarks, cursor: next } = parseTimeline(await fetchPage(req, cursor));
      const fresh = bookmarks.filter((b) => !seen.has(b.id));
      out.push(...fresh);
      if (out.length >= limit || !fresh.length || !next || next === cursor) break;
      cursor = next;
    }
    return out.slice(0, limit);
  }

  // src/content.ts
  watchForBookmarksRequest();
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "fetchBookmarks") return;
    fetchBookmarks(new Set(msg.seen), msg.maxPages, msg.limit).then((bookmarks) => ({ ok: true, bookmarks })).catch((e) => ({ ok: false, error: e.message })).then(sendResponse);
    return true;
  });
  chrome.runtime.sendMessage({ type: "userHere" }).catch(() => {
  });
})();
//# sourceMappingURL=content.js.map
