// Chooses where bookmarks come from: the official X API (optional, Advanced) or the logged-in x.com session (default).
// Pure, so it is unit-tested; background.ts supplies the two readers.
import { XAuthError, X_NOT_CONNECTED } from "./messages";
import type { Bookmark } from "./schema";
import type { Settings, XAuth } from "./storage";

type XSettings = Pick<Settings, "xClientId" | "xApiOnly">;

export type Source = { use: "api"; apiOnly: boolean } | { use: "session" } | { use: "blocked"; why: string };

/** The X API counts as connected only with a Client ID and stored tokens. */
export const xConnected = (s: Pick<Settings, "xClientId">, auth: XAuth | null): boolean => !!auth && !!s.xClientId.trim();

export function chooseSource(s: XSettings, auth: XAuth | null, problem = ""): Source {
  if (xConnected(s, auth)) return { use: "api", apiOnly: s.xApiOnly };
  if (s.xApiOnly) return { use: "blocked", why: problem || X_NOT_CONNECTED };
  return { use: "session" };
}

/**
 * Read from the chosen source. Only a lost X sign-in sends a run to the session path, and not when API only is on;
 * every other API failure (rate limit, credits, network) is reported as it is.
 */
export async function readBookmarks(source: Source, readers: { api: () => Promise<Bookmark[]>; session: () => Promise<Bookmark[]> }): Promise<Bookmark[]> {
  if (source.use === "blocked") throw new Error(source.why);
  if (source.use === "session") return readers.session();
  try {
    return await readers.api();
  } catch (e) {
    if (e instanceof XAuthError && !source.apiOnly) return readers.session();
    throw e;
  }
}

/** One line for the options page. */
export function describeXStatus(s: Pick<Settings, "xClientId">, auth: XAuth | null, problem: string): { text: string; ok: boolean } {
  if (problem) return { text: `Needs reconnect: ${problem}`, ok: false };
  if (xConnected(s, auth)) return { text: auth!.handle ? `Connected as @${auth!.handle}` : "Connected", ok: true };
  return { text: "Not connected", ok: false };
}
