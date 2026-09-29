---
tool: `node scripts/studio/parity.mjs --preset clip`; `node scripts/studio/parity.mjs --old '<command>' --new '<command>' [--grep '^CLIP'] [--tolerance 0.005] [--new-covers-only]`
section: render
who: tools, art, reviewer
covers: scripts/studio/parity.mjs tests/tools/parity.test.js
---
Does a studio tool give the answers of the tool it replaces? Runs the old command and the new one, one after the other, on the checkout it is run from; keeps the output lines matching `--grep`; and compares them by name. A line is `<prefix> <name> {json}`: the text before the first `{` (without the ok or FAIL word) is the name, the word is part of the comparison, and the JSON's numbers match within `--tolerance` (default 0.005; 0 is exact). It prints `DIFF <name>` with the paths that differ, `ONLY NEW` for a row the old tool lacks, and `ONLY OLD` (or `NOT COVERED` with `--new-covers-only`, for a new tool that runs a subset and says so) for a row the new one lacks, then a count line. Exit 0 when every shared row matches and nothing is only in the new tool, 1 on any difference, 2 when a command prints no matching lines or an option is wrong. SIGINT and SIGTERM stop both commands.

`--preset clip` is the clip migration: `blender/checks/clip.mjs` (check cache off) against `scripts/studio/clip.mjs --jobs 4`, about six minutes. To compare against an older checkout, run the old command from there: `--old 'cd ../other-checkout && node blender/checks/clip.mjs'`. The sweep's rows are compared by `scripts/studio/sweep-parity.mjs`, which reads two `report.json` files. A migration is retired only once its parity run is clean, and a PR that migrates a tool pastes the run.
