import { decide, type Verdict } from "./decide";
import { pool, scoreBookmark } from "./clef";
import { shouldRun } from "./gate";
import {
  LEARNED_KEY,
  NEEDS_BOOKMARKS_PAGE,
  type FetchResponse,
  type RunResponse,
  type TestResponse,
  type TestRow,
  type XConnect,
  type XResponse,
} from "./messages";
import type { Bookmark } from "./schema";
import { chooseSource, readBookmarks as readFromSource, xConnected } from "./source";
import {
  acquireLock,
  addSeen,
  get,
  getSettings,
  pushRun,
  releaseLock,
  set,
  type QueueItem,
  type RunLog,
  type Seen,
  type Settings,
} from "./storage";
import { flushQueue, shouldFlush } from "./webhook";
import { connectX, disconnectX, fetchXApiBookmarks } from "./xApi";

const ALARM = "grokmark-check";
const MAX_PAGES = 3;
const CONCURRENCY = 4;

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 30 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 30 }));
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) void runCheck(false);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "userHere") void runCheck(false);
  else if (msg?.type === "runNow") runCheck(true).then(sendResponse);
  else if (msg?.type === "testLast10") testLast10().then(sendResponse);
  else if (msg?.type === "xConnect") xConnect((msg as XConnect).clientId).then(sendResponse);
  else if (msg?.type === "xDisconnect") disconnectX().then(() => sendResponse({ ok: true }));
  else return;
  return true;
});

async function xConnect(clientId: string): Promise<XResponse> {
  try {
    const auth = await connectX(clientId.trim());
    return { ok: true, handle: auth.handle };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function xTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ url: "https://x.com/*" });
  return tabs.find((t) => t.id != null)?.id ?? null;
}

/**
 * Tabs opened before the extension was installed (or reloaded) have no content script yet. We ask the user to
 * reload the tab rather than inject into it, so the extension never needs the "scripting" permission.
 */
async function sendToTab(tabId: number, msg: unknown): Promise<FetchResponse> {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    throw new Error("Couldn't reach your x.com tab. Reload it and try again");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Open X's bookmarks page in a background tab so the content script can learn the request, then close it. */
async function learnViaBackgroundTab(): Promise<void> {
  await chrome.storage.local.remove(LEARNED_KEY);
  const tab = await chrome.tabs.create({ url: "https://x.com/i/bookmarks", active: false });
  try {
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if ((await chrome.storage.local.get(LEARNED_KEY))[LEARNED_KEY]) return;
    }
  } finally {
    if (tab.id != null) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function fetchViaTab(seen: string[], maxPages: number, limit?: number): Promise<Bookmark[]> {
  const tabId = await xTabId();
  if (tabId == null) throw new Error("Open x.com in a tab so Grokmark can read your bookmarks");
  let res = await sendToTab(tabId, { type: "fetchBookmarks", seen, maxPages, limit });
  if (!res.ok && res.error === NEEDS_BOOKMARKS_PAGE) {
    await learnViaBackgroundTab(); // first run, or X changed its request
    res = await sendToTab(tabId, { type: "fetchBookmarks", seen, maxPages, limit });
  }
  if (!res?.ok) throw new Error(res?.error ?? "No answer from the x.com tab (reload it)");
  return res.bookmarks;
}

/** X API (no tab needed) or the x.com session, per setup. See source.ts for when each applies. */
async function readBookmarks(settings: Settings, seen: string[], maxPages: number, limit?: number): Promise<Bookmark[]> {
  const source = chooseSource(settings, await get("xApiAuth"), await get("xApiProblem"));
  return readFromSource(source, {
    api: () => fetchXApiBookmarks(settings.xClientId.trim(), new Set(seen), maxPages, limit),
    session: () => fetchViaTab(seen, maxPages, limit),
  });
}

async function runCheck(force: boolean): Promise<RunResponse> {
  const settings = await getSettings();
  const state = await get("state");
  const xApi = { connected: xConnected(settings, await get("xApiAuth")), problem: await get("xApiProblem") };
  const gate = shouldRun(settings, state, new Date(), force, xApi);
  if (!gate.run) return { ok: false, message: gate.why };
  if (!(await acquireLock())) return { ok: false, message: "A check is already running" };

  const log: RunLog = { startedAt: Date.now(), fetched: 0, scored: 0, vip: 0, keep: 0, archive: 0, sent: 0, errors: [] };
  try {
    const list = settings.vipList!;
    let seen = await get("seen");
    const bookmarks = await readBookmarks(settings, seen.map(([id]) => id), MAX_PAGES);
    log.fetched = bookmarks.length;

    const auth = { accountId: settings.accountId, token: settings.token };
    const results = await pool(bookmarks, CONCURRENCY, async (b) => {
      const v = decide({ ...list, door_policy: settings.doorPolicy }, await scoreBookmark(auth, list, b));
      return { b, v };
    });

    const additions: Seen = [];
    const queue = await get("queue");
    const now = Date.now();
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        log.errors.push(`${bookmarks[i]!.id}: ${(r.reason as Error).message}`);
        return; // not marked seen, retried next check
      }
      const { b, v } = r.value;
      log.scored++;
      log[v.verdict]++;
      additions.push([b.id, { verdict: v.verdict, reason: v.reason, at: now }]);
      if (v.verdict === "vip") queue.push(toQueueItem(b, v, now));
    });

    let remaining: QueueItem[] = queue;
    // Run now sends whatever is queued; the scheduled check waits for a full batch or a day-old item.
    if (force || shouldFlush(queue, settings.doorPolicy.batch_size, now)) {
      const flushed = await flushQueue(queue, settings.routes);
      remaining = flushed.remaining;
      log.sent = flushed.sent;
      log.errors.push(...flushed.errors);
    }

    seen = addSeen(seen, additions);
    await set("seen", seen);
    await set("queue", remaining);
    if (!log.errors.length || log.scored > 0) await set("state", { lastSuccess: Date.now() });
    const waiting = remaining.length ? `, ${remaining.length} waiting${log.errors.length ? ` (${log.errors[0]})` : ""}` : "";
    return { ok: true, message: `Fetched ${log.fetched}, VIP ${log.vip}, keep ${log.keep}, archive ${log.archive}, sent ${log.sent}${waiting}` };
  } catch (e) {
    log.errors.push((e as Error).message);
    return { ok: false, message: (e as Error).message };
  } finally {
    await pushRun(log);
    await releaseLock();
  }
}

function toQueueItem(b: Bookmark, v: Verdict, now: number): QueueItem {
  return {
    id: b.id,
    url: b.url,
    route: v.route!,
    theme: v.themeName!,
    action: v.action!,
    confidence: v.confidence,
    queuedAt: now,
  };
}

/** Options page: score the 10 newest bookmarks (seen or not) without storing or sending anything. */
async function testLast10(): Promise<TestResponse> {
  const settings = await getSettings();
  if (!settings.accountId || !settings.token || !settings.vipList)
    return { ok: false, error: "Add your Cloudflare credentials and a valid VIP List first" };
  try {
    const bookmarks = await readBookmarks(settings, [], 1, 10);
    const list = { ...settings.vipList, door_policy: settings.doorPolicy };
    const auth = { accountId: settings.accountId, token: settings.token };
    const results = await pool(bookmarks, CONCURRENCY, async (b) => decide(list, await scoreBookmark(auth, list, b)));
    const rows: TestRow[] = results.map((r, i) =>
      r.status === "fulfilled"
        ? { bookmark: bookmarks[i]!, verdict: r.value }
        : { bookmark: bookmarks[i]!, error: (r.reason as Error).message },
    );
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
