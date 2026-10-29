import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    "options/options": "options/options.ts",
    "popup/popup": "popup/popup.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
});

cpSync("manifest.json", "dist/manifest.json");
cpSync("options/options.html", "dist/options/options.html");
cpSync("popup/popup.html", "dist/popup/popup.html");
cpSync("public", "dist", { recursive: true });
