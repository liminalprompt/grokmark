"use strict";
(() => {
  // src/gate.ts
  var HOUR = 36e5;
  function shouldRun(settings, state, now, force = false) {
    if (!settings.accountId || !settings.token) return { run: false, why: "Add your Cloudflare account ID and token" };
    if (!settings.vipList) return { run: false, why: "Finish setup: write one sentence about yourself" };
    if (force) return { run: true };
    const [h, m] = settings.doorPolicy.opening_time.split(":").map(Number);
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < h * 60 + m) return { run: false, why: `Doors open at ${settings.doorPolicy.opening_time}` };
    const cooldown = (settings.doorPolicy.cooldown_hours ?? 4) * HOUR;
    if (state.lastSuccess && now.getTime() - state.lastSuccess < cooldown) return { run: false, why: "Cooling down" };
    return { run: true };
  }

  // src/schema.ts
  var DEFAULT_DOOR_POLICY = {
    vip_level: "vip",
    vip_min_score: 0.5,
    batch_size: 5,
    opening_time: "21:00",
    cooldown_hours: 4
  };
  var ID_RE = /^[A-Za-z0-9_.-]{1,100}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var isObj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
  var isStr = (x) => typeof x === "string" && x.trim() !== "";
  function validateDoorPolicy(input, errors, path = "door_policy") {
    const raw = isObj(input) ? input : {};
    const dp = { ...DEFAULT_DOOR_POLICY };
    if (raw.vip_level !== void 0) {
      if (isStr(raw.vip_level)) dp.vip_level = raw.vip_level;
      else errors.push(`${path}.vip_level must be a non-empty string`);
    }
    if (raw.vip_min_score !== void 0) {
      if (typeof raw.vip_min_score === "number" && raw.vip_min_score >= 0 && raw.vip_min_score <= 1)
        dp.vip_min_score = raw.vip_min_score;
      else errors.push(`${path}.vip_min_score must be a number from 0 to 1`);
    }
    if (raw.batch_size !== void 0) {
      if (Number.isInteger(raw.batch_size) && raw.batch_size >= 1) dp.batch_size = raw.batch_size;
      else errors.push(`${path}.batch_size must be a whole number of 1 or more`);
    }
    if (raw.opening_time !== void 0) {
      if (typeof raw.opening_time === "string" && TIME_RE.test(raw.opening_time)) dp.opening_time = raw.opening_time;
      else errors.push(`${path}.opening_time must look like "21:00"`);
    }
    if (raw.cooldown_hours !== void 0) {
      if (typeof raw.cooldown_hours === "number" && raw.cooldown_hours >= 0) dp.cooldown_hours = raw.cooldown_hours;
      else errors.push(`${path}.cooldown_hours must be a number of 0 or more`);
    }
    return dp;
  }
  function validateVipList(input) {
    const errors = [];
    if (!isObj(input)) return { ok: false, errors: ["VIP List must be a JSON object"] };
    if (input.version !== 2) errors.push("version must be 2");
    if (!isStr(input.owner_summary)) errors.push("owner_summary must be a non-empty string");
    const themes = [];
    if (!Array.isArray(input.themes) || input.themes.length < 3 || input.themes.length > 8) {
      errors.push("themes must be an array of 3 to 8 items");
    } else {
      const seen = /* @__PURE__ */ new Set();
      input.themes.forEach((t, i) => {
        const p = `themes[${i}]`;
        if (!isObj(t)) return errors.push(`${p} must be an object`);
        if (typeof t.id !== "string" || !ID_RE.test(t.id)) errors.push(`${p}.id may only use letters, digits, _ . -`);
        else if (seen.has(t.id)) errors.push(`${p}.id "${t.id}" is used twice`);
        else seen.add(t.id);
        for (const k of ["name", "question", "instructions", "action", "route"])
          if (!isStr(t[k])) errors.push(`${p}.${k} must be a non-empty string`);
        if (!Number.isInteger(t.weight) || t.weight < 1 || t.weight > 5)
          errors.push(`${p}.weight must be a whole number from 1 to 5`);
        themes.push(t);
      });
    }
    const skip_rules = [];
    if (!Array.isArray(input.skip_rules) || input.skip_rules.length < 2 || input.skip_rules.length > 6) {
      errors.push("skip_rules must be an array of 2 to 6 items");
    } else {
      const seen = /* @__PURE__ */ new Set();
      input.skip_rules.forEach((s, i) => {
        const p = `skip_rules[${i}]`;
        if (!isObj(s)) return errors.push(`${p} must be an object`);
        if (typeof s.id !== "string" || !ID_RE.test(s.id)) errors.push(`${p}.id may only use letters, digits, _ . -`);
        else if (seen.has(s.id)) errors.push(`${p}.id "${s.id}" is used twice`);
        else seen.add(s.id);
        for (const k of ["question", "instructions"])
          if (!isStr(s[k])) errors.push(`${p}.${k} must be a non-empty string`);
        skip_rules.push(s);
      });
    }
    let value = { question: "", instructions: "", levels: [] };
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
      value = v;
    }
    const door_policy = validateDoorPolicy(input.door_policy, errors);
    if (value.levels.length && door_policy.vip_level !== value.levels[value.levels.length - 1]?.name)
      errors.push("door_policy.vip_level must match the last value level");
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      value: {
        version: 2,
        owner_summary: input.owner_summary,
        themes,
        skip_rules,
        value,
        door_policy
      }
    };
  }
  function parseVipListJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, errors: [`Not valid JSON: ${e.message}`] };
    }
    return validateVipList(parsed);
  }

  // src/stockRubric.ts
  var OWNER_PLACEHOLDER = "Describe yourself in one sentence: what you build, the tools you use every day, and what you want to learn.";
  var ROUTE = "grok_bot";
  var STOCK_VIP_LIST = {
    version: 2,
    owner_summary: OWNER_PLACEHOLDER,
    themes: [
      {
        id: "launches",
        name: "Launches and releases",
        question: "Does this post announce a new product, feature, version or changelog?",
        instructions: "Yes for launch posts, release notes and what's-new threads about a tool, app or platform. No for rumors, wishlists or praise with no release.",
        weight: 4,
        action: "Summarize what shipped in three lines and note how it applies to what I build.",
        route: ROUTE
      },
      {
        id: "agent_demos",
        name: "AI agents that ship",
        question: "Does this post show an AI agent or coding assistant building or deploying something, with the result shown?",
        instructions: "Yes only if both the request and a real outcome appear, such as a PR, a deployed site or a finished app. No for predictions or opinions about agents, and no for a bare link.",
        weight: 4,
        action: "Capture the flow (who asked, which agent, what shipped) as an example I can reuse or write about.",
        route: ROUTE
      },
      {
        id: "howtos",
        name: "How-tos and workflows",
        question: "Does this post give concrete steps, a setup or a workflow that someone could copy?",
        instructions: "Yes if it has numbered steps, a named setup, a shared config or bot, or a specific tactic. No for a story about what someone built with no steps, and no for opinions, praise or complaints.",
        weight: 4,
        action: "Extract the steps and any links into a short checklist I can follow.",
        route: ROUTE
      },
      {
        id: "numbers",
        name: "Numbers and benchmarks",
        question: "Does this post report real numbers, such as benchmarks, costs, speed or a before-and-after comparison?",
        instructions: "Yes if specific figures or a measured comparison appear in the post or its images. No for claims like 'much faster' with no figure.",
        weight: 4,
        action: "Pull out the setup, the numbers and any repo link, and say what they mean for my own stack.",
        route: ROUTE
      },
      {
        id: "model_news",
        name: "AI model and API news",
        question: "Is this post about a new AI model, API, pricing change or capability?",
        instructions: "Yes for model releases, API changes, price cuts and head-to-head model comparisons. No for general AI opinion or hype with nothing named.",
        weight: 3,
        action: "Note what changed, for which model, and whether it is worth switching anything I run.",
        route: ROUTE
      },
      {
        id: "research",
        name: "Papers and research",
        question: "Does this post share a paper, study or research finding?",
        instructions: "Yes for links to papers, summaries of a study, or a stated research result. No for anecdotes or opinion threads.",
        weight: 3,
        action: "Give me the claim, the method in one line and the link, so I can decide whether to read it.",
        route: ROUTE
      },
      {
        id: "reply_openings",
        name: "Reply openings",
        question: "Does this post invite a short witty reply about AI, dev tools or building online?",
        instructions: "Yes if it asks a question, makes a bold claim or describes a mishap that a one-line joke or dry verdict could answer. No for personal, tragic or political topics.",
        weight: 2,
        action: "Draft two one-line reply options in my voice for me to post by hand, with no links.",
        route: ROUTE
      },
      {
        id: "ai_and_people",
        name: "AI and how people live",
        question: "Is this post a thoughtful take on how AI affects work, learning or mental health?",
        instructions: "Yes for first-hand accounts, research or careful arguments about AI's effect on people. No for jokes, outrage bait or general doom.",
        weight: 2,
        action: "Save it with a two-line summary to my reading list.",
        route: ROUTE
      }
    ],
    skip_rules: [
      {
        id: "engagement_bait",
        question: "Is the main purpose of this post to collect likes, replies or follows?",
        instructions: "Yes for 'comment X for the link', 'reply with your favorite' and follow-for-follow posts. No if the post teaches something on its own."
      },
      {
        id: "ad_or_giveaway",
        question: "Is this post a paid promotion, affiliate pitch or giveaway?",
        instructions: "Yes for sponsored posts, referral links, discount codes and giveaways. No if the author shares their own free tool, bot or setup."
      },
      {
        id: "pure_meme",
        question: "Is this post only a joke, meme or reaction image?",
        instructions: "Yes if nothing remains to learn or use once the joke is removed. No if the joke is about AI or dev tools and invites a reply."
      },
      {
        id: "recycled_listicle",
        question: "Is this a generic '20 tools you must bookmark' style list?",
        instructions: "Yes for link dumps with no personal testing or explanation. No if the author shows their own results with the tools."
      },
      {
        id: "crypto_shill",
        question: "Is this post promoting a crypto token, airdrop or trading signal?",
        instructions: "Yes for any token promotion, airdrop or price call, even if it is framed as AI."
      }
    ],
    value: {
      question: "How useful is this post to me?",
      instructions: "vip: it contains something I can act on directly, such as a repo or docs link, a named tool with a working setup, real numbers, step-by-step instructions, or a release of a tool I use. keep: it is on one of my themes but only gives background, inspiration or opinion. archive: a vague take, hype without specifics, something outside my themes, or a bare link with no text to judge.",
      levels: [
        { name: "archive", meaning: "Nothing worth keeping" },
        { name: "keep", meaning: "Worth saving, not acting on" },
        { name: "vip", meaning: "Send to an agent to act on" }
      ]
    },
    door_policy: { ...DEFAULT_DOOR_POLICY }
  };
  function watchlistTheme(names) {
    const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 12);
    if (!list.length) return null;
    return {
      id: "watchlist",
      name: "Names I follow",
      question: `Is this post about any of these: ${list.join(", ")}?`,
      instructions: "Yes if one of them is named as something used, built with, compared, measured or released in the post. No only if it appears as a stray tag or aside with nothing said about it.",
      weight: 5,
      action: "Summarize what it says about the thing I follow and pull out any numbers, setup or link.",
      route: ROUTE
    };
  }
  function stockVipListJson(ownerSummary, names = []) {
    const owner = ownerSummary?.trim() && ownerSummary.trim() !== OWNER_PLACEHOLDER ? ownerSummary.trim() : OWNER_PLACEHOLDER;
    const watch = watchlistTheme(names);
    const ownerLine = watch ? `${owner} Names I follow: ${[...new Set(names.map((n) => n.trim()).filter(Boolean))].join(", ")}.` : owner;
    const themes = watch ? [watch, ...STOCK_VIP_LIST.themes.slice(0, -1)] : STOCK_VIP_LIST.themes;
    const value = watch ? { ...STOCK_VIP_LIST.value, instructions: STOCK_VIP_LIST.value.instructions.replace("or a release of a tool I use.", "a release of a tool I use, or a post where one of the names I follow is used, compared, measured or released.") } : STOCK_VIP_LIST.value;
    return JSON.stringify({ ...STOCK_VIP_LIST, owner_summary: ownerLine, themes, value }, null, 2);
  }

  // src/effectiveList.ts
  function effectiveVipList(s) {
    const custom = isStockShaped(s.vipListJson) ? "" : s.vipListJson.trim();
    if (custom) {
      const r2 = parseVipListJson(custom);
      if (!r2.ok) return { list: null, base: null, source: "custom", problem: r2.errors.join("; ") };
      return { list: applyRoutes(r2.value, s.themeRoutes), base: r2.value, source: "custom" };
    }
    if (!s.ownerSummary.trim()) return { list: null, base: null, source: "stock", problem: "Write one sentence about yourself" };
    const r = parseVipListJson(stockVipListJson(s.ownerSummary, s.watchNames));
    if (!r.ok) return { list: null, base: null, source: "stock", problem: r.errors.join("; ") };
    return { list: applyRoutes(r.value, s.themeRoutes), base: r.value, source: "stock" };
  }
  function applyRoutes(list, overrides) {
    return { ...list, themes: list.themes.map((t) => overrides[t.id] ? { ...t, route: overrides[t.id] } : t) };
  }
  var STOCK_IDS = /* @__PURE__ */ new Set(["watchlist", ...STOCK_VIP_LIST.themes.map((t) => t.id)]);
  function isStockShaped(json) {
    const text = json.trim();
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed.themes) && parsed.themes.length > 0 && parsed.themes.every((t) => typeof t?.id === "string" && STOCK_IDS.has(t.id));
    } catch {
      return false;
    }
  }

  // src/storage.ts
  var LOCK_STALE_MS = 15 * 60 * 1e3;
  var DEFAULT_SETTINGS = {
    accountId: "",
    token: "",
    routes: [],
    ownerSummary: "",
    watchNames: [],
    vipListJson: "",
    themeRoutes: {},
    vipList: null,
    doorPolicy: DEFAULT_DOOR_POLICY,
    labels: []
  };
  var FALLBACK = {
    settings: DEFAULT_SETTINGS,
    seen: [],
    queue: [],
    runs: [],
    lock: { runningSince: null },
    state: { lastSuccess: null }
  };
  async function get(key) {
    const out = await chrome.storage.local.get(key);
    return out[key] ?? FALLBACK[key];
  }
  async function getSettings() {
    const s = { ...DEFAULT_SETTINGS, ...await get("settings") };
    return { ...s, vipList: effectiveVipList(s).list, doorPolicy: { ...DEFAULT_DOOR_POLICY, ...s.doorPolicy } };
  }

  // popup/popup.ts
  var $ = (id) => document.getElementById(id);
  async function render() {
    const [settings, state, runs, queue] = await Promise.all([getSettings(), get("state"), get("runs"), get("queue")]);
    const gate = shouldRun(settings, state, /* @__PURE__ */ new Date());
    $("status").textContent = gate.run ? "Doors are open. Next visit to x.com checks." : gate.why;
    const last = runs[runs.length - 1];
    const rows = [
      ["Last run", last ? new Date(last.startedAt).toLocaleString() : "never"],
      ["Fetched", String(last?.fetched ?? 0)],
      ["VIP / keep / archive", last ? `${last.vip} / ${last.keep} / ${last.archive}` : "-"],
      ["Sent", String(last?.sent ?? 0)],
      ["Waiting in queue", String(queue.length)],
      ["Errors", String(last?.errors.length ?? 0)]
    ];
    const dl = $("stats");
    dl.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      dl.append(dt, dd);
    }
    if (last?.errors.length) $("msg").textContent = last.errors[0];
  }
  $("run").addEventListener("click", async () => {
    $("msg").textContent = "Running\u2026";
    const res = await chrome.runtime.sendMessage({ type: "runNow" });
    $("msg").textContent = res.message;
    void render();
  });
  $("setup").addEventListener("click", () => chrome.runtime.openOptionsPage());
  void render();
})();
//# sourceMappingURL=popup.js.map
