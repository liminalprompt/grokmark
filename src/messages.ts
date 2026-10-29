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

/** options -> background: sign in to X's official API with the user's own app */
export type XConnect = { type: "xConnect"; clientId: string };
/** options -> background: forget the X API tokens */
export type XDisconnect = { type: "xDisconnect" };
export type XResponse = { ok: true; handle?: string } | { ok: false; error: string };

/** The X API sign-in is gone (refresh refused or token rejected). Lets a run fall back to the session path. */
export class XAuthError extends Error {}

export const X_EXPIRED = "X API sign-in expired — click Connect X again";
export const X_NOT_CONNECTED = "API only is on, but X isn't connected. Open setup, then Advanced, and click Connect X";

/** chrome.storage key holding the Bookmarks request learned from X's own page. */
export const LEARNED_KEY = "xBookmarksRequest";

/** Thrown by the content script when it has no learned request; the background reacts to it. */
export const NEEDS_BOOKMARKS_PAGE =
  "Grokmark hasn't seen X load your bookmarks yet. Open x.com/i/bookmarks once in this tab, then try again";
