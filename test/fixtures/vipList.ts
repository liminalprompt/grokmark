import type { VipList } from "../../src/schema";

export const vipList: VipList = {
  version: 2,
  owner_summary: "Indie dev building AI agents on Cloudflare; wants startup ideas and dev tools.",
  themes: [
    { id: "agents", name: "AI agents", question: "Is this post about building or shipping AI agents?", instructions: "Yes for tools, repos, techniques.", weight: 3, action: "Prototype this and deploy it", route: "grok_build" },
    { id: "startup_ideas", name: "Startup ideas", question: "Does this post describe a product someone could build?", instructions: "Yes for concrete ideas.", weight: 5, action: "Write a one-page plan", route: "grok_research" },
    { id: "cloudflare", name: "Cloudflare", question: "Is this post about Cloudflare or Workers?", instructions: "Yes for products and tutorials.", weight: 2, action: "Try it on a Worker", route: "grok_build" },
  ],
  skip_rules: [
    { id: "ads", question: "Is this post mainly an ad or giveaway?", instructions: "Yes for sponsored posts." },
    { id: "bait", question: "Is this engagement bait?", instructions: "Yes if no takeaway." },
  ],
  value: {
    question: "How useful is this post to the owner right now?",
    instructions: "Actionable: repo link, named tool, numbers.",
    levels: [
      { name: "archive", meaning: "Nothing worth keeping" },
      { name: "keep", meaning: "Worth saving" },
      { name: "vip", meaning: "Send to an agent" },
    ],
  },
  door_policy: { vip_level: "vip", vip_min_score: 0.8, batch_size: 5, opening_time: "21:00" },
};
