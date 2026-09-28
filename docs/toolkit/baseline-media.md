---
tool: `scripts/baseline-media.sh <pr> [--sweep-dir shots/sweep]`, `--dry-run <dir>`, `--check [<pr>]`, `--list`
section: pr
who: art, reviewer
covers: scripts/baseline-media.sh scripts/baseline-media.test.sh
---
Before/after media for a PR that changes a render baseline, a golden image in `blender/checks/golden/` or an entry in `blender/checks/sweep-baseline.json`, so the reviewer judges the new picture instead of trusting that it was meant. Run it in the PR's checkout after committing the change. For each changed golden it puts the base image beside the new one. For the sweep baseline it attaches the crop of each entry the PR adds or makes worse (from a sweep run on this head, in `--sweep-dir`) and lists the entries it removes. Everything goes on the PR in one comment through `pr-media.sh`, with a hidden record of each changed file's blob. `--dry-run <dir>` writes the images and the comment to a folder instead of posting. Local CI's `baseline-media` step runs `--check`: it fails a PR whose changed baselines have no media from a login in `scripts/ci-trusted` for their current contents, so a baseline changed again after its media needs fresh media. Without a PR number (`npm run ci` in a worktree) it only says what needs media. `golden.mjs --update` and `sweep.mjs --update-baseline` print the command.
