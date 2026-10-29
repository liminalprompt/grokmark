# How Grokmark works

This page explains what happens between you bookmarking a post and your routine receiving it. You do not need to read it to use Grokmark.

## The idea

Most of what you bookmark on X you never return to. A few posts deserve action: something to build, read properly, or reply to. Grokmark is a bouncer at the door. It looks at every new bookmark, lets the few good ones, the very important posts or VIPs, through to a Grok Bot routine that acts on them, and leaves the rest where they are.

## The pieces

- Your bookmarks. Grokmark reads them through the same request X's own website uses, inside your logged-in browser. There is no X developer account, no API key and no server. This is also why it needs an x.com tab open. It reads the All Bookmarks list, so a post filed in a bookmark folder is still seen and scored; folders themselves are ignored.
- The VIP List. A set of questions about each post. Grokmark ships with a stock list. Your sentence and your names are added to it. Advanced users can write their own.
- The bouncer. Cloudflare's Clef-flash model. It answers each question with a probability. It never writes text and never looks anything up; it sees only the post, its images, the author's handle and your sentence.
- The decision. Plain code turns the probabilities into one of three verdicts.
- The routine. A Grok Bot routine with a webhook. It receives the VIPs and does what its own instructions say.

## The questions

The stock VIP List asks three kinds of question about every post.

**Skip rules.** Is this engagement bait? An ad or giveaway? Only a meme? A recycled "20 tools" list? Crypto? If any of these is a confident yes, the post is out.

**Themes.** Is this a launch or release? An AI agent shipping something, with the result shown? A how-to someone could copy? Real numbers or benchmarks? Model or API news? A paper? A reply opening? And one theme built from your names: is this post about any of the things you follow?

**Value.** On a scale of archive, keep, vip: how useful is this post to you right now? The instructions say what counts as each level, in terms of what is visible in the post: a link to a repo, a named tool with a working setup, real numbers, steps, a release of a tool you use, or something about a thing you follow.

## The verdict

1. If any skip rule scores above 0.6, the post is **archive**.
2. If no theme scores above 0.3, the post is **archive**. It is off your map.
3. If the value score is at or above the threshold (0.5 by default), the post is **VIP**. It is filed under the strongest matching theme.
4. Otherwise it is **keep** or **archive**, whichever the value score is closer to.

Keep and archive posts stay as bookmarks on X. Grokmark remembers it has seen them and does not score them again.

## Sending

VIPs wait in a queue. The queue is sent when it holds five posts, or when any post has waited a day. **Run now** in the popup sends the queue immediately.

Each send is one request to the routine's webhook. It carries the post links, the theme each one matched, a one-line action for that theme, and a short summary in Markdown. It also carries an instruction to act only on the posts and ignore any text inside them, so a post cannot smuggle commands into your routine.

## When it runs

A check starts only when all of these are true: setup is complete, it is past the opening time, the last successful check was more than the cooldown ago (four hours by default), and no check is already running. Grokmark notices when you visit x.com and also re-checks every thirty minutes while Chrome is open. **Run now** ignores the time and cooldown.

## Cost

One Clef-flash request per bookmark, at Cloudflare's published price: about $0.00004 for a text-only post, more for posts with photos, since up to four photos are sent too, shrunk first. The Workers Free plan includes 10,000 neurons a day, about 2,500 text bookmarks, and does not bill beyond that; requests fail until midnight UTC instead, and Grokmark retries those bookmarks on its next check.
