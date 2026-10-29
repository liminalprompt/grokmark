# Changelog

## 0.3.0 · 2026-10-29

- Optional official X API mode under Setup > Advanced: bring your own X developer app (OAuth 2.0 with PKCE), connect once, and Grokmark reads bookmarks through the API with no x.com tab open. The x.com session path is still the default and is unchanged.
- "API only" switch: never fall back to the x.com session. Without it, a lost X sign-in falls back to the session for that run.
- Connect X is marked beta: the button reads "Connect X (beta)". X API mode has only been tested against a simulated X so far.
- **New permissions:** `identity` (for the X sign-in window) and the host `https://api.x.com/*`. Chrome may ask you to accept them when the extension updates.
- The network test pins both additions.
- New `docs/faq.md`: how the x.com session and the X API work together (fallback, API only, phone-only use, beta status).
- Release gate: releases publish only from `v*` tags, only after typecheck, tests and build pass, and only when the tag matches the version in `package.json` and `manifest.json`. `npm run release:check` runs the same checks locally; `RELEASING.md` has the steps.

## 0.2.9 · 2026-10-29

- The stock theme built from your names is called "Names I follow" (was "Things I follow").

## 0.2.7 · 2026-10-29

- The webhook payload carries a `text` field, so a Slack incoming webhook accepts it unchanged. Grok Bot routines keep reading `items`.

## 0.2.6 · 2026-10-28

- First release built by GitHub Actions. Build tools updated (esbuild 0.28, vitest 5) so the dependency audit is clean. No extension changes beyond 0.2.3. Attestations switch on when the repository is public.

## 0.2.3 · 2026-10-28

- Dropped the `scripting` permission. Tabs open before install need one reload instead.
- Test that pins every host the code can reach and the two permissions in the manifest.
- Built `dist/` is committed; CI checks it matches the source. Releases are built by GitHub Actions with a SHA-256 and a build attestation.
- Setup page is basic (sentence, names, one webhook) with an advanced fold; tagline is "Only your best bookmarks get seen".

## 0.2.1 · 2026-10-28

First release.

- Basic setup: one sentence about you, names to watch, one Grok Bot webhook. A stock VIP List scores everything.
- Advanced: more routes with themes assigned under each, your own VIP List, a tuning prompt built from verdicts you mark, Door Policy.
- Setup page shows which list scored the test, with Send a test ping and Send these VIPs now.
- Run now sends the queue at once.
- Scoring by Cloudflare Clef-flash. Verdict cutoffs tuned on real bookmarks: theme above 0.3, skip above 0.6, VIP at value 0.5.
- Reads bookmarks by learning X's own request; opens the bookmarks page in a background tab once if needed.
- Keys are blanked out of error messages.
