import { describe, expect, it, vi } from "vitest";
import { shouldRun } from "../src/gate";
import { X_EXPIRED, X_NOT_CONNECTED, XAuthError } from "../src/messages";
import type { Bookmark } from "../src/schema";
import { chooseSource, describeXStatus, readBookmarks, xConnected } from "../src/source";
import { DEFAULT_SETTINGS, type XAuth } from "../src/storage";
import { vipList } from "./fixtures/vipList";

const tokens: XAuth = { accessToken: "a", refreshToken: "r", expiresAt: 1, handle: "me" };
const on = { xClientId: "test-client-id", xApiOnly: false };
const bm = (id: string): Bookmark => ({ id, url: "", authorHandle: "", authorName: "", text: "", createdAt: "", imageUrls: [] });

describe("chooseSource", () => {
  it("defaults to the x.com session", () => {
    expect(DEFAULT_SETTINGS.xClientId).toBe("");
    expect(DEFAULT_SETTINGS.xApiOnly).toBe(false);
    expect(chooseSource(DEFAULT_SETTINGS, null)).toEqual({ use: "session" });
    expect(chooseSource(on, null)).toEqual({ use: "session" }); // client id but never connected
  });
  it("uses the API once connected", () => {
    expect(chooseSource(on, tokens)).toEqual({ use: "api", apiOnly: false });
    expect(chooseSource({ ...on, xApiOnly: true }, tokens)).toEqual({ use: "api", apiOnly: true });
  });
  it("needs both the client id and tokens", () => {
    expect(xConnected({ xClientId: "" }, tokens)).toBe(false);
    expect(chooseSource({ xClientId: " ", xApiOnly: false }, tokens)).toEqual({ use: "session" });
  });
  it("blocks API only that is not connected, with the reason", () => {
    expect(chooseSource({ ...on, xApiOnly: true }, null)).toEqual({ use: "blocked", why: X_NOT_CONNECTED });
    expect(chooseSource({ ...on, xApiOnly: true }, null, X_EXPIRED)).toEqual({ use: "blocked", why: X_EXPIRED });
  });
});

describe("readBookmarks", () => {
  const readers = () => ({ api: vi.fn(async () => [bm("api")]), session: vi.fn(async () => [bm("session")]) });

  it("reads the session when that is the source", async () => {
    const r = readers();
    expect((await readBookmarks({ use: "session" }, r)).map((b) => b.id)).toEqual(["session"]);
    expect(r.api).not.toHaveBeenCalled();
  });
  it("reads the API, with no tab involved", async () => {
    const r = readers();
    expect((await readBookmarks({ use: "api", apiOnly: false }, r)).map((b) => b.id)).toEqual(["api"]);
    expect(r.session).not.toHaveBeenCalled();
  });
  it("falls back to the session for the run when the X sign-in is lost", async () => {
    const r = readers();
    r.api.mockRejectedValue(new XAuthError(X_EXPIRED));
    expect((await readBookmarks({ use: "api", apiOnly: false }, r)).map((b) => b.id)).toEqual(["session"]);
  });
  it("fails with the clear message instead when API only is on", async () => {
    const r = readers();
    r.api.mockRejectedValue(new XAuthError(X_EXPIRED));
    await expect(readBookmarks({ use: "api", apiOnly: true }, r)).rejects.toThrow(X_EXPIRED);
    expect(r.session).not.toHaveBeenCalled();
  });
  it("does not fall back for other API errors such as a rate limit", async () => {
    const r = readers();
    r.api.mockRejectedValue(new Error("X API HTTP 429 (rate limited, wait a few minutes)"));
    await expect(readBookmarks({ use: "api", apiOnly: false }, r)).rejects.toThrow(/429/);
    expect(r.session).not.toHaveBeenCalled();
  });
  it("refuses when blocked", async () => {
    const r = readers();
    await expect(readBookmarks({ use: "blocked", why: X_NOT_CONNECTED }, r)).rejects.toThrow(X_NOT_CONNECTED);
    expect(r.api).not.toHaveBeenCalled();
    expect(r.session).not.toHaveBeenCalled();
  });
});

describe("gate with API only", () => {
  const ready = { ...DEFAULT_SETTINGS, accountId: "acc", token: "tok", vipList, xApiOnly: true };
  const state = { lastSuccess: null };
  const at = new Date(2026, 9, 28, 22);

  it("says so when API only is on but X is not connected", () => {
    expect(shouldRun(ready, state, at, true)).toEqual({ run: false, why: X_NOT_CONNECTED });
    expect(shouldRun(ready, state, at, true, { connected: false, problem: X_EXPIRED })).toEqual({ run: false, why: X_EXPIRED });
  });
  it("runs once connected, and the session-only default is untouched", () => {
    expect(shouldRun(ready, state, at, true, { connected: true }).run).toBe(true);
    expect(shouldRun({ ...ready, xApiOnly: false }, state, at, true).run).toBe(true);
  });
});

describe("describeXStatus", () => {
  it("describes each state", () => {
    expect(describeXStatus({ xClientId: "" }, null, "")).toEqual({ text: "Not connected", ok: false });
    expect(describeXStatus(on, tokens, "").text).toBe("Connected as @me");
    expect(describeXStatus(on, null, X_EXPIRED)).toEqual({ text: `Needs reconnect: ${X_EXPIRED}`, ok: false });
  });
});
