import type { Settings, State } from "./storage";

export type GateResult = { run: true } | { run: false; why: string };

const HOUR = 3600_000;

/** Spec §4: decides whether a check may start. `force` is the popup's "Run now". */
export function shouldRun(settings: Settings, state: State, now: Date, force = false): GateResult {
  if (!settings.accountId || !settings.token) return { run: false, why: "Add your Cloudflare account ID and token" };
  if (!settings.vipList) return { run: false, why: "Finish setup: write one sentence about yourself" };
  if (force) return { run: true };

  const [h, m] = settings.doorPolicy.opening_time.split(":").map(Number) as [number, number];
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < h * 60 + m) return { run: false, why: `Doors open at ${settings.doorPolicy.opening_time}` };

  const cooldown = (settings.doorPolicy.cooldown_hours ?? 4) * HOUR;
  if (state.lastSuccess && now.getTime() - state.lastSuccess < cooldown) return { run: false, why: "Cooling down" };

  return { run: true };
}
