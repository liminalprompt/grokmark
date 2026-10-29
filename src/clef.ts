import type { Probs } from "./decide";
import type { Bookmark, VipList } from "./schema";

export const MODEL = "clef-flash";
const MODEL_PATH = "@cf/cloudflare/clef-flash";

type Question = { type: "noul" | "score"; instructions: string; criteria?: string[] };

export type ClefRequest = {
  model: string;
  state: unknown;
  questions: Record<string, Question>;
  images?: string[];
};

export function buildRequest(list: VipList, b: Bookmark, images: string[] = []): ClefRequest {
  const questions: Record<string, Question> = {};
  for (const s of list.skip_rules)
    questions[`skip.${s.id}`] = { type: "noul", instructions: `${s.question} ${s.instructions}` };
  for (const t of list.themes)
    questions[`theme.${t.id}`] = { type: "noul", instructions: `${t.question} ${t.instructions}` };
  questions.value = {
    type: "score",
    instructions: `${list.value.question} ${list.value.instructions}`,
    criteria: list.value.levels.map((l) => l.name),
  };
  const req: ClefRequest = {
    model: MODEL,
    state: {
      owner: list.owner_summary,
      post: { author: `@${b.authorHandle}`, text: b.text, quoted: b.quotedText ?? null },
    },
    questions,
  };
  if (images.length) req.images = images.slice(0, 4);
  return req;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/**
 * Cloudflare's output schema: noul answer = {type:"noul", noul}, score answer =
 * {type:"score", score, legend, probabilities, confidence}. Stay lenient about extra shapes.
 */
function num(answer: unknown, keys: string[], id: string): number {
  if (typeof answer === "number") return answer;
  if (isObj(answer)) {
    for (const k of keys) if (typeof answer[k] === "number") return answer[k] as number;
  }
  throw new Error(`Clef answer for "${id}" had no number: ${JSON.stringify(answer)}`);
}

/** The only place that knows the response shape. */
export function parseResponse(raw: unknown, list: VipList): Probs {
  let body: unknown = raw;
  if (isObj(body) && isObj(body.result)) body = body.result; // Cloudflare envelope
  if (!isObj(body) || !isObj(body.answers)) throw new Error("Clef response had no answers");
  const answers = body.answers as Record<string, unknown>;

  const probs: Probs = { skip: {}, theme: {}, value: 0 };
  for (const s of list.skip_rules) probs.skip[s.id] = num(answers[`skip.${s.id}`], ["noul", "yes", "probability"], `skip.${s.id}`);
  for (const t of list.themes) probs.theme[t.id] = num(answers[`theme.${t.id}`], ["noul", "yes", "probability"], `theme.${t.id}`);
  probs.value = num(answers.value, ["score", "value", "level"], "value");
  return probs;
}

export type ClefAuth = { accountId: string; token: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Keep credentials out of error text, which ends up on screen and in logs. */
export function redact(text: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((t, s) => t.split(s).join("<hidden>"), text);
}

export async function callClef(auth: ClefAuth, req: ClefRequest, tries = 3): Promise<unknown> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/ai/run/${MODEL_PATH}`;
  let lastErr: Error | undefined;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`Clef HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(redact(`Clef HTTP ${res.status}: ${await res.text()}`, [auth.accountId, auth.token])), { fatal: true });
      return await res.json();
    } catch (e) {
      lastErr = e as Error;
      if ((e as { fatal?: boolean }).fatal) break;
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr ?? new Error("Clef call failed");
}

/**
 * Download an image, shrink it under Clef's limits, return a `data:image/jpeg;base64,...` URL.
 * Clef rejects bare base64 strings and remote URLs; the object form {content_type, base64} also works.
 */
export async function imageToDataUrl(url: string, maxDim = 1024): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

let loggedRaw = false;

export async function scoreBookmark(auth: ClefAuth, list: VipList, b: Bookmark): Promise<Probs> {
  const images = (await Promise.all(b.imageUrls.slice(0, 4).map((u) => imageToDataUrl(u)))).filter(
    (x): x is string => !!x,
  );
  const raw = await callClef(auth, buildRequest(list, b, images));
  if (!loggedRaw) {
    loggedRaw = true;
    console.info("[grokmark] first raw Clef response (pin field names here):", JSON.stringify(raw));
  }
  return parseResponse(raw, list);
}

/** Run fn over items with at most `limit` in flight. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await fn(items[i]!) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}
