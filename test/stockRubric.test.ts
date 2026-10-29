import { describe, expect, it } from "vitest";
import { parseVipListJson, validateVipList } from "../src/schema";
import { OWNER_PLACEHOLDER, STOCK_VIP_LIST, stockVipListJson, watchlistTheme } from "../src/stockRubric";

describe("stock VIP List", () => {
  it("passes the schema", () => {
    const r = validateVipList(JSON.parse(JSON.stringify(STOCK_VIP_LIST)));
    expect(r.ok).toBe(true);
  });

  it("keeps questions short, one idea each", () => {
    for (const q of [...STOCK_VIP_LIST.themes, ...STOCK_VIP_LIST.skip_rules]) {
      expect(q.question.length).toBeLessThan(130);
      expect(q.question).not.toMatch(/\band\b.*\bor\b.*\?$/i);
    }
  });

  it("carries the user's own sentence into the JSON, else the placeholder", () => {
    const mine = parseVipListJson(stockVipListJson("  I build X things.  "));
    expect(mine.ok && mine.value.owner_summary).toBe("I build X things.");
    const blank = parseVipListJson(stockVipListJson(""));
    expect(blank.ok && blank.value.owner_summary).toBe(OWNER_PLACEHOLDER);
  });
  it("puts the names to watch first and stays within 8 themes", () => {
    const r = parseVipListJson(stockVipListJson("me", [" Jev", "Grok Bot", "Jev", ""]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.themes).toHaveLength(8);
    expect(r.value.themes[0]).toMatchObject({ id: "watchlist", question: "Is this post about any of these: Jev, Grok Bot?" });
    expect(r.value.value.instructions).toContain("names I follow");
    expect(r.value.owner_summary).toBe("me Names I follow: Jev, Grok Bot.");
    expect(watchlistTheme(["", " "])).toBeNull();
  });
});
