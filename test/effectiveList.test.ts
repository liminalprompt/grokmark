import { describe, expect, it } from "vitest";
import { BASIC_ROUTE, effectiveVipList, isStockShaped, splitNames } from "../src/effectiveList";
import { stockVipListJson } from "../src/stockRubric";
import { vipList } from "./fixtures/vipList";

const base = { vipListJson: "", ownerSummary: "", watchNames: [] as string[], themeRoutes: {} };

describe("effectiveVipList", () => {
  it("needs a sentence before the stock list can run", () => {
    const r = effectiveVipList(base);
    expect(r.list).toBeNull();
    expect(r.source).toBe("stock");
  });

  it("builds the stock list from the sentence and names, all on the basic route", () => {
    const r = effectiveVipList({ ...base, ownerSummary: "I build things.", watchNames: ["Jev (a model)"] });
    expect(r.source).toBe("stock");
    expect(r.list?.themes[0]?.id).toBe("watchlist");
    expect(r.list?.themes.every((t) => t.route === BASIC_ROUTE)).toBe(true);
  });

  it("prefers the user's own JSON and applies route overrides without touching the base", () => {
    const r = effectiveVipList({ ...base, vipListJson: JSON.stringify(vipList), themeRoutes: { agents: "mine" } });
    expect(r.source).toBe("custom");
    expect(r.list?.themes.find((t) => t.id === "agents")?.route).toBe("mine");
    expect(r.base?.themes.find((t) => t.id === "agents")?.route).toBe("grok_build");
  });

  it("reports why custom JSON cannot be used", () => {
    const r = effectiveVipList({ ...base, vipListJson: "{" });
    expect(r.list).toBeNull();
    expect(r.list === null && r.problem).toMatch(/Not valid JSON/);
  });
});

describe("isStockShaped", () => {
  it("treats a pasted stock list as empty so the sentence and names win", () => {
    const json = stockVipListJson("old sentence");
    expect(isStockShaped(json)).toBe(true);
    const r = effectiveVipList({ ...base, vipListJson: json, ownerSummary: "new sentence", watchNames: ["Jev (a model)"] });
    expect(r.source).toBe("stock");
    expect(r.list?.themes[0]?.id).toBe("watchlist");
    expect(isStockShaped(JSON.stringify(vipList))).toBe(false);
    expect(isStockShaped("{")).toBe(false);
  });
});

describe("splitNames", () => {
  it("splits on commas outside brackets, trims and dedupes", () => {
    expect(splitNames("Jev (TypeSafe's small, fast model), Grok Bot ,Grok Bot,")).toEqual(["Jev (TypeSafe's small, fast model)", "Grok Bot"]);
  });
});
