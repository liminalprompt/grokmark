export type Theme = {
  id: string;
  name: string;
  question: string;
  instructions: string;
  weight: 1 | 2 | 3 | 4 | 5;
  action: string;
  route: string;
};

export type SkipRule = { id: string; question: string; instructions: string };

export type ValueLevel = { name: string; meaning: string };

export type DoorPolicy = {
  vip_level: string;
  vip_min_score: number;
  batch_size: number;
  opening_time: string;
  cooldown_hours?: number;
};

export type VipList = {
  version: 2;
  owner_summary: string;
  themes: Theme[];
  skip_rules: SkipRule[];
  value: { question: string; instructions: string; levels: ValueLevel[] };
  door_policy: DoorPolicy;
};

export type Bookmark = {
  id: string;
  url: string;
  authorHandle: string;
  authorName: string;
  text: string;
  createdAt: string;
  imageUrls: string[];
  quotedText?: string;
};

export const DEFAULT_DOOR_POLICY: DoorPolicy = {
  vip_level: "vip",
  vip_min_score: 0.5,
  batch_size: 5,
  opening_time: "21:00",
  cooldown_hours: 4,
};

const ID_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ValidationResult =
  | { ok: true; value: VipList }
  | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

export function validateDoorPolicy(input: unknown, errors: string[], path = "door_policy"): DoorPolicy {
  const raw = isObj(input) ? input : {};
  const dp: DoorPolicy = { ...DEFAULT_DOOR_POLICY };
  if (raw.vip_level !== undefined) {
    if (isStr(raw.vip_level)) dp.vip_level = raw.vip_level;
    else errors.push(`${path}.vip_level must be a non-empty string`);
  }
  if (raw.vip_min_score !== undefined) {
    if (typeof raw.vip_min_score === "number" && raw.vip_min_score >= 0 && raw.vip_min_score <= 1)
      dp.vip_min_score = raw.vip_min_score;
    else errors.push(`${path}.vip_min_score must be a number from 0 to 1`);
  }
  if (raw.batch_size !== undefined) {
    if (Number.isInteger(raw.batch_size) && (raw.batch_size as number) >= 1) dp.batch_size = raw.batch_size as number;
    else errors.push(`${path}.batch_size must be a whole number of 1 or more`);
  }
  if (raw.opening_time !== undefined) {
    if (typeof raw.opening_time === "string" && TIME_RE.test(raw.opening_time)) dp.opening_time = raw.opening_time;
    else errors.push(`${path}.opening_time must look like "21:00"`);
  }
  if (raw.cooldown_hours !== undefined) {
    if (typeof raw.cooldown_hours === "number" && raw.cooldown_hours >= 0) dp.cooldown_hours = raw.cooldown_hours;
    else errors.push(`${path}.cooldown_hours must be a number of 0 or more`);
  }
  return dp;
}

export function validateVipList(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["VIP List must be a JSON object"] };

  if (input.version !== 2) errors.push("version must be 2");
  if (!isStr(input.owner_summary)) errors.push("owner_summary must be a non-empty string");

  const themes: Theme[] = [];
  if (!Array.isArray(input.themes) || input.themes.length < 3 || input.themes.length > 8) {
    errors.push("themes must be an array of 3 to 8 items");
  } else {
    const seen = new Set<string>();
    input.themes.forEach((t, i) => {
      const p = `themes[${i}]`;
      if (!isObj(t)) return errors.push(`${p} must be an object`);
      if (typeof t.id !== "string" || !ID_RE.test(t.id)) errors.push(`${p}.id may only use letters, digits, _ . -`);
      else if (seen.has(t.id)) errors.push(`${p}.id "${t.id}" is used twice`);
      else seen.add(t.id);
      for (const k of ["name", "question", "instructions", "action", "route"] as const)
        if (!isStr(t[k])) errors.push(`${p}.${k} must be a non-empty string`);
      if (!Number.isInteger(t.weight) || (t.weight as number) < 1 || (t.weight as number) > 5)
        errors.push(`${p}.weight must be a whole number from 1 to 5`);
      themes.push(t as unknown as Theme);
    });
  }

  const skip_rules: SkipRule[] = [];
  if (!Array.isArray(input.skip_rules) || input.skip_rules.length < 2 || input.skip_rules.length > 6) {
    errors.push("skip_rules must be an array of 2 to 6 items");
  } else {
    const seen = new Set<string>();
    input.skip_rules.forEach((s, i) => {
      const p = `skip_rules[${i}]`;
      if (!isObj(s)) return errors.push(`${p} must be an object`);
      if (typeof s.id !== "string" || !ID_RE.test(s.id)) errors.push(`${p}.id may only use letters, digits, _ . -`);
      else if (seen.has(s.id)) errors.push(`${p}.id "${s.id}" is used twice`);
      else seen.add(s.id);
      for (const k of ["question", "instructions"] as const)
        if (!isStr(s[k])) errors.push(`${p}.${k} must be a non-empty string`);
      skip_rules.push(s as unknown as SkipRule);
    });
  }

  let value: VipList["value"] = { question: "", instructions: "", levels: [] };
  if (!isObj(input.value)) {
    errors.push("value must be an object");
  } else {
    const v = input.value;
    if (!isStr(v.question)) errors.push("value.question must be a non-empty string");
    if (!isStr(v.instructions)) errors.push("value.instructions must be a non-empty string");
    if (!Array.isArray(v.levels) || v.levels.length < 2 || v.levels.length > 10) {
      errors.push("value.levels must be an array of 2 to 10 items");
    } else {
      v.levels.forEach((l, i) => {
        if (!isObj(l) || !isStr(l.name) || !isStr(l.meaning))
          errors.push(`value.levels[${i}] needs a name and a meaning`);
      });
      const last = v.levels[v.levels.length - 1];
      if (isObj(last) && last.name !== "vip") errors.push('the last value level must be named "vip"');
    }
    value = v as unknown as VipList["value"];
  }

  const door_policy = validateDoorPolicy(input.door_policy, errors);
  if (value.levels.length && door_policy.vip_level !== value.levels[value.levels.length - 1]?.name)
    errors.push("door_policy.vip_level must match the last value level");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      version: 2,
      owner_summary: input.owner_summary as string,
      themes,
      skip_rules,
      value,
      door_policy,
    },
  };
}

export function parseVipListJson(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  return validateVipList(parsed);
}

/** Cloudflare account ids are 32 hex characters. Returns a readable problem, or null if fine. */
export function checkAccountId(id: string): string | null {
  const v = id.trim();
  if (/^cf(ut|at)_/i.test(v) || v.length > 40) return "That looks like an API token, not the account ID. The account ID is 32 letters and digits, shown on the Workers AI page.";
  if (!/^[0-9a-f]{32}$/i.test(v)) return "The account ID should be 32 letters and digits (a to f, 0 to 9).";
  return null;
}


/** A post the user marked in the test table. Kept locally only, to build a tuning prompt for their own AI. */
export type Label = {
  handle: string;
  text: string;
  /** what Grokmark said, e.g. "archive (0.40)" */
  got: string;
  want: "vip" | "not_vip";
  /** the theme the user picked, only meaningful when want is "vip" */
  themeId?: string;
};

export const MAX_LABELS = 20;
const LABEL_CHARS = 240;

/** Add a label, newest last; replaces an earlier label of the same post, drops the oldest past the cap. */
export function addLabel(labels: Label[], l: Label): Label[] {
  const text = l.text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, LABEL_CHARS);
  if (!text) return labels;
  const same = (x: Label) => x.handle === l.handle && x.text === text;
  return [...labels.filter((x) => !same(x)), { ...l, text }].slice(-MAX_LABELS);
}
