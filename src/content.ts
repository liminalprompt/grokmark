import { fetchBookmarks, watchForBookmarksRequest } from "./fetchBookmarks";
import type { FetchRequest, FetchResponse, UserHere } from "./messages";

// Remember how X's own app asks for bookmarks (see fetchBookmarks.ts).
watchForBookmarksRequest();

chrome.runtime.onMessage.addListener((msg: FetchRequest, _sender, sendResponse) => {
  if (msg?.type !== "fetchBookmarks") return;
  fetchBookmarks(new Set(msg.seen), msg.maxPages, msg.limit)
    .then((bookmarks): FetchResponse => ({ ok: true, bookmarks }))
    .catch((e): FetchResponse => ({ ok: false, error: (e as Error).message }))
    .then(sendResponse);
  return true; // async response
});

// "User is here": the background decides whether a check is due.
chrome.runtime.sendMessage({ type: "userHere" } satisfies UserHere).catch(() => {});
