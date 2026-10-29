import { describe, expect, it } from "vitest";
import { shouldRun } from "../src/gate";
import { DEFAULT_SETTINGS, type Settings } from "../src/storage";
import { vipList } from "./fixtures/vipList";

const ready: Settings = { ...DEFAULT_SETTINGS, accountId: "acc", token: "tok", vipList };
const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);

describe("shouldRun", () => {
  it("needs credentials and a VIP List, even when forced", () => {
    expect(shouldRun(DEFAULT_SETTINGS, { lastSuccess: null }, at(22), true).run).toBe(false);
    expect(shouldRun({ ...ready, vipList: null }, { lastSuccess: null }, at(22), true).run).toBe(false);
  });
  it("waits for opening time", () => {
    expect(shouldRun(ready, { lastSuccess: null }, at(20, 59)).run).toBe(false);
    expect(shouldRun(ready, { lastSuccess: null }, at(21)).run).toBe(true);
  });
  it("respects the cooldown", () => {
    const early = { ...ready, doorPolicy: { ...ready.doorPolicy, opening_time: "08:00" } };
    const last = at(9).getTime();
    expect(shouldRun(early, { lastSuccess: last }, at(12, 59)).run).toBe(false);
    expect(shouldRun(early, { lastSuccess: last }, at(13)).run).toBe(true);
  });
  it("force bypasses opening time and cooldown", () => {
    expect(shouldRun(ready, { lastSuccess: Date.now() }, at(9), true).run).toBe(true);
  });
});
