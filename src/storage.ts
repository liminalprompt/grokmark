import { effectiveVipList } from "./effectiveList";
import { DEFAULT_DOOR_POLICY, type DoorPolicy, type Label, type VipList } from "./schema";

export type Route = { route: string; url: string; key: string };

export type Settings = {
  accountId: string;
  token: string;
  routes: Route[];
  /** Basic setup: one sentence about the user and the names they follow; the stock list is built from these. */
  ownerSummary: string;
  watchNames: string[];
  /** Advanced: the user's own VIP List JSON (empty = stock) and per-theme route choices. */
  vipListJson: string;
  themeRoutes: Record<string, string>;
  /** The list Grokmark runs. Computed by getSettings from the fields above; what is stored is ignored. */
  vipList: VipList | null;
  doorPolicy: DoorPolicy;
  labels: Label[];
  /** Advanced: the user's own X developer app, for the optional official X API mode. Empty = session path only. */
  xClientId: string;
  /** Advanced: with the X API connected, never fall back to the logged-in x.com session. */
  xApiOnly: boolean;
};

/** OAuth tokens for the official X API. Kept under their own key so saving settings never touches them. */
export type XAuth = {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  userId?: string;
  handle?: string;
};

export type SeenEntry = { verdict: "vip" | "keep" | "archive"; reason?: string; at: number };
export type Seen = [id: string, entry: SeenEntry][];

export type QueueItem = {
  id: string;
  url: string;
  route: string;
  theme: string;
  action: string;
  confidence: number;
  queuedAt: number;
};

export type RunLog = {
  startedAt: number;
  fetched: number;
  scored: number;
  vip: number;
  keep: number;
  archive: number;
  sent: number;
  errors: string[];
};

export type State = { lastSuccess: number | null };

export const SEEN_CAP = 5000;
export const RUNS_CAP = 20;
export const LOCK_STALE_MS = 15 * 60 * 1000;

export const DEFAULT_SETTINGS: Settings = {
  accountId: "",
  token: "",
  routes: [],
  ownerSummary: "",
  watchNames: [],
  vipListJson: "",
  themeRoutes: {},
  vipList: null,
  doorPolicy: DEFAULT_DOOR_POLICY,
  labels: [],
  xClientId: "",
  xApiOnly: false,
};

type Keys = {
  xApiAuth: XAuth | null;
  /** Why the X API needs the user's attention (e.g. sign-in expired); empty when fine. */
  xApiProblem: string;
  settings: Settings;
  seen: Seen;
  queue: QueueItem[];
  runs: RunLog[];
  lock: { runningSince: number | null };
  state: State;
};

const FALLBACK: Keys = {
  xApiAuth: null,
  xApiProblem: "",
  settings: DEFAULT_SETTINGS,
  seen: [],
  queue: [],
  runs: [],
  lock: { runningSince: null },
  state: { lastSuccess: null },
};

export async function get<K extends keyof Keys>(key: K): Promise<Keys[K]> {
  const out = await chrome.storage.local.get(key);
  return (out[key] as Keys[K] | undefined) ?? FALLBACK[key];
}

export async function set<K extends keyof Keys>(key: K, value: Keys[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS, ...(await get("settings")) };
  return { ...s, vipList: effectiveVipList(s).list, doorPolicy: { ...DEFAULT_DOOR_POLICY, ...s.doorPolicy } };
}

export function addSeen(seen: Seen, additions: Seen): Seen {
  const byId = new Map(seen);
  for (const [id, e] of additions) {
    byId.delete(id);
    byId.set(id, e);
  }
  const all = [...byId];
  return all.length > SEEN_CAP ? all.slice(all.length - SEEN_CAP) : all;
}

export async function pushRun(run: RunLog): Promise<void> {
  const runs = await get("runs");
  await set("runs", [...runs, run].slice(-RUNS_CAP));
}

/** Take the run lock; returns false if a fresh lock is held. */
export async function acquireLock(now = Date.now()): Promise<boolean> {
  const { runningSince } = await get("lock");
  if (runningSince && now - runningSince < LOCK_STALE_MS) return false;
  await set("lock", { runningSince: now });
  return true;
}

export async function releaseLock(): Promise<void> {
  await set("lock", { runningSince: null });
}
