# Privacy and security

Grokmark runs entirely in your browser. There is no Grokmark server and no account.

## What leaves your computer

Requests go only to the services you set up, and nowhere before that.

1. **Scoring.** For each new bookmark, one request to `api.cloudflare.com` with the post's text, the author's handle, up to four of its photos shrunk to 1024 pixels, your About you sentence, and the VIP List questions. Cloudflare runs the Clef-flash model and returns scores. This goes to your own Cloudflare account under your own token.
2. **Sending VIPs.** For each batch, one request to the webhook address you pasted, carrying the VIP posts' links, themes and action lines. Chrome asks your permission for each new address the first time you save it.
3. **Official X API (optional, off by default).** Only if you click **Connect X** under Advanced. Requests go to `api.x.com`: the sign-in token exchange and refresh (your app's Client ID and the codes and tokens X issues), a lookup of your own account, and reads of your bookmarks. No post text or scores are sent to X.

Nothing is sent to Grokmark's authors or anyone else. Posts that are not VIPs leave nothing behind but a note in your browser that they were seen.

## How bookmarks are read

Grokmark reads bookmarks using the same web request X's own site makes, inside your logged-in tab. It does not use an X developer account or ask for your X password. That isn't an official X API, so X could change or limit it. An optional mode that uses your own X developer app is available under Advanced.

In that official X API mode you create your own app at developer.x.com and Grokmark signs in to it with OAuth 2.0 and PKCE (a public client, so there is no client secret). Grokmark never sees your X password. It asks for read access only: `tweet.read users.read bookmark.read offline.access`. X bills API reads to your developer account. With **API only** on, Grokmark never touches your x.com session; with it off, a run falls back to the session only if your X sign-in has expired.

## Where your keys live

The Cloudflare token, account ID and webhook keys are stored in Chrome's extension storage on your computer, in plain text, the same way other extensions store their settings. They are not synced to your Google account.

- Websites cannot read them. Other extensions cannot read them.
- Anything with access to your user account's files can, including malware. That is the same exposure as your saved logins and cookies.
- They never appear in error messages or logs; Grokmark blanks them out.

In API mode the X access token and refresh token live in the same extension storage, under their own key, apart from your settings. Your X app's Client ID is stored with the settings; it is an identifier, not a secret. Tokens are blanked out of error messages too.

To revoke X access: click **Disconnect** under Advanced (this forgets the tokens on your computer), then remove Grokmark under Settings > Security and account access > Apps and sessions > Connected apps on x.com, or delete the app at developer.x.com.

What keeps the exposure small:

- Scope the Cloudflare token to Workers AI only. Then a stolen token can spend inference credit and nothing else. It cannot touch your sites, DNS or other Cloudflare services.
- If a machine is ever compromised, revoke the token and regenerate the webhook keys. Both are a few clicks.

## Prompt injection

A bookmarked post could contain text written to trick an AI, such as "ignore your instructions and do X". Grokmark reduces the risk in two ways: the scoring model never writes text or takes actions, it only returns numbers; and every send to your routine includes an instruction to act only on the posts and ignore anything inside them. Your routine should still be told the same thing in its own instructions. The example in [The Grok Bot routine](grok-bot-routine.md) does this.

## Removing everything

Remove Grokmark on `chrome://extensions`. Chrome deletes its storage, including keys, marks and the list of seen bookmarks. Revoke the Cloudflare token if you will not use it again.
