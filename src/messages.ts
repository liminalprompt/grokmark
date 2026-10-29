import type { Verdict } from "./decide";
import type { Bookmark } from "./schema";

/** content -> background */
export type UserHere = { type: "userHere" };
/** popup -> background */
export type RunNow = { type: "runNow" };
/** options -> background */
export type TestLast10 = { type: "testLast10" };
/** background -> content */
export type FetchRequest = { type: "fetchBookmarks"; seen: string[]; maxPages: number; limit?: number };

export type FetchResponse = { ok: true; bookmarks: Bookmark[] } | { ok: false; error: string };

export type TestRow = { bookmark: Bookmark; verdict: Verdict } | { bookmark: Bookmark; error: string };
export type TestResponse = { ok: true; rows: TestRow[] } | { ok: false; error: string };

export type RunResponse = { ok: boolean; message: string };

/** chrome.storage key holding the Bookmarks request learned from X's own page. */
export const LEARNED_KEY = "xBookmarksRequest";

/** Thrown by the content script when it has no learned request; the background reacts to it. */
export const NEEDS_BOOKMARKS_PAGE =
  "Grokmark hasn't seen X load your bookmarks yet. Open x.com/i/bookmarks once in this tab, then try again";
