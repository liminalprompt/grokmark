import { shouldRun } from "../src/gate";
import type { RunResponse } from "../src/messages";
import { xConnected } from "../src/source";
import { get, getSettings } from "../src/storage";

const $ = (id: string) => document.getElementById(id)!;

async function render() {
  const [settings, state, runs, queue, auth, problem] = await Promise.all([
    getSettings(),
    get("state"),
    get("runs"),
    get("queue"),
    get("xApiAuth"),
    get("xApiProblem"),
  ]);
  const connected = xConnected(settings, auth);
  const gate = shouldRun(settings, state, new Date(), false, { connected, problem });
  const open = connected ? "Doors are open. The next check reads your bookmarks through the X API." : "Doors are open. Next visit to x.com checks.";
  $("status").textContent = gate.run ? open : gate.why;

  const last = runs[runs.length - 1];
  const rows: [string, string][] = [
    ["Last run", last ? new Date(last.startedAt).toLocaleString() : "never"],
    ["Fetched", String(last?.fetched ?? 0)],
    ["VIP / keep / archive", last ? `${last.vip} / ${last.keep} / ${last.archive}` : "-"],
    ["Sent", String(last?.sent ?? 0)],
    ["Waiting in queue", String(queue.length)],
    ["Errors", String(last?.errors.length ?? 0)],
  ];
  const dl = $("stats");
  dl.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
  }
  if (last?.errors.length) $("msg").textContent = last.errors[0]!;
}

$("run").addEventListener("click", async () => {
  $("msg").textContent = "Running…";
  const res: RunResponse = await chrome.runtime.sendMessage({ type: "runNow" });
  $("msg").textContent = res.message;
  void render();
});
$("setup").addEventListener("click", () => chrome.runtime.openOptionsPage());
void render();
