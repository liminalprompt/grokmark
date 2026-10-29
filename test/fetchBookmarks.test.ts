import { describe, expect, it } from "vitest";
import { parseBookmarksUrl, parseTimeline, tweetToBookmark } from "../src/fetchBookmarks";

const url =
  "https://x.com/i/api/graphql/AbC123_-xyz/Bookmarks?variables=" +
  encodeURIComponent(JSON.stringify({ count: 20, includePromotedContent: false, cursor: "OLD" })) +
  "&features=" +
  encodeURIComponent(JSON.stringify({ some_flag: true })) +
  "&fieldToggles=" +
  encodeURIComponent(JSON.stringify({ withArticlePlainText: false }));

describe("parseBookmarksUrl", () => {
  it("copies the query id, variables, features and field toggles from X's own request", () => {
    expect(parseBookmarksUrl(url)).toEqual({
      queryId: "AbC123_-xyz",
      variables: { count: 20, includePromotedContent: false, cursor: "OLD" },
      features: '{"some_flag":true}',
      fieldToggles: '{"withArticlePlainText":false}',
    });
  });

  it("ignores other requests", () => {
    expect(parseBookmarksUrl("https://x.com/i/api/graphql/abc/HomeTimeline?variables=%7B%7D&features=%7B%7D")).toBeNull();
    expect(parseBookmarksUrl("https://x.com/home")).toBeNull();
  });
});

const tweet = {
  rest_id: "111",
  core: { user_results: { result: { core: { screen_name: "dev", name: "Dev" } } } },
  legacy: {
    full_text: "hello",
    created_at: "Wed Oct 28 12:00:00 +0000 2026",
    extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/a.jpg" }] },
  },
};

describe("tweetToBookmark / parseTimeline", () => {
  it("maps a tweet result, including photos and the wrapped visibility form", () => {
    const b = tweetToBookmark({ tweet });
    expect(b).toMatchObject({ id: "111", url: "https://x.com/dev/status/111", authorHandle: "dev", text: "hello" });
    expect(b?.imageUrls).toEqual(["https://pbs.twimg.com/a.jpg"]);
  });

  it("finds the timeline wherever X nests it and returns the bottom cursor", () => {
    const json = {
      data: {
        some_renamed_timeline: {
          timeline: {
            instructions: [
              {
                entries: [
                  { content: { itemContent: { tweet_results: { result: tweet } } } },
                  { content: { cursorType: "Bottom", value: "NEXT" } },
                ],
              },
            ],
          },
        },
      },
    };
    const { bookmarks, cursor } = parseTimeline(json);
    expect(bookmarks.map((b) => b.id)).toEqual(["111"]);
    expect(cursor).toBe("NEXT");
  });

  it("explains an unexpected response instead of returning nothing", () => {
    expect(() => parseTimeline({ errors: [{ message: "Bad guest token" }] })).toThrow(/unexpected shape.*Bad guest token/);
  });
});
