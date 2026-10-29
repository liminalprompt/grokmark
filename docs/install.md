# Install Grokmark in Chrome

Grokmark is not on the Chrome Web Store. You install it from a folder on your computer. This takes about three minutes and you only do it once.

## What you need

- Google Chrome, or another browser built on Chrome (Brave, Edge, Arc).
- A Cloudflare account. The free plan is enough.
- The Grok Bot desktop app, version 0.53.0 or later, with at least one routine.

## 1. Download the build

1. Open the [latest release](https://github.com/liminalprompt/grokmark/releases/latest).
2. Under **Assets**, download the file named `grokmark-x.y.z.zip`.
3. Unzip it. You get a folder with a file called `manifest.json` inside. Put the folder somewhere it can stay, such as your Documents folder. Chrome reads it from there every time it starts, so do not delete or move it later.

## 2. Load it in Chrome

1. In the address bar, type `chrome://extensions` and press Enter.
2. In the top right, turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose the folder you unzipped. Pick the folder itself, not a file inside it.

Grokmark now appears in your list of extensions. Click the puzzle-piece icon in the toolbar and pin Grokmark so its icon stays visible.

## 3. Open setup

Click the Grokmark icon, then **Open setup**. The setup page has three sections to fill. [Setup](setup.md) walks through each one.

## Updating

When a new release comes out, download the new zip, unzip it over the old folder (or replace the folder), then go to `chrome://extensions` and click the reload arrow on Grokmark's card. Your settings are kept. The version number shows at the top of the setup page, so you can check the reload took.

## Removing

On `chrome://extensions`, click **Remove** on Grokmark's card. This deletes its stored settings, including your keys. Then delete the folder.
