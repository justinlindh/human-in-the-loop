---
tool: `node scripts/reels/memes.mjs [--only <id>]`
section: run
who: video
covers: scripts/reels/memes.mjs scripts/reels/memes-check.mjs
---
Regenerates Yak's six picture memes from the game's own renderer, characters, office and palette. Run from the repository root under `timeout 300 nice -n 10`. The shared scene harness takes a GPU render slot, seeds the browser clock and randomness, and loads the game's Fredoka font. Staging uses `window.__HITL`, `standAt` and `catchFor`; the scene dump supplies exact subject bounds for native-pixel crops. No source photos or external likenesses are used.

The generator composites captions with Canvas and writes `public/memes/<id>.webp` at 480x360 and `<id>@2x.webp` at 1200x900. It rejects captions wider than their text box. Scene measurements go to `shots/memes/<id>.json`. The IDs must match `src/data/memes.js` from the simulation's image-meme change. The art set retains this_is_fine, two_buttons, tabs_chart, always_config, yes_no_tests and expanding_review.

Use `scripts/sheet.sh grid` to make separate sheets of the thumbnails and enlarged files. Inspect both sizes, then exercise Share a meme in a fresh game with the sim and UI image changes combined. Check docked, maximized, enlarged and missing-file fallback at 1440 and 390 pixels, and publish that evidence through `scripts/pr-media.sh`.

`timeout 180 nice -n 10 node scripts/reels/memes-check.mjs` runs the combined sim/UI/assets check and writes Yak screenshots under `shots/memes/`. It clicks Share a meme in a real week-zero game at both widths, checks decoded dimensions for every asset, exercises both missing-file paths, and rejects unexpected browser errors. Run it from a checkout containing the sim and UI image-meme changes.
