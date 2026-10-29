import { describe, expect, it } from "vitest";
import { VIP_LIST_PROMPT, buildTuningPrompt } from "../src/prompt";

describe("prompts", () => {
  it("the VIP List prompt carries the writing rules", () => {
    expect(VIP_LIST_PROMPT).toMatch(/RULES\n- 3 to 8 themes/);
    expect(VIP_LIST_PROMPT).toMatch(/Output valid JSON only\.$/);
  });

  it("the tuning prompt lists verdicts, embeds the VIP List and repeats the rules", () => {
    const p = buildTuningPrompt('{"version": 2}', [
      { handle: "alex", text: "Grok Bot 0.78.1 is out", got: "archive (0.40)", want: "vip", themeId: "grok_bot_releases" },
      { handle: "bob", text: "50 backlinks", got: "vip (0.55)", want: "not_vip" },
    ]);
    expect(p).toContain('1. @alex, scored archive (0.40), should be VIP under theme "grok_bot_releases": "Grok Bot 0.78.1 is out"');
    expect(p).toContain('2. @bob, scored vip (0.55), should NOT be VIP: "50 backlinks"');
    expect(p).toContain('CURRENT VIP LIST\n{"version": 2}');
    expect(p).toMatch(/RULES\n- 3 to 8 themes/);
  });
});
