import { describe, expect, it } from "vitest";
import { THEME_MIN, decide, type Probs } from "../src/decide";
import { vipList } from "./fixtures/vipList";

const probs = (over: Partial<Probs> = {}): Probs => ({
  skip: { ads: 0.1, bait: 0.1 },
  theme: { agents: 0.9, startup_ideas: 0.1, cloudflare: 0.1 },
  value: 2,
  ...over,
});

describe("decide", () => {
  it("archives when a skip rule fires, naming it", () => {
    const v = decide(vipList, probs({ skip: { ads: 0.7, bait: 0.1 } }));
    expect(v).toMatchObject({ verdict: "archive", reason: "skip.ads" });
  });

  it("archives when no theme matches", () => {
    const v = decide(vipList, probs({ theme: { agents: 0.2, startup_ideas: 0.3, cloudflare: 0.1 } }));
    expect(v).toMatchObject({ verdict: "archive", reason: "no theme" });
  });

  it("sends a VIP with its theme route and action", () => {
    const v = decide(vipList, probs());
    expect(v).toMatchObject({ verdict: "vip", themeId: "agents", route: "grok_build", action: "Prototype this and deploy it" });
    expect(v.confidence).toBe(1);
  });

  it("normalizes the score: 3 levels, 1.6 is exactly the 0.8 threshold", () => {
    expect(decide(vipList, probs({ value: 1.6 })).verdict).toBe("vip");
    expect(decide(vipList, probs({ value: 1.59 })).verdict).toBe("keep");
  });

  it("uses the same threshold for a 10-level list", () => {
    const levels = Array.from({ length: 10 }, (_, i) => ({ name: i === 9 ? "vip" : `l${i}`, meaning: "x" }));
    const list = { ...vipList, value: { ...vipList.value, levels } };
    expect(decide(list, probs({ value: 7.2 })).verdict).toBe("vip"); // 7.2 / 9 = 0.8
    expect(decide(list, probs({ value: 7.1 })).verdict).toBe("keep");
  });

  it("breaks ties between matched themes by weight, then probability", () => {
    const both = probs({ theme: { agents: 0.99, startup_ideas: 0.6, cloudflare: 0.1 } });
    expect(decide(vipList, both).themeId).toBe("startup_ideas"); // weight 5 beats weight 3
    const same = { ...vipList, themes: vipList.themes.map((t) => ({ ...t, weight: 3 as const })) };
    expect(decide(same, both).themeId).toBe("agents"); // equal weight, higher P(yes)
  });

  it("rounds a low non-VIP score to archive and a middle one to keep", () => {
    expect(decide(vipList, probs({ value: 0.4 })).verdict).toBe("archive");
    expect(decide(vipList, probs({ value: 0.6 })).verdict).toBe("keep");
  });

  it("treats exactly the theme cutoff as not matching, and just above it as matching", () => {
    expect(decide(vipList, probs({ theme: { agents: THEME_MIN, startup_ideas: 0, cloudflare: 0 } })).reason).toBe("no theme");
    expect(decide(vipList, probs({ value: 1, theme: { agents: THEME_MIN + 0.02, startup_ideas: 0, cloudflare: 0 } })).reason).not.toBe("no theme");
  });

  it("matches on-topic posts at the modest probabilities Clef-flash gives, and ignores weak skip signals", () => {
    const v = decide(vipList, probs({ skip: { ads: 0.52, bait: 0.1 }, theme: { agents: 0.37, startup_ideas: 0.19, cloudflare: 0.19 }, value: 0.9 }));
    expect(v.verdict).toBe("keep"); // matched a theme, no skip fired, value below the VIP bar
  });
});
