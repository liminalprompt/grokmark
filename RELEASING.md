# Releasing Grokmark

1. On a clean, up-to-date `main`, run `npm run release:check`. It must pass, and `git status` must show no changes under `dist/`.
2. Bump the version in `manifest.json`, `package.json` and `package-lock.json` (top-level and `packages[""]`), add a CHANGELOG entry, rebuild, commit, push `main` and wait for CI.
3. Tag `vX.Y.Z` and push the tag. The Release workflow re-runs `release:check`, checks the tag matches the version and publishes the zip.

Never push a tag before `release:check` passes. If a release fails, fix forward with a new patch version instead of moving the tag.
