// The only file that talks to X's official API. Optional: the default path is src/fetchBookmarks.ts.
// Runs in the background service worker, so no x.com tab is needed. Bookmarks are read with the user's own
// X developer app (OAuth 2.0 Authorization Code with PKCE, public client, no secret).
import { redact } from "./clef";
import { X_EXPIRED, XAuthError } from "./messages";
import type { Bookmark } from "./schema";
import { get, set, type XAuth } from "./storage";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const API = "https://api.x.com/2";
export const SCOPES = "tweet.read users.read bookmark.read offline.access";
/** Refresh this long before the access token runs out. */
const SKEW_MS = 60_000;
/** Modest on purpose: X bills API reads to the developer account. */
export const PAGE_SIZE = 20;

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- PKCE ----------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** 32 random bytes encode to 43 characters, the minimum RFC 7636 allows. */
export const newCodeVerifier = (): string => randomString(32);
export const newState = (): string => randomString(16);

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: SCOPES,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${q}`;
}

/** Pull the code out of the redirect, checking `state` first. */
export function parseRedirect(redirectUrl: string, expectedState: string): string {
  const q = new URL(redirectUrl).searchParams;
  if (q.get("state") !== expectedState) throw new Error("X sign-in was rejected: the response did not match this request (state)");
  const err = q.get("error");
  if (err) throw new Error(`X sign-in failed: ${q.get("error_description") ?? err}`);
  const code = q.get("code");
  if (!code) throw new Error("X sign-in failed: no code came back");
  return code;
}

// ---- tokens --------------------------------------------------------------

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function postToken(form: Record<string, string>, secrets: string[]): Promise<{ ok: true; body: TokenResponse } | { ok: false; status: number; message: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  let body: TokenResponse = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !body.access_token) {
    const why = body.error_description ?? body.error ?? "no access token returned";
    return { ok: false, status: res.status, message: redact(`HTTP ${res.status}: ${why}`.slice(0, 200), secrets) };
  }
  return { ok: true, body };
}

function toAuth(body: TokenResponse, previous?: XAuth, now = Date.now()): XAuth {
  return {
    ...previous,
    accessToken: body.access_token!,
    refreshToken: body.refresh_token ?? previous?.refreshToken ?? "",
    expiresAt: now + (body.expires_in ?? 7200) * 1000,
  };
}

export async function exchangeCode(clientId: string, code: string, verifier: string, redirectUri: string, now = Date.now()): Promise<XAuth> {
  const r = await postToken(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId },
    [code, verifier],
  );
  if (!r.ok) throw new Error(`X token exchange failed (${r.message})`);
  return toAuth(r.body, undefined, now);
}

/** One refresh at a time: X rotates the refresh token, so two racing refreshes would break each other. */
let refreshing: Promise<XAuth> | null = null;

async function recordProblem(message: string, forgetTokens: boolean): Promise<void> {
  await set("xApiProblem", message);
  if (forgetTokens) await set("xApiAuth", null);
}

async function doRefresh(clientId: string, auth: XAuth, now: number): Promise<XAuth> {
  let r;
  try {
    r = await postToken({ grant_type: "refresh_token", refresh_token: auth.refreshToken, client_id: clientId }, [auth.refreshToken, auth.accessToken]);
  } catch {
    await recordProblem("X API sign-in could not be refreshed (no network?). Grokmark will try again", false);
    throw new XAuthError("Couldn't refresh the X API sign-in (network error)");
  }
  if (!r.ok) {
    // 400/401: X refused the refresh token for good. Anything else may pass, so keep the tokens.
    const definitive = r.status === 400 || r.status === 401;
    await recordProblem(definitive ? X_EXPIRED : `X API sign-in could not be refreshed (${r.message}). Grokmark will try again`, definitive);
    throw new XAuthError(definitive ? X_EXPIRED : `Couldn't refresh the X API sign-in (${r.message})`);
  }
  const next = toAuth(r.body, auth, now);
  await set("xApiAuth", next);
  await set("xApiProblem", "");
  return next;
}

/** A usable token, refreshing first if it is expired or about to be. `force` refreshes regardless (after a 401). */
export async function validAuth(clientId: string, force = false, now = Date.now()): Promise<XAuth> {
  const auth = await get("xApiAuth");
  if (!auth) throw new XAuthError(X_EXPIRED);
  if (!force && auth.expiresAt - SKEW_MS > now) return auth;
  refreshing ??= doRefresh(clientId, auth, now).finally(() => (refreshing = null));
  return refreshing;
}

// ---- requests ------------------------------------------------------------

function describeFailure(status: number, body: J): string {
  const detail: string = (body?.detail ?? body?.title ?? "").toString().slice(0, 160);
  const hint =
    status === 429
      ? "rate limited, wait a few minutes"
      : status === 402
        ? "your X developer account is out of credits"
        : status === 403
          ? "X refused access: check the app's permissions and plan"
          : "";
  return `X API HTTP ${status}${hint ? ` (${hint})` : ""}${detail ? `: ${detail}` : ""}`;
}

/** GET from the X API with the stored token. A 401 gets one forced refresh and one retry. */
async function apiGet(clientId: string, path: string, params: Record<string, string> = {}): Promise<J> {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    const auth = await validAuth(clientId, attempt > 0);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    if (res.status === 401) {
      if (attempt === 0) continue;
      await recordProblem(X_EXPIRED, true);
      throw new XAuthError(X_EXPIRED);
    }
    let body: J = {};
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new Error(redact(describeFailure(res.status, body), [auth.accessToken, auth.refreshToken]));
    return body;
  }
}

/** Sign in: PKCE through chrome.identity, exchange the code, learn who we are, store everything. */
export async function connectX(clientId: string): Promise<XAuth> {
  const redirectUri = chrome.identity.getRedirectURL();
  const verifier = newCodeVerifier();
  const state = newState();
  const url = buildAuthorizeUrl({ clientId, redirectUri, state, challenge: await codeChallenge(verifier) });
  const back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!back) throw new Error("X sign-in was cancelled");
  const auth = await exchangeCode(clientId, parseRedirect(back, state), verifier, redirectUri);
  await set("xApiAuth", auth);
  await set("xApiProblem", "");
  try {
    const me = (await apiGet(clientId, "/users/me")).data;
    const known = { ...auth, userId: me?.id as string | undefined, handle: me?.username as string | undefined };
    await set("xApiAuth", known);
    return known;
  } catch (e) {
    if (e instanceof XAuthError) throw e;
    return auth; // signed in; the first bookmark read will look up who we are again
  }
}

export async function disconnectX(): Promise<void> {
  await set("xApiAuth", null);
  await set("xApiProblem", "");
}

// ---- mapping -------------------------------------------------------------

/** Tweet ids carry their creation time (Twitter epoch + 22 bit shift). Used only when created_at is missing. */
function dateFromId(id: string): string {
  try {
    return new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** One v2 tweet plus the response's `includes`, in the same shape the session path produces. */
export function v2ToBookmark(t: J | undefined, includes: J = {}): Bookmark | null {
  if (!t?.id) return null;
  const user: J | undefined = (includes.users as J[] | undefined)?.find((u) => u.id === t.author_id);
  const handle: string = user?.username ?? "i";
  const quotedId: string | undefined = (t.referenced_tweets as J[] | undefined)?.find((r) => r.type === "quoted")?.id;
  const quoted: J | undefined = quotedId ? (includes.tweets as J[] | undefined)?.find((q) => q.id === quotedId) : undefined;
  const keys: string[] = t.attachments?.media_keys ?? [];
  const media = (includes.media as J[] | undefined) ?? [];
  const created = t.created_at ? new Date(t.created_at) : null;
  return {
    id: t.id,
    url: `https://x.com/${handle}/status/${t.id}`,
    authorHandle: handle,
    authorName: user?.name ?? handle,
    text: t.note_tweet?.text ?? t.text ?? "",
    createdAt: created && !isNaN(created.getTime()) ? created.toISOString() : dateFromId(t.id),
    imageUrls: keys
      .map((k) => media.find((m) => m.media_key === k))
      .filter((m): m is J => m?.type === "photo" && typeof m.url === "string")
      .map((m) => m.url as string)
      .slice(0, 4),
    quotedText: quoted ? (quoted.note_tweet?.text ?? quoted.text) : undefined,
  };
}

export function parseBookmarksPage(json: J): { bookmarks: Bookmark[]; next: string | null } {
  const bookmarks = ((json?.data as J[] | undefined) ?? []).map((t) => v2ToBookmark(t, json.includes)).filter((b): b is Bookmark => !!b);
  return { bookmarks, next: json?.meta?.next_token ?? null };
}

// ---- fetching ------------------------------------------------------------

/**
 * Newest first. X bills per read, so pages are small (20) and paging stops as soon as a page holds any bookmark
 * already seen (a stricter rule than the session path, which stops only when a whole page is seen), when there is
 * no next page, or at maxPages. `limit` caps the number returned and shrinks the page to match.
 */
export async function fetchXApiBookmarks(clientId: string, seen: Set<string>, maxPages = 3, limit = Infinity): Promise<Bookmark[]> {
  let auth = await validAuth(clientId);
  if (!auth.userId) {
    const me = (await apiGet(clientId, "/users/me")).data;
    if (!me?.id) throw new Error("X API did not say who you are (users/me)");
    auth = { ...((await get("xApiAuth")) ?? auth), userId: me.id, handle: me.username };
    await set("xApiAuth", auth);
  }
  const out: Bookmark[] = [];
  let token: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      max_results: String(Math.max(1, Math.min(PAGE_SIZE, limit))),
      expansions: "author_id,attachments.media_keys,referenced_tweets.id",
      "tweet.fields": "note_tweet,created_at,text,attachments,referenced_tweets,author_id",
      "media.fields": "url,type",
      "user.fields": "username,name",
    };
    if (token) params.pagination_token = token;
    const { bookmarks, next } = parseBookmarksPage(await apiGet(clientId, `/users/${auth.userId}/bookmarks`, params));
    const fresh = bookmarks.filter((b) => !seen.has(b.id));
    out.push(...fresh);
    if (out.length >= limit || fresh.length < bookmarks.length || !next || next === token) break;
    token = next;
  }
  return out.slice(0, limit);
}
