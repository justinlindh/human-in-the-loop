---
tool: `scripts/feature-media/publish.sh <file>...`
section: run
who: video
covers: scripts/feature-media/publish.sh
---
Publishes feature-inventory media under stable names on the orphan `feature-media` branch (never merged), so `docs/features/` entries link `https://github.com/justinlindh/human-in-the-loop/blob/feature-media/<name>.webp?raw=true` without binaries entering `main`. A `.png` becomes `<name>.webp` (at most 1280 px wide), an `.mp4` is copied with an 8 s `.gif` preview beside it, and `.webp` and `.gif` are copied as they are. The file's basename is the stable name, so re-publishing replaces it. It prints each file's URL. Era media: `node scripts/reels/era-snaps.mjs`, then `scripts/with-render-lock.sh --gpu node scripts/capture.js --manifest scripts/reels/era-manifest.js` (see `era-clips.md`); the era stills are `era-still-<era>`, the clips `era-preinternet`, `era-dotcom-boom`, `era-dotcom-bust` and `era-web2`.
