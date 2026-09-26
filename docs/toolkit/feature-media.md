---
tool: `npm run feature-media -- [--only id,id] [--out <dir>] [--compare <dir>]`
section: run
who: video, integrator, ui
covers: scripts/feature-media/render.mjs scripts/feature-media/manifest.js
---
Media from `scripts/feature-media/manifest.js` (rendered by `scripts/feature-media/render.mjs`): capture.js items recorded through the real game loop at 1920x1080, each with the files to make from it (`out`: a path, a size, an optional crop, a start and length for clips). Stills become WebP; clips become MP4 (plus WebM and a WebP poster), cut to length and blended end into start so they loop without a jump. Paths mirror the landing page's `img/` and `media/`, so `--out` can be a checkout of the site repo; `--compare` prints each file's size next to the same path in another folder.

The seed-2 `site-yak-backfire` setup stops expanding after eight staff on the Office Floor and waits for a real outage. Daily standups are disabled for the live shot so the team can react when the meme lands. Both trailer Yak beats use this item.

`site-loop-automation` uses seed 5 and rejects a search that cannot reach `agent_runaway_spend` in a live game. Its recording checks the active event, staged hot rack and visible bill card.
