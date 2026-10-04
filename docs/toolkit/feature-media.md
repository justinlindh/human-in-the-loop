---
tool: `npm run feature-media -- [--only id,id] [--out <dir>] [--compare <dir>]`
section: run
who: video, integrator, ui
covers: scripts/feature-media/render.mjs scripts/feature-media/manifest.js scripts/feature-media/yak.js scripts/feature-media/yak-check.mjs
---
Media from `scripts/feature-media/manifest.js` (rendered by `scripts/feature-media/render.mjs`): capture.js items recorded through the real game loop at 1920x1080, each with the files to make from it (`out`: a path, a size, an optional crop, a start and length for clips). Stills become WebP; clips become MP4 (plus WebM and a WebP poster), cut to length and blended end into start so they loop without a jump. Paths mirror the landing page's `img/` and `media/`, so `--out` can be a checkout of the site repo; `--compare` prints each file's size next to the same path in another folder.

The seed-2 `site-yak-backfire` setup stops expanding after eight staff on the Office Floor and waits for a real outage. Daily standups are disabled for the live shot so the team can react when the meme lands. Both trailer Yak beats use this item.

`site-loop-automation` uses seed 5 and rejects a search that cannot reach `agent_runaway_spend` in a live game. Its recording checks the active event, staged hot rack and visible bill card.

`site-loop-meeting` places a meeting table itself: bots never buy one (it is not in their decor list, `src/sim/bots.js`), so a real seed grown to the Office Floor gets one placed the way a player would (`suggestPlacement` then the normal `placeItem` action) before daily standups are forced on. `site-still-squads` plays a real game with the `squads` bot (`src/sim/bots.js`), which forms and posts squads on its own, so cohesion has time to build before the Squads tab is opened. The `moment-*` items (table `MOMENTS` in the manifest) are the feature inventory's staged moments: each loads an indexed snapshot from the week before the decision, follows the staged prop at a per-moment zoom (none: the wide view), holds the card about 5 s, then answers it by key. They write `moments/<name>.mp4`; publish them with `scripts/feature-media/publish.sh`. `site-loop-rotate` clicks the on-screen `.camrot-b` buttons (the same control a player uses) for a there-and-back turn, so the loop's two ends frame the same.

The Yak card clicks Share a meme during the outage, tracks the new chat ID and waits for its real replies. The displayed image must decode at its expected size and remain fully inside the delivery frame and scroll area. `timeout 360 nice -n 10 node scripts/feature-media/yak-check.mjs` exercises the real capture and rejects missing, undecoded, incorrect, hidden, clipped, undersized and text-only images, missing replies and a wrong post identity. A matching decoy cannot replace the clicked post.
