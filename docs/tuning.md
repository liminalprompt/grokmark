# Tuning the verdicts

Grokmark's stock list is good on day one and gets better with your corrections. A VIP is a very important post, one that gets sent; keep and archive stay as bookmarks. This page covers the two ways to correct it, from easiest to most involved.

## Start with your names

Most wrong verdicts are a missing name. If a post about something you care about keeps landing as keep or archive, add that thing to **Names to watch** on the setup page. If it is obscure, add a few words in brackets saying what it is. Save and run the test again. This fixes more than anything else.

## Mark a verdict

Run **Test on last 10 bookmarks**. Each row has a **Disagree?** column with a theme menu and two buttons.

- Should be VIP. Pick the theme it belongs to first, then click. Use this when a good post was marked keep or archive.
- Not VIP. Click when a post got through that should not have.

Marks are stored on your computer and change nothing by themselves. A line under the table counts them. When you have a few, click **Copy tuning prompt**.

## Use the tuning prompt

The tuning prompt is text for an AI you already use, such as Claude or ChatGPT. It contains your current VIP List, the posts you marked with what you wanted, and the rules for writing questions that Clef-flash answers well. Paste it into your AI. It returns a rewritten VIP List as JSON.

Open **Advanced** on the setup page, paste the JSON into **Your own VIP List**, and save. The status line now says "Using your own VIP List". Run the test again and compare.

Do this once or twice early on, then rarely. If you find yourself doing it every day, a name is probably missing instead.

To go back to the stock list, clear the JSON box and save.

## The threshold

Under **Advanced**, Door Policy has a **VIP score threshold**, 0.5 by default. Lowering it lets more posts through; raising it lets fewer. It is a blunt tool. Fix a wrong verdict with a name or a mark before moving the threshold, because the threshold moves every post at once.

## Writing a VIP List from scratch

If you would rather describe your interests to your AI than start from the stock list, click **Copy the VIP List prompt** under Advanced, run it, and paste the result into the JSON box. The prompt asks your AI about you first, then writes the list. The rules it follows are the same ones the tuning prompt uses.

## What makes a good question

If you edit the JSON by hand, keep to these. They come from testing on real bookmarks.

- One idea per question. If it needs "and" or "or" to join two tests, split it.
- Name things. The model matches product names and concrete words far better than descriptions like "interesting".
- Say "Yes if" and "No if", with the nearest thing that does not count.
- Never ask about what the model cannot see: follower counts, dates, what is behind a link.
- Avoid "central to the post". The model reads it strictly and says no whenever the thing is a means rather than the subject.
- Do not tell it to be strict or quote a target rate. The threshold handles that.
