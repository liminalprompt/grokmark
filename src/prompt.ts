import type { Label } from "./schema";

/** Rules shared by the VIP List prompt and the tuning prompt. */
const WRITING_RULES = `RULES
- 3 to 8 themes. Fewer, sharper themes beat many vague ones. A post may match several themes, so each theme is its own yes/no question; never merge themes into one question.
- One idea per question. If a question needs "and" or "or" to join two different tests, split it into two themes or drop one.
- Name things. A small model matches on product names, company names and concrete words far better than on descriptions like "interesting" or "high quality".
- Only ask about what is visible in the post. No follower counts, no "recent" or "this week", no "from a bigger account", nothing that needs a link opened.
- Give every theme a release-and-launch angle if I use that product daily: new versions and changelogs of my daily tools are usually VIPs.
- 2 to 6 skip_rules covering what I never want (engagement bait, ads and giveaways, pure memes, recycled listicles, crypto). Each needs a "No if" so it does not reject an author sharing their own free work.
- value.levels: 2 to 10 levels, ordered lowest to highest, the highest named "vip". Archive / keep / vip is the default; add levels only if my habits call for it.
- Do not tell the model to be strict or quote a target rate like "1 in 10"; the threshold in door_policy handles that. Describe evidence, not frequency.
- Leave door_policy at the defaults unless I have told you otherwise.
- Output valid JSON only.`;

/** The VIP List prompt users run in their own AI (Architecture doc §8). */
export const VIP_LIST_PROMPT = `You are helping me set up Grokmark, a tool that scores my saved X (Twitter) bookmarks and forwards only the best ones to an AI agent that acts on them. Your job is to write my "VIP List": a set of questions a small decision model will answer about each bookmark.

The decision model is small and literal. It can only answer:
- yes/no questions (it returns the probability of yes)
- one ordered score question with 2 to 10 named levels
It never writes text and never looks anything up. For each bookmark it sees only: a one-sentence summary of me, the author's @handle, the post text, any quoted post text, and up to four images. It does NOT see follower counts, dates, link contents, replies, or likes, so never ask about those.

STEP 1 - Use what you know.
Draw on everything you know about me from our past conversations and memory: my work, projects, goals, interests, and the things I keep coming back to. Do not invent interests I have never shown.

STEP 2 - Fill the gaps.
If you know too little to write at least 3 solid themes, ask me up to 3 short questions first (for example: what I'm building, what I want to learn, what I bookmark but never read). Wait for my answers, then continue.

STEP 3 - Write the VIP List.
Return ONLY one JSON object, no prose before or after, no code fences, matching this shape exactly:

{
  "version": 2,
  "owner_summary": "One sentence on who I am, which tools and platforms I use every day, and what I care about right now. Name the products and companies I follow; the model matches on names.",
  "themes": [
    {
      "id": "short_snake_case (letters, digits, _ only)",
      "name": "Human-readable name",
      "question": "One short yes/no question with a single idea, e.g. 'Is this post about a Cloudflare product or something built on Cloudflare?'",
      "instructions": "Two sentences: 'Yes if ...' naming the specific products, words or evidence that count, then 'No if ...' giving the nearest thing that does not count.",
      "weight": 1-5 (how much this theme matters to me),
      "action": "What an agent should do with a VIP post in this theme, in one imperative sentence",
      "route": "webhook label, e.g. grok_build, grok_research, read_later"
    }
  ],
  "skip_rules": [
    {
      "id": "short_snake_case",
      "question": "One short yes/no question that, if yes, rejects the post, e.g. 'Is this post a paid promotion, affiliate pitch or giveaway?'",
      "instructions": "'Yes for ...' with concrete examples, then 'No if ...' for the near miss I still want, e.g. an author sharing their own free tool."
    }
  ],
  "value": {
    "question": "How useful is this post to me?",
    "instructions": "One clause per level, each naming concrete evidence visible in the post. vip: something an agent can act on directly, such as a repo or docs link, a named tool with a working setup, real numbers or benchmarks, step-by-step instructions, or a launch from a product I use. keep: on one of my themes but only background, inspiration or opinion. archive: a vague take, hype without specifics, off my themes, or a bare link with no text to judge.",
    "levels": [
      {"name": "archive", "meaning": "Nothing worth keeping"},
      {"name": "keep", "meaning": "Worth saving, not acting on"},
      {"name": "vip", "meaning": "Send to an agent to act on"}
    ]
  },
  "door_policy": {
    "vip_level": "vip",
    "vip_min_score": 0.5,
    "batch_size": 5,
    "opening_time": "21:00"
  }
}

${WRITING_RULES}`;

/**
 * The tuning prompt: the user's VIP List plus the verdicts they disagreed with, for their own AI to rewrite
 * the rubric. Built locally, copied to the clipboard, never sent anywhere by Grokmark.
 */
export function buildTuningPrompt(vipListJson: string, labels: Label[]): string {
  const lines = labels.map((l, n) => {
    const want = l.want === "vip" ? `should be VIP${l.themeId ? ` under theme "${l.themeId}"` : ""}` : "should NOT be VIP";
    return `${n + 1}. @${l.handle}, scored ${l.got}, ${want}: "${l.text}"`;
  });
  return `You wrote my Grokmark VIP List, the JSON below. Grokmark ran it on my real X bookmarks with a small decision model, and I marked the verdicts I disagree with.

Rewrite the VIP List so those posts land where I say. Change only owner_summary, the theme questions and instructions, the skip rule questions and instructions, and value.instructions. Keep every id, name, weight, action, route and door_policy exactly as they are. Add a theme only if no existing theme can own a post I marked VIP. Prefer naming the specific products, words or evidence that appear in the marked posts over describing them.

MY VERDICTS
${lines.join("\n")}

CURRENT VIP LIST
${vipListJson.trim()}

${WRITING_RULES}`;
}
