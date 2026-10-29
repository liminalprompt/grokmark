import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins where the extension can talk to. docs/permissions.md promises this list; a change here is a change to that promise.
 * Dynamic destinations not visible as literals: the webhook URLs the user pastes (approved per host by Chrome), and
 * the image URLs that come with a bookmark (X's image servers), fetched in src/clef.ts.
 */
const ALLOWED_HOSTS = ["api.cloudflare.com", "api.x.com", "api2.cursor.sh", "x.com"];
const FETCH_SITES = ["src/clef.ts", "src/fetchBookmarks.ts", "src/xApi.ts"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") || p.endsWith(".html") ? [p] : [];
  });
}

const sources = ["src", "options", "popup"].flatMap(files);

describe("network allowlist", () => {
  it("names no host outside the documented list", () => {
    const hosts = new Set<string>();
    for (const f of sources) for (const m of readFileSync(f, "utf8").matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) hosts.add(m[1]!);
    expect([...hosts].sort()).toEqual(ALLOWED_HOSTS);
  });

  it("calls fetch only from the files that are documented to", () => {
    const callers = sources.filter((f) => /\bfetch\(/.test(readFileSync(f, "utf8"))).sort();
    expect(callers).toEqual(FETCH_SITES);
  });

  it("asks for no permission beyond storage, alarms and identity", () => {
    const m = JSON.parse(readFileSync("manifest.json", "utf8")) as { permissions: string[]; host_permissions: string[] };
    expect(m.permissions.sort()).toEqual(["alarms", "identity", "storage"]);
    expect(m.host_permissions.sort()).toEqual(["https://api.cloudflare.com/*", "https://api.x.com/*", "https://x.com/*"]);
  });
});
