# FAQ

Short answers about how the two ways of reading bookmarks, your x.com session and the official X API, work together.

## Does connecting the X API stop Grokmark from reading my browser?

It replaces the browser as the place bookmarks are read from. Once the X API is connected, each check reads your bookmarks from `api.x.com` in the background, with no x.com tab needed.

Grokmark's small x.com page script still loads in both modes. It watches for the request X's own app makes for bookmarks, so the session method keeps working if you need it, and it tells Grokmark you are on x.com so it can decide whether a check is due. In X API mode, nothing reads your bookmarks through the page.

## What happens if my X sign-in expires?

If X stops accepting the sign-in (it expired, you revoked the app, or you changed your password), that check falls back to reading through your x.com session, as long as you are logged in to x.com in that browser. Turn on **API only** under Advanced to block the fallback completely: the check stops and tells you to click **Connect X** again. See [Troubleshooting](troubleshooting.md#x-api-sign-in-expired--click-connect-x-again).

## I set up the X API on my computer but mostly use X on my phone. Does that work?

Yes. The X API does all the reading, so you don't need to visit x.com on that computer. Grokmark still runs inside Chrome, so Chrome has to be open on that computer for checks to happen (every half hour while it is open).

Turn on **API only** in this setup. With no x.com session in that browser there is nothing to fall back to, so without API only a lost sign-in would just fail quietly. With it on, Grokmark tells you plainly that X needs reconnecting.

## Is X API mode ready?

It is in beta, and **Connect X** is marked "(beta)". The sign-in, token refresh and bookmark reading are covered by automated tests against a simulated X, but they haven't been fully tested against the live X API yet. The x.com session method is unchanged and stays the default. If something goes wrong, click **Disconnect** to go back to it, and please [open an issue](https://github.com/liminalprompt/grokmark/issues).

## Want to help test it with a real X developer app?

Please do. If you have an X developer app and can try **Connect X (beta)** against the live API, [open an issue](https://github.com/liminalprompt/grokmark/issues) or message [@liminalprompt](https://x.com/liminalprompt) on X with what worked and what didn't.
