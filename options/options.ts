import { BASIC_ROUTE, effectiveVipList, isStockShaped, splitNames, type EffectiveList } from "../src/effectiveList";
import type { TestResponse } from "../src/messages";
import { VIP_LIST_PROMPT, buildTuningPrompt } from "../src/prompt";
import { DEFAULT_DOOR_POLICY, addLabel, checkAccountId, type Bookmark, type Label } from "../src/schema";
import { getSettings, set, type QueueItem, type Route } from "../src/storage";
import { flushQueue } from "../src/webhook";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const area = (id: string) => $<HTMLTextAreaElement>(id);
const ROUTE_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/** Routes the user has saved or added, including ones not shown by the current list, so no key is ever lost. */
let routeValues: Route[] = [];
/** Advanced: theme id -> route, only where it differs from the list's own route. */
let themeRoutes: Record<string, string> = {};

function inputs() {
  return {
    vipListJson: area("vipListJson").value,
    ownerSummary: area("ownerSummary").value,
    watchNames: splitNames(input("watchNames").value),
    themeRoutes,
  };
}

const effective = (): EffectiveList => effectiveVipList(inputs());

function renderStatus() {
  const eff = effective();
  const out = $("vipStatus");
  if (eff.list) {
    out.className = "ok";
    const n = `${eff.list.themes.length} themes, ${eff.list.skip_rules.length} skip rules`;
    out.textContent = eff.source === "stock" ? `Using the stock VIP List with your sentence and names: ${n}` : `Using your own VIP List: ${n}`;
  } else {
    out.className = "err";
    out.textContent = eff.problem;
  }
  renderRoutes();
  renderThemeRoutes();
}

/** Every route name in play: the basic webhook, the list's own routes, and anything saved or added. */
function routeNames(): string[] {
  const eff = effective();
  const names = new Set<string>([BASIC_ROUTE, ...routeValues.map((r) => r.route)]);
  for (const t of eff.list?.themes ?? []) names.add(t.route);
  return [...names];
}

/** Pull what the user typed in the advanced route rows back into routeValues before re-rendering. */
function rememberRouteRows() {
  $("routes").querySelectorAll<HTMLElement>(".row").forEach((row) => {
    const name = row.dataset.route!;
    const url = row.querySelector<HTMLInputElement>(".url")!.value;
    const key = row.querySelector<HTMLInputElement>(".key")!.value;
    routeValues = [...routeValues.filter((r) => r.route !== name), { route: name, url, key }];
  });
}

function renderRoutes() {
  rememberRouteRows();
  const box = $("routes");
  box.innerHTML = "";
  const themes = effective().list?.themes ?? [];
  const extra = routeNames().filter((n) => n !== BASIC_ROUTE);
  if (!extra.length) {
    box.innerHTML = "<small>No extra routes yet. Every theme goes to the webhook above.</small>";
    return;
  }
  for (const name of extra) {
    const have = routeValues.find((r) => r.route === name);
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.route = name;
    const label = document.createElement("strong");
    label.textContent = name;
    const url = document.createElement("input");
    url.className = "url";
    url.placeholder = "https://api2.cursor.sh/automations/webhook/…";
    url.value = have?.url ?? "";
    const key = document.createElement("input");
    key.className = "key";
    key.type = "password";
    key.placeholder = "crsr_…";
    key.value = have?.key ?? "";
    const under = document.createElement("small");
    const mine = themes.filter((t) => t.route === name).map((t) => t.name);
    under.textContent = mine.length ? `Themes: ${mine.join(", ")}` : "No themes point here yet";
    row.append(label, url, key, under);
    box.append(row);
  }
}

function renderThemeRoutes() {
  const box = $("themeRoutes");
  box.innerHTML = "";
  const eff = effective();
  if (!eff.list) {
    box.innerHTML = "<small>Finish the basic setup to see your themes.</small>";
    return;
  }
  const names = routeNames();
  for (const t of eff.base.themes) {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("strong");
    label.textContent = t.name;
    const sel = document.createElement("select");
    for (const n of names) sel.add(new Option(n, n));
    sel.value = themeRoutes[t.id] ?? t.route;
    sel.addEventListener("change", () => {
      if (sel.value === t.route) delete themeRoutes[t.id];
      else themeRoutes[t.id] = sel.value;
      renderRoutes();
    });
    const note = document.createElement("small");
    note.textContent = themeRoutes[t.id] ? `List says ${t.route}` : "";
    row.append(label, sel, note);
    box.append(row);
  }
}

function addRoute() {
  const name = input("newRoute").value.trim();
  if (!ROUTE_RE.test(name)) {
    $("saveStatus").className = "err";
    $("saveStatus").textContent = "Route names use letters, digits, _ . - only";
    return;
  }
  if (!routeValues.some((r) => r.route === name)) routeValues.push({ route: name, url: "", key: "" });
  input("newRoute").value = "";
  renderRoutes();
  renderThemeRoutes();
}

function collectRoutes(): Route[] {
  rememberRouteRows();
  const basic: Route = { route: BASIC_ROUTE, url: input("webhookUrl").value.trim(), key: input("webhookKey").value.trim() };
  const others = routeValues.filter((r) => r.route !== BASIC_ROUTE).map((r) => ({ ...r, url: r.url.trim(), key: r.key.trim() }));
  return [basic, ...others];
}

/** POST a payload to the routes given and describe what happened, in one line. */
async function sendItems(items: QueueItem[], routes: Route[]): Promise<string> {
  const r = await flushQueue(items, routes);
  if (r.errors.length) return r.errors.join("; ");
  return `Sent ${r.sent} item${r.sent === 1 ? "" : "s"} to the webhook. Check the routine in Grok Bot.`;
}

async function ping() {
  const out = $("pingStatus");
  out.className = "";
  out.textContent = "Sending…";
  if (!(await save())) {
    out.textContent = "";
    return;
  }
  const sample: QueueItem = {
    id: "test",
    url: "https://x.com/liminalprompt/status/0",
    route: BASIC_ROUTE,
    theme: "Test ping",
    action: "Test ping from Grokmark setup. No action needed.",
    confidence: 1,
    queuedAt: Date.now(),
  };
  const msg = await sendItems([sample], collectRoutes());
  out.className = msg.startsWith("Sent") ? "ok" : "err";
  out.textContent = msg;
}

async function load() {
  const s = await getSettings();
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  input("accountId").value = s.accountId;
  input("token").value = s.token;
  area("ownerSummary").value = s.ownerSummary;
  input("watchNames").value = s.watchNames.join(", ");
  // An older setup page put the stock list in this box; it is not the user's own list, so start clean.
  area("vipListJson").value = isStockShaped(s.vipListJson) ? "" : s.vipListJson;
  routeValues = s.routes;
  themeRoutes = { ...s.themeRoutes };
  const basic = s.routes.find((r) => r.route === BASIC_ROUTE);
  input("webhookUrl").value = basic?.url ?? "";
  input("webhookKey").value = basic?.key ?? "";
  const d = s.doorPolicy;
  input("vip_min_score").value = String(d.vip_min_score);
  input("batch_size").value = String(d.batch_size);
  input("opening_time").value = d.opening_time;
  input("cooldown_hours").value = String(d.cooldown_hours ?? DEFAULT_DOOR_POLICY.cooldown_hours);
  if (s.vipListJson.trim() || Object.keys(themeRoutes).length || s.routes.some((r) => r.route !== BASIC_ROUTE && r.url))
    $<HTMLDetailsElement>("advanced").open = true;
  renderStatus();
  await renderLabelsFooter();
}

async function save(): Promise<boolean> {
  const status = $("saveStatus");
  const idProblem = input("accountId").value.trim() ? checkAccountId(input("accountId").value) : null;
  if (idProblem) {
    status.className = "err";
    status.textContent = idProblem;
    return false;
  }
  const routes = collectRoutes();
  for (const r of routes.filter((r) => r.url)) {
    try {
      const origin = new URL(r.url).origin + "/*";
      const ok = await chrome.permissions.request({ origins: [origin] });
      if (!ok) {
        status.className = "err";
        status.textContent = `Permission to reach ${origin} was declined`;
        return false;
      }
    } catch {
      status.className = "err";
      status.textContent = `Route "${r.route}" has an invalid URL`;
      return false;
    }
  }
  const eff = effective();
  const { labels } = await getSettings();
  await set("settings", {
    accountId: input("accountId").value.trim(),
    token: input("token").value.trim(),
    routes,
    ownerSummary: area("ownerSummary").value.trim(),
    watchNames: splitNames(input("watchNames").value),
    vipListJson: area("vipListJson").value,
    themeRoutes,
    vipList: eff.list,
    doorPolicy: {
      ...(eff.list?.door_policy ?? DEFAULT_DOOR_POLICY),
      vip_min_score: Number(input("vip_min_score").value),
      batch_size: Number(input("batch_size").value),
      opening_time: input("opening_time").value || DEFAULT_DOOR_POLICY.opening_time,
      cooldown_hours: Number(input("cooldown_hours").value),
    },
    labels,
  });
  status.className = eff.list ? "ok" : "err";
  status.textContent = eff.list ? "Saved" : `Saved, but Grokmark won't run yet: ${eff.problem}`;
  return !!eff.list;
}

/** Remember a verdict the user disagrees with. Stays in local storage until the tuning prompt is copied or cleared. */
async function mark(l: Label) {
  const s = await getSettings();
  await set("settings", { ...s, labels: addLabel(s.labels, l) });
}

function markCell(b: Bookmark, got: string, matchedId?: string): HTMLElement {
  const td = document.createElement("td");
  td.className = "mark";
  const list = effective().list;
  if (!list) return td;
  const sel = document.createElement("select");
  for (const t of list.themes) sel.add(new Option(t.name, t.id));
  if (matchedId) sel.value = matchedId;
  const note = document.createElement("small");
  const mk = (label: string, want: Label["want"]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      await mark({ handle: b.authorHandle, text: b.text, got, want, themeId: want === "vip" ? sel.value : undefined });
      note.textContent = "Marked.";
      await renderLabelsFooter();
    });
    return btn;
  };
  td.append(sel, mk("Should be VIP", "vip"), mk("Not VIP", "not_vip"), note);
  return td;
}

async function renderLabelsFooter() {
  const box = $("labels");
  const { labels } = await getSettings();
  box.replaceChildren();
  if (!labels.length) return;
  const small = document.createElement("small");
  small.textContent = `${labels.length} verdict${labels.length === 1 ? "" : "s"} marked. Copy the tuning prompt, run it in your AI, then paste the new VIP List under Advanced. `;
  const copy = document.createElement("button");
  copy.textContent = "Copy tuning prompt";
  copy.addEventListener("click", async () => {
    const list = effective().list;
    await navigator.clipboard.writeText(buildTuningPrompt(list ? JSON.stringify(list, null, 2) : area("vipListJson").value, labels));
    copy.textContent = "Copied";
  });
  const clear = document.createElement("button");
  clear.textContent = "Clear marks";
  clear.addEventListener("click", async () => {
    await set("settings", { ...(await getSettings()), labels: [] });
    box.replaceChildren();
  });
  box.append(small, copy, clear);
}

async function test() {
  const out = $("testOut");
  out.textContent = "Scoring…";
  if (!(await save())) {
    out.textContent = "";
    return;
  }
  const res: TestResponse = await chrome.runtime.sendMessage({ type: "testLast10" });
  if (!res.ok) {
    out.className = "err";
    out.textContent = res.error;
    return;
  }
  out.className = "";
  const eff = effective();
  const names = splitNames(input("watchNames").value).length;
  $("testLine").textContent = eff.source === "stock" ? `Scored with the stock list, your sentence and ${names} name${names === 1 ? "" : "s"}.` : "Scored with your own VIP List.";
  const vips: QueueItem[] = [];
  const table = document.createElement("table");
  table.innerHTML = "<tr><th>Post</th><th>Verdict</th><th>Why</th><th>Disagree?</th></tr>";
  for (const row of res.rows) {
    const tr = document.createElement("tr");
    const post = document.createElement("td");
    post.textContent = `@${row.bookmark.authorHandle}: ${row.bookmark.text.slice(0, 140)}`;
    const verdict = document.createElement("td");
    const why = document.createElement("td");
    if ("error" in row) {
      verdict.textContent = "error";
      why.textContent = row.error;
    } else {
      verdict.textContent = `${row.verdict.verdict} (${row.verdict.confidence.toFixed(2)})`;
      if (row.verdict.verdict === "vip")
        vips.push({ id: row.bookmark.id, url: row.bookmark.url, route: row.verdict.route!, theme: row.verdict.themeName!, action: row.verdict.action!, confidence: row.verdict.confidence, queuedAt: Date.now() });
      const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
      const t = top(row.verdict.probs.theme), s = top(row.verdict.probs.skip);
      why.style.whiteSpace = "pre-line";
      why.textContent = [
        row.verdict.themeName ?? row.verdict.reason ?? "",
        t ? `best theme: ${t[0]} ${t[1].toFixed(2)}` : "",
        s ? `best skip: ${s[0]} ${s[1].toFixed(2)}` : "",
      ].filter(Boolean).join("\n");
    }
    tr.append(post, verdict, why, "error" in row ? document.createElement("td") : markCell(row.bookmark, verdict.textContent ?? "", row.verdict.themeId));
    table.append(tr);
  }
  out.replaceChildren(table);
  const sendBox = $("sendTest");
  sendBox.replaceChildren();
  if (vips.length) {
    const btn = document.createElement("button");
    btn.textContent = `Send these ${vips.length} VIP${vips.length === 1 ? "" : "s"} to the webhook now`;
    const note = document.createElement("span");
    btn.addEventListener("click", async () => {
      note.textContent = " Sending…";
      const msg = await sendItems(vips, collectRoutes());
      note.className = msg.startsWith("Sent") ? "ok" : "err";
      note.textContent = " " + msg;
    });
    sendBox.append(btn, note);
  }
  await renderLabelsFooter();
}

for (const id of ["vipListJson", "ownerSummary", "watchNames"]) $(id).addEventListener("input", renderStatus);
$("save").addEventListener("click", () => void save());
$("test").addEventListener("click", test);
$("addRoute").addEventListener("click", addRoute);
$("ping").addEventListener("click", ping);
$("copyPrompt").addEventListener("click", async () => {
  await navigator.clipboard.writeText(VIP_LIST_PROMPT);
  $("copyPrompt").textContent = "Copied";
});
void load();
