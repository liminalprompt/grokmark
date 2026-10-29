# Contributing

Thanks for looking. Grokmark is small on purpose, and the easiest contributions are the ones that keep it that way.

## Reporting a problem

Open an issue with the message Grokmark showed, what you clicked before it, and your Chrome and Grok Bot versions. Never paste your Cloudflare token, account ID or webhook key. If the problem is a wrong verdict, include the post link and what you expected; that is useful tuning data.

## Before you add a feature

Grokmark has one rule about its interface: **basic setup is three fields and stays that way.** New settings, switches and knobs go under Advanced or do not go in. If a default can be tuned instead of exposed, tune it. Open an issue to talk through a feature before writing it; the answer to many good ideas is a better default.

## Working on the code

```bash
npm install
npm test          # unit tests, no network
npm run typecheck
npm run build     # writes dist/, load that folder unpacked in Chrome
```

The code is TypeScript with no framework. A map:

- `src/fetchBookmarks.ts` is everything that touches X. It learns X's own bookmarks request and reuses it.
- `src/clef.ts` builds the Cloudflare request and is the only file that knows the response shape.
- `src/decide.ts` turns scores into verdicts. Pure, tested.
- `src/stockRubric.ts` is the stock VIP List. `src/effectiveList.ts` decides which list runs.
- `src/prompt.ts` holds the prompts users copy into their own AI.
- `src/webhook.ts` batches and sends. `src/background.ts` runs the show.
- `options/` is the setup page, `popup/` the popup, `site/` the landing page.

Every change needs `npm test` and `npm run typecheck` green. Bump the version in `manifest.json` and `package.json` when you change anything a user can see; the setup page shows it so people can tell a reload took.

## Changing the stock VIP List

The questions are written for a small model and tested on real bookmarks. Keep to the rules at the end of [Tuning](docs/tuning.md). If you change a question, say in the pull request which posts it fixed and which it did not break.

## Pull requests

One change per pull request, with a sentence on why. Keep the voice of the docs: plain, specific, no hype. Before sending prose, read it against the patterns at tropes.fyi; if a sentence matches one, rewrite it.
