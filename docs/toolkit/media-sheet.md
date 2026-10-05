---
tool: `node scripts/tools/media-sheet.mjs <out.png> <file|dir>... [--count 6] [--per-row 6] [--crop x,y,w,h] [--base <dir>]`
section: pr
who: video, reviewer, art
covers: scripts/tools/media-sheet.mjs tests/tools/media-sheet.test.js
---
One labelled contact sheet for a batch of renders, to vet it before `--publish` or to put beside a PR: all the stills (`.webp`, `.png`, `.jpg`) in one grid titled with their count and file names, then one row per clip (`.mp4`, `.webm`, `.mov`) of `--count` evenly spaced frames labelled by time, titled with the clip's path from `--base` (default the first input's folder). A folder is searched (hidden folders such as `.publish` are skipped). The cells come from `scripts/sheet.sh`; rows are padded with white, so a clip row and a short row of stills stack at any widths (a vstack of two sheets that differ by a pixel fails). `--crop` crops every cell, as in `sheet.sh`. `npm run feature-media -- --sheet` runs it on its own output. Prints the PNG's path; exit 0, 2 on bad input, 1 when a row cannot be made.
