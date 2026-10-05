---
tool: `blender/checks/cache.mjs`
section: ci
who: art, video, integrator
covers: blender/checks/cache.mjs tests/tools/check-cache.test.js
---
Skips a render check whose inputs haven't changed since it last passed. Clip and standup keep one hash of every input (`inputHash`, `passedAt`, `recordPass`), with the studio engine's files in the key. Stage records the files a clean pass actually loaded (`graphBase`, `graphPassedAt`, `recordGraphPass`): the engine processes' module loads and public assets (scripts/studio/load-log.mjs, fed by the loader and the engine's fetch, reported by each engine process with its result) or the pages' requests (`harness.requested()`), plus the static import graph of the check's own script, each with its hash, under a key for the check's flags, Node, the installed tools and browser, the lockfile, build config and page shell. The next run skips only while every recorded file is unchanged, so an edit to the UI, the audio, a reference image or another check keeps the skip; a loaded file that changes or is deleted, or a file added to a directory a loaded module globs, re-runs it. A pass that loaded no game source records nothing, and says so: whenever a pass is not recorded (no game source loaded, a loaded or requested file missing, a key or record that could not be built or written) the check prints `<check>: cache: skipped (<why>)` on stderr. A null key from `HITL_NO_CHECK_CACHE=1` or a narrowed `--only` run is deliberate and prints nothing. Records older than 14 days are pruned when a new one is written. Golden keeps a record per scene instead (`sceneBase`, `sceneUpToDate`, `recordScene`): the files the scene's page requested, with their hashes, under a key for the check code, installed versions and the list of source and public files.

Captured media (feature media) keeps a record per item id, so a run re-renders only the items whose inputs changed:

    const base = itemBase('feature-media', item, ['scripts/feature-media/render.mjs', 'scripts/capture.js']);
    itemStatus('feature-media', item.id, base);       // { upToDate, reason }
    clearItem('feature-media', item.id);               // before re-rendering it
    recordItem('feature-media', item.id, base, loaded); // after a good render: true when recorded

`itemBase` covers the item's spec (a function in it counts by its source), the tool files with their import graphs, Node, the installed tools and browser, the lockfile, build config and page shell. `loaded` is what the capture loaded: page request URLs (mapped to repo files as golden's are), repo paths, or both. `reason` names the first thing that differs: `no record`, `spec or tools changed`, `changed: <file>`, `files added or removed under <dir>`, or `cache off` (`HITL_NO_CHECK_CACHE=1`). Records live in `~/.cache/hitl-ci/<kind>-items/<id>.json` (`HITL_CHECK_CACHE_DIR` moves them), outside every worktree, so all trees share them. A record needs game source among the loaded files; without it `recordItem` prints why and returns false, and the item stays stale.
