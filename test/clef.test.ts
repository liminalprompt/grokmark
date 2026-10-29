import { describe, expect, it } from "vitest";
import { buildRequest, parseResponse, redact } from "../src/clef";
import type { Bookmark } from "../src/schema";
import { vipList } from "./fixtures/vipList";

const bookmark: Bookmark = {
  id: "1",
  url: "https://x.com/someone/status/1",
  authorHandle: "someone",
  authorName: "Some One",
  text: "Open-sourced our agent eval harness",
  createdAt: "2026-10-28T00:00:00.000Z",
  imageUrls: [],
};

describe("buildRequest", () => {
  const req = buildRequest(vipList, bookmark);

  it("maps skip rules, themes and value to question ids with no colons", () => {
    expect(Object.keys(req.questions)).toEqual([
      "skip.ads", "skip.bait", "theme.agents", "theme.startup_ideas", "theme.cloudflare", "value",
    ]);
    expect(Object.keys(req.questions).every((k) => !k.includes(":"))).toBe(true);
  });

  it("uses noul for yes/no and score with level names lowest first", () => {
    expect(req.questions["theme.agents"]!.type).toBe("noul");
    expect(req.questions.value).toMatchObject({ type: "score", criteria: ["archive", "keep", "vip"] });
  });

  it("puts owner and post in state, and only includes images when given", () => {
    expect(req.state).toMatchObject({ owner: vipList.owner_summary, post: { author: "@someone", quoted: null } });
    expect(req.images).toBeUndefined();
    expect(buildRequest(vipList, bookmark, ["a", "b", "c", "d", "e"]).images).toHaveLength(4);
  });
});

describe("parseResponse", () => {
  const answers = {
    "skip.ads": { type: "noul", noul: 0.05 },
    "skip.bait": { type: "noul", noul: 0.1 },
    "theme.agents": { type: "noul", noul: 0.93 },
    "theme.startup_ideas": { type: "noul", noul: 0.2 },
    "theme.cloudflare": { type: "noul", noul: 0.4 },
    value: {
      type: "score",
      score: 1.7,
      legend: { "0": "archive", "1": "keep", "2": "vip" },
      probabilities: { "0": 0.05, "1": 0.2, "2": 0.75 },
      confidence: 0.75,
    },
  };
  const expected = {
    skip: { ads: 0.05, bait: 0.1 },
    theme: { agents: 0.93, startup_ideas: 0.2, cloudflare: 0.4 },
    value: 1.7,
  };

  it("reads a bare response", () => {
    expect(parseResponse({ model: "clef-flash", answers }, vipList)).toEqual(expected);
  });

  it("reads Cloudflare's result envelope", () => {
    expect(parseResponse({ result: { answers }, success: true, errors: [] }, vipList)).toEqual(expected);
  });

  it("throws a readable error when an answer is missing", () => {
    const { value: _v, ...rest } = answers;
    expect(() => parseResponse({ answers: rest }, vipList)).toThrow(/"value"/);
    expect(() => parseResponse({}, vipList)).toThrow(/no answers/);
  });
});

describe("redact", () => {
  it("hides credentials in error text", () => {
    const msg = "Could not route to /accounts/cfut_secret123/ai/run/x";
    expect(redact(msg, ["cfut_secret123", ""])).toBe("Could not route to /accounts/<hidden>/ai/run/x");
  });
});

