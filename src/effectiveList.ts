import { parseVipListJson, type VipList } from "./schema";
import { STOCK_VIP_LIST, stockVipListJson } from "./stockRubric";

/** The route every stock theme uses; in basic setup it is the one webhook. */
export const BASIC_ROUTE = "grok_bot";

export type ListInputs = {
  /** Advanced: the user's own VIP List JSON. Empty means use the stock list. */
  vipListJson: string;
  ownerSummary: string;
  watchNames: string[];
  /** Advanced: theme id -> route, overriding the list's own route field. */
  themeRoutes: Record<string, string>;
};

export type EffectiveList =
  | { list: VipList; base: VipList; source: "custom" | "stock" }
  | { list: null; base: null; source: "custom" | "stock"; problem: string };

/**
 * The one place that decides which VIP List Grokmark runs: the user's own JSON when they pasted one,
 * otherwise the stock list built from their sentence and names, with any per-theme route choices applied.
 */
export function effectiveVipList(s: ListInputs): EffectiveList {
  const custom = isStockShaped(s.vipListJson) ? "" : s.vipListJson.trim();
  if (custom) {
    const r = parseVipListJson(custom);
    if (!r.ok) return { list: null, base: null, source: "custom", problem: r.errors.join("; ") };
    return { list: applyRoutes(r.value, s.themeRoutes), base: r.value, source: "custom" };
  }
  if (!s.ownerSummary.trim()) return { list: null, base: null, source: "stock", problem: "Write one sentence about yourself" };
  const r = parseVipListJson(stockVipListJson(s.ownerSummary, s.watchNames));
  if (!r.ok) return { list: null, base: null, source: "stock", problem: r.errors.join("; ") };
  return { list: applyRoutes(r.value, s.themeRoutes), base: r.value, source: "stock" };
}

function applyRoutes(list: VipList, overrides: Record<string, string>): VipList {
  return { ...list, themes: list.themes.map((t) => (overrides[t.id] ? { ...t, route: overrides[t.id]! } : t)) };
}

/** "Jev (TypeSafe's small, fast model), Grok Bot" -> two names; commas inside brackets stay with their name. */
export function splitNames(text: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return [...new Set(out.map((n) => n.trim()).filter(Boolean))];
}

const STOCK_IDS = new Set(["watchlist", ...STOCK_VIP_LIST.themes.map((t) => t.id)]);

/**
 * A pasted list whose themes are all stock themes is the stock list, not the user's own: an older
 * version of the setup page loaded it into the JSON box, and it must not override the sentence and names.
 */
export function isStockShaped(json: string): boolean {
  const text = json.trim();
  if (!text) return false;
  try {
    const parsed = JSON.parse(text) as { themes?: { id?: string }[] };
    return Array.isArray(parsed.themes) && parsed.themes.length > 0 && parsed.themes.every((t) => typeof t?.id === "string" && STOCK_IDS.has(t.id));
  } catch {
    return false;
  }
}
