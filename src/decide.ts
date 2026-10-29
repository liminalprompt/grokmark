import type { VipList } from "./schema";

/** P(yes) per skip rule / theme id, and the probability-weighted value level (0..n-1). */
export type Probs = {
  skip: Record<string, number>;
  theme: Record<string, number>;
  value: number;
};

export type Verdict = {
  verdict: "vip" | "keep" | "archive";
  reason?: string;
  themeId?: string;
  themeName?: string;
  route?: string;
  action?: string;
  /** normalized value score 0..1 */
  confidence: number;
  probs: Probs;
};

// Tuned on real Clef-flash output: on-topic posts land around 0.3 to 0.6 for their theme while unrelated
// ones sit near 0.2, and a skip rule that really applies lands above 0.9.
export const THEME_MIN = 0.3;
export const SKIP_MIN = 0.6;

export function decide(list: VipList, probs: Probs): Verdict {
  const n = list.value.levels.length;
  const v = n > 1 ? Math.min(1, Math.max(0, probs.value / (n - 1))) : 0;
  const base = { confidence: v, probs };

  for (const rule of list.skip_rules) {
    if ((probs.skip[rule.id] ?? 0) > SKIP_MIN) return { verdict: "archive", reason: `skip.${rule.id}`, ...base };
  }

  const matched = list.themes
    .map((t) => ({ t, p: probs.theme[t.id] ?? 0 }))
    .filter((m) => m.p > THEME_MIN);
  if (!matched.length) return { verdict: "archive", reason: "no theme", ...base };

  if (v >= list.door_policy.vip_min_score) {
    matched.sort((a, b) => b.t.weight - a.t.weight || b.p - a.p);
    const top = matched[0]!.t;
    return {
      verdict: "vip",
      themeId: top.id,
      themeName: top.name,
      route: top.route,
      action: top.action,
      ...base,
    };
  }

  return { verdict: Math.round(probs.value) <= 0 ? "archive" : "keep", reason: "below vip_min_score", ...base };
}
