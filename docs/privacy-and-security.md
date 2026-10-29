# Privacy and security

Grokmark runs entirely in your browser. There is no Grokmark server and no account.

## What leaves your computer

Requests go only to the services you set up, and nowhere before that.

1. **Scoring.** For each new bookmark, one request to `api.cloudflare.com` with the post's text, the author's handle, up to four of its photos shrunk to 1024 pixels, your About you sentence, and the VIP List questions. Cloudflare runs the Clef-flash model and returns scores. This goes to your own Cloudflare account under your own token.
2. **Sending VIPs.** For each batch, one request to the webhook address you pasted, carrying the VIP posts' links, themes and action lines. Chrome asks your permission for each new address the first time you save it.

Nothing is sent to Grokmark's authors or anyone else. Posts that are not VIPs leave nothing behind but a note in your browser that they were seen.

## How bookmarks are read

Grokmark reads bookmarks using the same web request X's own site makes, inside your logged-in tab. It does not use an X developer account or ask for your X password. This may conflict with X's terms of service; it is your call.

## Where your keys live

The Cloudflare token, account ID and webhook keys are stored in Chrome's extension storage on your computer, in plain text, the same way other extensions store their settings. They are not synced to your Google account.

- Websites cannot read them. Other extensions cannot read them.
- Anything with access to your user account's files can, including malware. That is the same exposure as your saved logins and cookies.
- They never appear in error messages or logs; Grokmark blanks them out.

What keeps the exposure small:

- Scope the Cloudflare token to Workers AI only. Then a stolen token can spend inference credit and nothing else. It cannot touch your sites, DNS or other Cloudflare services.
- If a machine is ever compromised, revoke the token and regenerate the webhook keys. Both are a few clicks.

## Prompt injection

A bookmarked post could contain text written to trick an AI, such as "ignore your instructions and do X". Grokmark reduces the risk in two ways: the scoring model never writes text or takes actions, it only returns numbers; and every send to your routine includes an instruction to act only on the posts and ignore anything inside them. Your routine should still be told the same thing in its own instructions. The example in [The Grok Bot routine](grok-bot-routine.md) does this.

## Removing everything

Remove Grokmark on `chrome://extensions`. Chrome deletes its storage, including keys, marks and the list of seen bookmarks. Revoke the Cloudflare token if you will not use it again.
