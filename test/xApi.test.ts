import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { X_EXPIRED, XAuthError } from "../src/messages";
import type { XAuth } from "../src/storage";
import {
  buildAuthorizeUrl,
  codeChallenge,
  connectX,
  fetchXApiBookmarks,
  newCodeVerifier,
  parseBookmarksPage,
  parseRedirect,
  v2ToBookmark,
} from "../src/xApi";

const CLIENT = "test-client-id";
const REDIRECT = "https://test-extension-id.chromiumapp.org/";

let store: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
let launch: ReturnType<typeof vi.fn>;

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const auth = (over: Partial<XAuth> = {}): XAuth => ({
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: Date.now() + 3600_000,
  userId: "42",
  handle: "me",
  ...over,
});
const call = (i: number) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url: new URL(url), init };
};

beforeEach(() => {
  store = {};
  fetchMock = vi.fn();
  launch = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (o: Record<string, unknown>) => void Object.assign(store, o),
      },
    },
    identity: { getRedirectURL: () => REDIRECT, launchWebAuthFlow: launch },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("PKCE", () => {
  it("matches the RFC 7636 Appendix B test vector", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes a fresh verifier of 43 to 128 URL-safe characters", () => {
    const a = newCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(newCodeVerifier()).not.toBe(a);
  });

  it("builds the authorize URL", () => {
    const u = new URL(buildAuthorizeUrl({ clientId: CLIENT, redirectUri: REDIRECT, state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      scope: "tweet.read users.read bookmark.read offline.access",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("checks state on the way back", () => {
    expect(parseRedirect(`${REDIRECT}?code=c1&state=st`, "st")).toBe("c1");
    expect(() => parseRedirect(`${REDIRECT}?code=c1&state=other`, "st")).toThrow(/state/);
    expect(() => parseRedirect(`${REDIRECT}?error=access_denied&state=st`, "st")).toThrow(/access_denied/);
    expect(() => parseRedirect(`${REDIRECT}?state=st`, "st")).toThrow(/no code/);
  });
});

describe("connectX", () => {
  it("runs the PKCE flow, exchanges the code and stores the tokens and handle", async () => {
    launch.mockImplementation(async ({ url }: { url: string }) => {
      const q = new URL(url).searchParams;
      return `${REDIRECT}?code=the-code&state=${q.get("state")}`;
    });
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: "access-1", refresh_token: "refresh-1", expires_in: 7200 }))
      .mockResolvedValueOnce(reply(200, { data: { id: "42", username: "me" } }));

    const got = await connectX(CLIENT);

    const asked = launch.mock.calls[0]![0] as { url: string; interactive: boolean };
    expect(asked.interactive).toBe(true);
    const q = new URL(asked.url).searchParams;
    expect(q.get("client_id")).toBe(CLIENT);
    expect(q.get("redirect_uri")).toBe(REDIRECT);

    const token = call(0);
    expect(token.url.href).toBe("https://api.x.com/2/oauth2/token");
    expect(token.init.method).toBe("POST");
    expect((token.init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(token.init.body as string);
    expect(Object.fromEntries(form)).toMatchObject({ grant_type: "authorization_code", code: "the-code", redirect_uri: REDIRECT, client_id: CLIENT });
    expect(await codeChallenge(form.get("code_verifier")!)).toBe(q.get("code_challenge"));
    expect(form.has("client_secret")).toBe(false);

    expect(got).toMatchObject({ accessToken: "access-1", refreshToken: "refresh-1", userId: "42", handle: "me" });
    expect((store.xApiAuth as XAuth).expiresAt).toBeGreaterThan(Date.now());
    expect(store.xApiProblem).toBe("");
    expect(store.settings).toBeUndefined(); // tokens never live in settings
  });

  it("refuses a response whose state does not match, and stores nothing", async () => {
    launch.mockResolvedValue(`${REDIRECT}?code=the-code&state=forged`);
    await expect(connectX(CLIENT)).rejects.toThrow(/state/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.xApiAuth).toBeUndefined();
  });

  it("reports a failed exchange without echoing the code", async () => {
    launch.mockImplementation(async ({ url }: { url: string }) => `${REDIRECT}?code=secret-code&state=${new URL(url).searchParams.get("state")}`);
    fetchMock.mockResolvedValueOnce(reply(400, { error: "invalid_request", error_description: "bad code secret-code" }));
    const err = await connectX(CLIENT).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/token exchange failed.*400/);
    expect((err as Error).message).not.toContain("secret-code");
  });
});

describe("token refresh", () => {
  it("refreshes an expired token first and stores the rotated refresh token", async () => {
    store.xApiAuth = auth({ expiresAt: Date.now() - 1000 });
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: "access-2", refresh_token: "refresh-2", expires_in: 7200 }))
      .mockResolvedValueOnce(reply(200, { data: [] }));

    await fetchXApiBookmarks(CLIENT, new Set());

    const form = new URLSearchParams(call(0).init.body as string);
    expect(Object.fromEntries(form)).toEqual({ grant_type: "refresh_token", refresh_token: "refresh-1", client_id: CLIENT });
    expect((call(1).init.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
    expect(store.xApiAuth).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2", userId: "42", handle: "me" });
  });

  it("refreshes and retries once on a 401", async () => {
    store.xApiAuth = auth();
    fetchMock
      .mockResolvedValueOnce(reply(401, { title: "Unauthorized" }))
      .mockResolvedValueOnce(reply(200, { access_token: "access-2", refresh_token: "refresh-2", expires_in: 7200 }))
      .mockResolvedValueOnce(reply(200, { data: [{ id: "1", text: "hi", author_id: "9" }] }));

    const out = await fetchXApiBookmarks(CLIENT, new Set());

    expect(out.map((b) => b.id)).toEqual(["1"]);
    expect(call(1).url.pathname).toBe("/2/oauth2/token");
    expect((call(2).init.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
    expect((store.xApiAuth as XAuth).refreshToken).toBe("refresh-2");
  });

  it("records a clear status and signs out when X refuses the refresh", async () => {
    store.xApiAuth = auth({ expiresAt: Date.now() - 1000 });
    fetchMock.mockResolvedValueOnce(reply(400, { error: "invalid_grant", error_description: "Value passed for the token was invalid: refresh-1" }));

    const err = await fetchXApiBookmarks(CLIENT, new Set()).catch((e: Error) => e);

    expect(err).toBeInstanceOf(XAuthError);
    expect((err as Error).message).toBe(X_EXPIRED);
    expect(store.xApiProblem).toBe(X_EXPIRED);
    expect(store.xApiAuth).toBeNull();
  });

  it("keeps the tokens when the refresh fails for a passing reason", async () => {
    store.xApiAuth = auth({ expiresAt: Date.now() - 1000 });
    fetchMock.mockResolvedValueOnce(reply(503, {}));
    await expect(fetchXApiBookmarks(CLIENT, new Set())).rejects.toBeInstanceOf(XAuthError);
    expect(store.xApiAuth).not.toBeNull();
    expect(store.xApiProblem).toMatch(/try again/);
  });

  it("gives up with the sign-in message when a refreshed token is still refused", async () => {
    store.xApiAuth = auth();
    fetchMock
      .mockResolvedValueOnce(reply(401, {}))
      .mockResolvedValueOnce(reply(200, { access_token: "access-2", refresh_token: "refresh-2", expires_in: 7200 }))
      .mockResolvedValueOnce(reply(401, {}));
    await expect(fetchXApiBookmarks(CLIENT, new Set())).rejects.toThrow(X_EXPIRED);
    expect(store.xApiProblem).toBe(X_EXPIRED);
  });
});

describe("fetchXApiBookmarks", () => {
  const tw = (id: string) => ({ id, text: `t${id}`, author_id: "9", created_at: "2026-10-28T12:00:00.000Z" });

  it("asks for the right fields and pages with pagination_token", async () => {
    store.xApiAuth = auth();
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: [tw("3"), tw("2")], meta: { next_token: "NEXT" } }))
      .mockResolvedValueOnce(reply(200, { data: [tw("1")], meta: {} }));

    const out = await fetchXApiBookmarks(CLIENT, new Set());

    expect(out.map((b) => b.id)).toEqual(["3", "2", "1"]);
    const first = call(0).url;
    expect(first.origin + first.pathname).toBe("https://api.x.com/2/users/42/bookmarks");
    expect(first.searchParams.get("max_results")).toBe("20");
    expect(first.searchParams.get("expansions")).toBe("author_id,attachments.media_keys,referenced_tweets.id");
    expect(first.searchParams.get("tweet.fields")).toContain("note_tweet");
    expect(first.searchParams.get("media.fields")).toBe("url,type");
    expect(first.searchParams.get("user.fields")).toBe("username,name");
    expect(first.searchParams.has("pagination_token")).toBe(false);
    expect(call(1).url.searchParams.get("pagination_token")).toBe("NEXT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("looks up who you are once and caches the id", async () => {
    store.xApiAuth = auth({ userId: undefined, handle: undefined });
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: { id: "77", username: "dev" } }))
      .mockResolvedValueOnce(reply(200, { data: [] }));
    await fetchXApiBookmarks(CLIENT, new Set());
    expect(call(0).url.pathname).toBe("/2/users/me");
    expect(call(1).url.pathname).toBe("/2/users/77/bookmarks");
    expect(store.xApiAuth).toMatchObject({ userId: "77", handle: "dev" });
  });

  it("stops at the first page that holds an already-seen bookmark, keeping that page's unseen ones", async () => {
    store.xApiAuth = auth();
    fetchMock.mockResolvedValueOnce(reply(200, { data: [tw("3"), tw("2"), tw("1")], meta: { next_token: "NEXT" } }));
    const out = await fetchXApiBookmarks(CLIENT, new Set(["2"]));
    expect(out.map((b) => b.id)).toEqual(["3", "1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects maxPages and limit, and shrinks the page to the limit", async () => {
    store.xApiAuth = auth();
    fetchMock.mockImplementation(async () => reply(200, { data: [tw("3"), tw("2")], meta: { next_token: "NEXT" } }));
    expect(await fetchXApiBookmarks(CLIENT, new Set(), 1)).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const limited = await fetchXApiBookmarks(CLIENT, new Set(), 3, 1);
    expect(limited).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call(0).url.searchParams.get("max_results")).toBe("1");
  });

  it("explains rate limits and missing credits with the status", async () => {
    store.xApiAuth = auth();
    fetchMock.mockResolvedValueOnce(reply(429, { title: "Too Many Requests" }));
    await expect(fetchXApiBookmarks(CLIENT, new Set())).rejects.toThrow(/HTTP 429.*rate limited/);
    fetchMock.mockResolvedValueOnce(reply(402, { title: "CreditsDepleted" }));
    await expect(fetchXApiBookmarks(CLIENT, new Set())).rejects.toThrow(/HTTP 402.*credits/);
    fetchMock.mockResolvedValueOnce(reply(403, { detail: "Forbidden" }));
    await expect(fetchXApiBookmarks(CLIENT, new Set())).rejects.toThrow(/HTTP 403.*Forbidden/);
  });
});

describe("v2 mapping", () => {
  const users = [{ id: "9", username: "dev", name: "Dev" }];

  it("maps a tweet to the same Bookmark shape as the session path", () => {
    const b = v2ToBookmark({ id: "5", text: "short", author_id: "9", created_at: "2026-10-28T12:00:00.000Z" }, { users });
    expect(b).toEqual({
      id: "5",
      url: "https://x.com/dev/status/5",
      authorHandle: "dev",
      authorName: "Dev",
      text: "short",
      createdAt: "2026-10-28T12:00:00.000Z",
      imageUrls: [],
      quotedText: undefined,
    });
  });

  it("prefers the long-post text", () => {
    const b = v2ToBookmark({ id: "5", text: "cut off…", note_tweet: { text: "the whole long post" }, author_id: "9" }, { users });
    expect(b?.text).toBe("the whole long post");
  });

  it("finds the quoted tweet, using its long text if it has one", () => {
    const t = { id: "5", text: "look", author_id: "9", referenced_tweets: [{ type: "replied_to", id: "7" }, { type: "quoted", id: "6" }] };
    const includes = { users, tweets: [{ id: "7", text: "wrong" }, { id: "6", text: "short", note_tweet: { text: "long quoted" } }] };
    expect(v2ToBookmark(t, includes)?.quotedText).toBe("long quoted");
    expect(v2ToBookmark(t, { users, tweets: [{ id: "6", text: "plain" }] })?.quotedText).toBe("plain");
  });

  it("keeps photos only, at most four", () => {
    const keys = ["m1", "m2", "m3", "m4", "m5", "m6", "gone"];
    const media = [
      { media_key: "m1", type: "photo", url: "https://pbs.twimg.com/1.jpg" },
      { media_key: "m2", type: "video" },
      { media_key: "m3", type: "animated_gif" },
      { media_key: "m4", type: "photo", url: "https://pbs.twimg.com/4.jpg" },
      { media_key: "m5", type: "photo", url: "https://pbs.twimg.com/5.jpg" },
      { media_key: "m6", type: "photo", url: "https://pbs.twimg.com/6.jpg" },
    ];
    const b = v2ToBookmark({ id: "5", text: "pics", author_id: "9", attachments: { media_keys: keys } }, { users, media });
    expect(b?.imageUrls).toEqual(["https://pbs.twimg.com/1.jpg", "https://pbs.twimg.com/4.jpg", "https://pbs.twimg.com/5.jpg", "https://pbs.twimg.com/6.jpg"]);
  });

  it("copes with missing includes", () => {
    const b = v2ToBookmark({ id: "1500000000000000000", text: "bare", author_id: "9", attachments: { media_keys: ["m1"] }, referenced_tweets: [{ type: "quoted", id: "6" }] });
    expect(b).toMatchObject({ authorHandle: "i", authorName: "i", url: "https://x.com/i/status/1500000000000000000", imageUrls: [], quotedText: undefined });
    expect(b?.createdAt).toMatch(/^2022-/); // taken from the id when created_at is missing
  });

  it("parses a page, with no data and with a next token", () => {
    expect(parseBookmarksPage({ meta: { result_count: 0 } })).toEqual({ bookmarks: [], next: null });
    const page = parseBookmarksPage({ data: [{ id: "1", text: "a", author_id: "9" }], includes: { users }, meta: { next_token: "N" } });
    expect(page.next).toBe("N");
    expect(page.bookmarks[0]?.authorHandle).toBe("dev");
  });
});
