import { DEFAULT_DOOR_POLICY, type Theme, type VipList } from "./schema";

/** Shown in the owner_summary slot until the user writes their own sentence. */
export const OWNER_PLACEHOLDER =
  "Describe yourself in one sentence: what you build, the tools you use every day, and what you want to learn.";

/** Every theme goes to one route in basic setup. Advanced users reassign routes on the setup page. */
const ROUTE = "grok_bot";

/**
 * The stock VIP List: general-purpose themes for people who bookmark builder and AI posts on X.
 * Questions are short and single-idea on purpose; Clef-flash scores those well and long ones badly.
 */
export const STOCK_VIP_LIST: VipList = {
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
      route: ROUTE,
    },
    {
      id: "agent_demos",
      name: "AI agents that ship",
      question: "Does this post show an AI agent or coding assistant building or deploying something, with the result shown?",
      instructions: "Yes only if both the request and a real outcome appear, such as a PR, a deployed site or a finished app. No for predictions or opinions about agents, and no for a bare link.",
      weight: 4,
      action: "Capture the flow (who asked, which agent, what shipped) as an example I can reuse or write about.",
      route: ROUTE,
    },
    {
      id: "howtos",
      name: "How-tos and workflows",
      question: "Does this post give concrete steps, a setup or a workflow that someone could copy?",
      instructions: "Yes if it has numbered steps, a named setup, a shared config or bot, or a specific tactic. No for a story about what someone built with no steps, and no for opinions, praise or complaints.",
      weight: 4,
      action: "Extract the steps and any links into a short checklist I can follow.",
      route: ROUTE,
    },
    {
      id: "numbers",
      name: "Numbers and benchmarks",
      question: "Does this post report real numbers, such as benchmarks, costs, speed or a before-and-after comparison?",
      instructions: "Yes if specific figures or a measured comparison appear in the post or its images. No for claims like 'much faster' with no figure.",
      weight: 4,
      action: "Pull out the setup, the numbers and any repo link, and say what they mean for my own stack.",
      route: ROUTE,
    },
    {
      id: "model_news",
      name: "AI model and API news",
      question: "Is this post about a new AI model, API, pricing change or capability?",
      instructions: "Yes for model releases, API changes, price cuts and head-to-head model comparisons. No for general AI opinion or hype with nothing named.",
      weight: 3,
      action: "Note what changed, for which model, and whether it is worth switching anything I run.",
      route: ROUTE,
    },
    {
      id: "research",
      name: "Papers and research",
      question: "Does this post share a paper, study or research finding?",
      instructions: "Yes for links to papers, summaries of a study, or a stated research result. No for anecdotes or opinion threads.",
      weight: 3,
      action: "Give me the claim, the method in one line and the link, so I can decide whether to read it.",
      route: ROUTE,
    },
    {
      id: "reply_openings",
      name: "Reply openings",
      question: "Does this post invite a short witty reply about AI, dev tools or building online?",
      instructions: "Yes if it asks a question, makes a bold claim or describes a mishap that a one-line joke or dry verdict could answer. No for personal, tragic or political topics.",
      weight: 2,
      action: "Draft two one-line reply options in my voice for me to post by hand, with no links.",
      route: ROUTE,
    },
    {
      id: "ai_and_people",
      name: "AI and how people live",
      question: "Is this post a thoughtful take on how AI affects work, learning or mental health?",
      instructions: "Yes for first-hand accounts, research or careful arguments about AI's effect on people. No for jokes, outrage bait or general doom.",
      weight: 2,
      action: "Save it with a two-line summary to my reading list.",
      route: ROUTE,
    },
  ],
  skip_rules: [
    {
      id: "engagement_bait",
      question: "Is the main purpose of this post to collect likes, replies or follows?",
      instructions: "Yes for 'comment X for the link', 'reply with your favorite' and follow-for-follow posts. No if the post teaches something on its own.",
    },
    {
      id: "ad_or_giveaway",
      question: "Is this post a paid promotion, affiliate pitch or giveaway?",
      instructions: "Yes for sponsored posts, referral links, discount codes and giveaways. No if the author shares their own free tool, bot or setup.",
    },
    {
      id: "pure_meme",
      question: "Is this post only a joke, meme or reaction image?",
      instructions: "Yes if nothing remains to learn or use once the joke is removed. No if the joke is about AI or dev tools and invites a reply.",
    },
    {
      id: "recycled_listicle",
      question: "Is this a generic '20 tools you must bookmark' style list?",
      instructions: "Yes for link dumps with no personal testing or explanation. No if the author shows their own results with the tools.",
    },
    {
      id: "crypto_shill",
      question: "Is this post promoting a crypto token, airdrop or trading signal?",
      instructions: "Yes for any token promotion, airdrop or price call, even if it is framed as AI.",
    },
  ],
  value: {
    question: "How useful is this post to me?",
    instructions: "vip: it contains something I can act on directly, such as a repo or docs link, a named tool with a working setup, real numbers, step-by-step instructions, or a release of a tool I use. keep: it is on one of my themes but only gives background, inspiration or opinion. archive: a vague take, hype without specifics, something outside my themes, or a bare link with no text to judge.",
    levels: [
      { name: "archive", meaning: "Nothing worth keeping" },
      { name: "keep", meaning: "Worth saving, not acting on" },
      { name: "vip", meaning: "Send to an agent to act on" },
    ],
  },
  door_policy: { ...DEFAULT_DOOR_POLICY },
};

/**
 * The one personal theme: names the user follows (products, tools, companies, people). General themes
 * never catch "we swapped model A for model B" unless A or B is a name the user cares about.
 * Obscure names need a gloss, written as "Jev (TypeSafe's small decision model)"; a well-known name
 * like Grok Bot does not. Live test: a bare "Jev" scored below 0.22, Grok Bot 0.95 on the same question.
 */
export function watchlistTheme(names: string[]): Theme | null {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 12);
  if (!list.length) return null;
  return {
    id: "watchlist",
    name: "Names I follow",
    question: `Is this post about any of these: ${list.join(", ")}?`,
    instructions: "Yes if one of them is named as something used, built with, compared, measured or released in the post. No only if it appears as a stray tag or aside with nothing said about it.",
    weight: 5,
    action: "Summarize what it says about the thing I follow and pull out any numbers, setup or link.",
    route: ROUTE,
  };
}

/** The stock list as JSON for the setup page, with the user's own sentence and watchlist in place when they have them. */
export function stockVipListJson(ownerSummary?: string, names: string[] = []): string {
  const owner = ownerSummary?.trim() && ownerSummary.trim() !== OWNER_PLACEHOLDER ? ownerSummary.trim() : OWNER_PLACEHOLDER;
  const watch = watchlistTheme(names);
  // The owner line is the one piece of state every question sees, so the names go there too.
  const ownerLine = watch ? `${owner} Names I follow: ${[...new Set(names.map((n) => n.trim()).filter(Boolean))].join(", ")}.` : owner;
  // The schema allows 8 themes; the watchlist takes the slot of the lowest-weight stock theme.
  const themes = watch ? [watch, ...STOCK_VIP_LIST.themes.slice(0, -1)] : STOCK_VIP_LIST.themes;
  // If you follow it, a post centrally about it is actionable; the generic evidence list alone scores such posts as keep.
  const value = watch
    ? { ...STOCK_VIP_LIST.value, instructions: STOCK_VIP_LIST.value.instructions.replace("or a release of a tool I use.", "a release of a tool I use, or a post where one of the names I follow is used, compared, measured or released.") }
    : STOCK_VIP_LIST.value;
  return JSON.stringify({ ...STOCK_VIP_LIST, owner_summary: ownerLine, themes, value }, null, 2);
}
