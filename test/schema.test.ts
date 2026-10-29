import { describe, expect, it } from "vitest";
import { addLabel, checkAccountId, parseVipListJson, validateVipList } from "../src/schema";
import { vipList } from "./fixtures/vipList";

const clone = () => JSON.parse(JSON.stringify(vipList));

describe("validateVipList", () => {
  it("accepts the fixture and fills door policy defaults", () => {
    const r = validateVipList(clone());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.door_policy.cooldown_hours).toBe(4);
  });

  it("rejects bad ids, with a readable path", () => {
    const l = clone();
    l.themes[0].id = "has space";
    const r = validateVipList(l);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.errors[0]).toMatch(/themes\[0\]\.id/);
  });

  it("rejects duplicate ids, too few themes, and a last level not named vip", () => {
    const l = clone();
    l.skip_rules[1].id = l.skip_rules[0].id;
    l.themes = l.themes.slice(0, 2);
    l.value.levels[2].name = "gold";
    const r = validateVipList(l);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/used twice/);
      expect(r.errors.join("\n")).toMatch(/3 to 8/);
      expect(r.errors.join("\n")).toMatch(/named "vip"/);
    }
  });

  it("rejects out-of-range door policy values", () => {
    const l = clone();
    l.door_policy.vip_min_score = 1.5;
    l.door_policy.opening_time = "9pm";
    const r = validateVipList(l);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });

  it("reports invalid JSON without throwing", () => {
    const r = parseVipListJson("{nope");
    expect(r).toMatchObject({ ok: false });
  });
});

describe("checkAccountId", () => {
  it("accepts a 32-hex account id", () => expect(checkAccountId("0123456789abcdef0123456789abcdef")).toBeNull());
  it("flags an API token pasted into the account id field", () => expect(checkAccountId("cfut_abcdefghijklmnop")).toMatch(/API token/));
  it("flags anything else that is not 32 hex", () => expect(checkAccountId("my-account")).toMatch(/32 letters/));
});

describe("addLabel", () => {
  const l = (text: string, want: "vip" | "not_vip" = "vip") => ({ handle: "a", text, got: "archive (0.40)", want, themeId: "agents" });
  it("strips links, trims, replaces the same post and keeps only the newest twenty", () => {
    let labels = addLabel([], l("first https://t.co/x"));
    expect(labels[0]!.text).toBe("first");
    for (let i = 0; i < 25; i++) labels = addLabel(labels, l(`post ${i}`));
    labels = addLabel(labels, l("post 24", "not_vip"));
    expect(labels).toHaveLength(20);
    expect(labels.at(-1)).toMatchObject({ text: "post 24", want: "not_vip" });
    expect(labels.filter((x) => x.text === "post 24")).toHaveLength(1);
  });
  it("caps length and ignores link-only text", () => {
    const labels = addLabel([], l("x".repeat(400)));
    expect(labels[0]!.text).toHaveLength(240);
    expect(addLabel(labels, l("https://t.co/only"))).toBe(labels);
  });
});
