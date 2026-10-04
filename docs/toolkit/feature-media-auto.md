---
tool: `scripts/feature-media-auto.sh [--force]` (the hitl-feature-media timer, every 10 minutes)
section: run
who: video, integrator
covers: scripts/feature-media-auto.sh scripts/feature-media-auto.test.sh scripts/systemd/hitl-feature-media.service scripts/systemd/hitl-feature-media.timer
---
Keeps the published feature media current after merges. For each new `origin/main` commit it works in its own clone (`~/.cache/hitl-ci/feature-media-auto/clone`), asks `npm run feature-media -- --stale` which ids' inputs changed since their last published render, and re-renders just those with `npm run feature-media -- --only <ids> --publish` (GPU render lock, published to the `feature-media` branch under the same names, so doc links never change). Nothing stale means no render. The commit is recorded in `last` once handled; `--force` runs the current one again.

A failure opens an issue labelled `feature-media-red` (or comments on the open one) with the last log lines, and a passing run closes it. Logs are `~/.cache/hitl-ci/feature-media-auto/<sha>.log`. `FM_AUTO_TIMEOUT` caps the render (default 3000 s). The two `feature-media` options are owned by video (`scripts/feature-media/`); this script only calls them.
