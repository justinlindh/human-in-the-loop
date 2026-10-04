---
tool: `node scripts/reels/era-snaps.mjs <startEra> <seed> '<name>=<js over s>' ...`, then `node scripts/capture.js --manifest scripts/reels/era-manifest.js`
section: run
who: video
covers: scripts/reels/era-snaps.mjs scripts/reels/era-manifest.js
---
The early-era clips and the all-era still sheet. `era-snaps.mjs` plays a founded company (`preinternet`, `dotcom` or `web2`) in the pure sim with the balanced bot and writes the gzipped state into `shots/era-snaps/` at the first week each named condition holds (saved after the bot's turn, before the tick). It exits 1 when a condition never holds. `era-manifest.js` loads those states into the page through the game's own save, with `?eras`, and plays them live with the side panels hidden; decision cards and the moment caption stay, and each card is answered after 3 s. Its items are `era-preinternet` (saved with `node scripts/reels/era-snaps.mjs preinternet 7 "pre=s.week===30"`), `era-dotcom-boom`, `era-y2k`, `era-dotcom-bust`, `era-web2` (camera eases from the billboard onto the people) and nine `era-still-<era>` stills of the same garage for a side-by-side sheet.

```
node scripts/reels/era-snaps.mjs dotcom 7 "boom=s.week===45" "y2k=s.week===103" "bust=s.flags.dotcom?.phase==='bust'" "w2=s.era.id==='web2'&&s.week>=s.eraSchedule.web2+20"
scripts/with-render-lock.sh --gpu node scripts/capture.js --manifest scripts/reels/era-manifest.js --out shots/era-final --audio --no-webm
scripts/sheet.sh grid sheet.png --cols 3 shots/era-final/era-still-*-2.0s.png
```

The Y2K item runs 30 s; cut the spotlight (about 7.5 s to 22.5 s) with ffmpeg. The stills use `mock=garage&eraArt=<era>`, which the fixed preview still needs. A sim change can move the states, so regenerate them first.
