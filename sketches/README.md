# Sketches

Draft code for discussion. Nothing here is built, shipped or imported by the extension.

## imageSuggest.ts: image suggestions with the Clef pattern

**Status: draft for discussion, not production-ready.**

The idea: reuse the way Grokmark buckets bookmarks (one yes-or-no Clef-flash question per theme, then plain-code decisions) to suggest stock images for a blog post.

1. **Clef request builder.** `buildAngleRequest()` turns a list of visual angles ("would a dashboard screenshot illustrate this?", "would an abstract illustration fit?", "is a photo of someone working the right vibe?") into one Clef request, the same shape as `buildRequest()` in `src/clef.ts`.
2. **Scoring.** `parseAngles()` reads P(yes) per angle and `pickTopAngles()` keeps the top three above `ANGLE_MIN`, falling back to the top three overall.
3. **Image search.** `searchPexels()` searches Pexels with each winning angle's phrase and returns one landscape photo per angle with its page link and photographer.

Open questions (TODOs in the file): tune the angles and the cutoff on real posts, mix the post's own nouns into the search phrase, add Unsplash, dedupe results, and expose it as an MCP tool on a Worker with caching and rate limits.

Typecheck it on its own with `npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --skipLibCheck sketches/imageSuggest.ts`.
