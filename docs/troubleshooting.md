# Troubleshooting

Messages Grokmark shows, what they mean, and what to do. Most problems are one of the first three.

## "Open x.com in a tab so Grokmark can read your bookmarks"

Grokmark reads bookmarks through your logged-in x.com tab. Open x.com in any tab, make sure you are logged in, and try again.

## "Couldn't reach your x.com tab. Reload it and try again"

The x.com tab was open before Grokmark was installed or reloaded, so Grokmark's helper is not running in it. Reload the x.com tab.

## "Grokmark hasn't seen X load your bookmarks yet. Open x.com/i/bookmarks once in this tab, then try again"

Grokmark learns how X asks for bookmarks by watching X do it once. Normally it opens the bookmarks page in a background tab by itself for a moment. If that did not work, open `x.com/i/bookmarks` yourself, let it load, then try again.

## "That looks like an API token, not the account ID"

You pasted the Cloudflare token into the account ID field. The account ID is 32 letters and digits, shown on the Workers & Pages page of the Cloudflare dashboard. The token is the long value Cloudflare showed you once when you created it.

## "Clef HTTP 401" or "Clef HTTP 403"

Cloudflare rejected the token. Check that it was created with the Workers AI template and has not expired or been deleted. Make a new one if unsure.

## "Clef HTTP 429" or "Clef HTTP 5xx"

Cloudflare is rate limiting or having trouble. Grokmark retries three times. Wait a few minutes and try again.

If the 429 mentions error 3036 or your daily allocation, you have used the free plan's 10,000 neurons for the day, which is roughly 2,500 text bookmarks. Nothing is billed. Scoring resumes after midnight UTC, and the bookmarks that failed are scored on the next check.

## "Finish setup: write one sentence about yourself"

The About you sentence is empty and there is no VIP List under Advanced. Write the sentence and save.

## "Saved, but Grokmark won't run yet"

Setup is saved but incomplete. The rest of the message says what is missing.

## "Permission to reach … was declined"

Chrome asked whether Grokmark may contact your webhook's address and you said no. Save again and allow it. Grokmark only contacts the addresses you paste.

## "No webhook configured for route"

A VIP matched a theme that points to a route with no URL. In basic setup this means the webhook URL is empty. Under Advanced, it means you added a route or pointed a theme at one without pasting its webhook. Those VIPs wait in the queue until the route has a URL.

## "Route … HTTP 401"

The webhook rejected the key. Copy the key again from the routine's Webhook section in Grok Bot.

## The test ping says sent, but the routine did nothing

It fired, but its instructions did not tell it what to do with a test item, or it decided to ignore it. That is fine. Run the real test and send the VIPs instead. [The Grok Bot routine](grok-bot-routine.md) has a prompt that handles real items.

## "Doors open at 21:00" or "Cooling down"

Not an error. Grokmark runs after the opening time and no more than once per cooldown. **Run now** in the popup ignores both.

## VIPs were sent but the routine saw only some themes

The routine's own instructions expect fixed theme names. Change them to act on whatever `theme` and `action` each item carries. See [The Grok Bot routine](grok-bot-routine.md).

## Everything is "no theme"

Your sentence and names are not reaching the model. On the setup page, check the green line under Save says "with your sentence and names". If it says "Using your own VIP List", open Advanced; a list in the JSON box overrides the sentence and names. Clear it if you did not mean to write your own.

## The version at the top of setup is not the one you installed

Chrome is still running the old files. Go to `chrome://extensions` and click the reload arrow on Grokmark, then reload the setup page.

## Looking under the hood

On `chrome://extensions`, Grokmark's card has a **service worker** link. It opens a console where Grokmark logs the first raw answer from Cloudflare on each session, which shows exactly what the model returned. Keys are never logged.
