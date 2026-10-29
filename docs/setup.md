# Set up Grokmark

The setup page has three sections. Fill them in order, click **Save**, and you are done. Everything else on the page is optional.

## 1. Cloudflare

Grokmark uses a small Cloudflare model called Clef-flash to judge each bookmark, on your own Cloudflare account. The free plan includes enough for about 2,500 text bookmarks a day and cannot bill you: past that, scoring pauses until midnight UTC and Grokmark picks those bookmarks up on its next check. If you ever want more, the paid plan is $5 a month and charges about four thousandths of a cent per text bookmark beyond the free amount.

**Account ID.** In the Cloudflare dashboard, open **Workers & Pages**. Your account ID is on the right side of that page. It is 32 letters and digits.

**Workers AI token.** In the dashboard, go to **My Profile**, then **API Tokens**, then **Create Token**. Use the **Workers AI** template, which limits the token to running models and nothing else. Copy the token and paste it into Grokmark. Cloudflare shows it only once; if you lose it, make a new one.

Grokmark sends the token only to `api.cloudflare.com`. If a message under the field says the value looks wrong, read it: it tells you whether you pasted the token where the account ID goes, or the other way round.

On the paid plan, set a usage alert in Cloudflare so you hear about it if anything unexpected happens. On the free plan there is nothing to be billed for.

## 2. About you

The model reads this before judging every bookmark. Two fields.

**One sentence about you.** What you build, the tools you use every day, and what you want to learn. Be specific and name things. A good sentence:

> I run a small web agency, build on Cloudflare Workers, use Grok Bot every day, and want to get better at short-form writing.

A weak sentence names nothing: "I'm interested in AI and technology."

**Names to watch.** The products, tools, companies and people you follow, separated by commas. Posts about these count as VIPs, very important posts, the ones that get sent, even when they would not otherwise. If a name is one the model might not know, add a few words in brackets saying what it is:

> Grok Bot, Cloudflare Workers, Jev (TypeSafe's small decision model), Pieter Levels

Well-known names do not need the brackets. Obscure ones do; without them the model cannot tell what the name refers to.

## 3. Grok Bot webhook

Every VIP goes to one Grok Bot routine. In the Grok Bot desktop app, open the routine you want to receive them, find its **Webhook** section, and copy the URL and the key.

Paste both into Grokmark. Then click **Send a test ping**. Grokmark sends one sample item to the routine right away. Within a few seconds the routine should show that it was triggered. If the line next to the button turns red, see [Troubleshooting](troubleshooting.md).

The routine needs instructions for what to do with what it receives. [The Grok Bot routine](grok-bot-routine.md) has a prompt you can paste in.

## Save and try it

Click **Save**. The line under the button should read "Using the stock VIP List with your sentence and names". If it is red, it tells you what is missing.

Open x.com in another tab, come back, and click **Test on last 10 bookmarks**. After a few seconds you see a table: each of your ten newest bookmarks, the verdict (vip, keep or archive), the score, and why. The line above the table says which list scored them. Nothing is sent.

If you agree with the verdicts, click **Send these VIPs to the webhook now**. The routine receives the VIP posts and does whatever you told it to.

If you disagree with a verdict, use the **Disagree?** column. [Tuning](tuning.md) explains what happens next.

## After setup

Close the page. From now on, whenever you are on x.com after the opening time (9 pm by default), Grokmark checks for new bookmarks, scores them, and queues the VIPs. They are sent when five have collected or one has waited a day. The popup, under the Grokmark icon, shows the last run and lets you click **Run now** to check and send immediately.
