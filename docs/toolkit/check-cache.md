---
tool: `blender/checks/cache.mjs`
section: ci
who: art
covers: blender/checks/cache.mjs
---
Skips a render check whose inputs haven't changed since it last passed. Stage, clip and standup record the files a clean pass actually loaded (`graphBase`, `graphPassedAt`, `recordGraphPass`): the engine processes' module loads and public assets (scripts/studio/load-log.mjs, fed by the loader and the engine's fetch) or the pages' requests (`harness.requested()`), plus the static import graph of the check's own script, each with its hash, under a key for the check's flags, Node, the installed tools and browser, the lockfile, build config and page shell. The next run skips only while every recorded file is unchanged, so an edit to the UI, the audio, a reference image or another check keeps the skip; a loaded file that changes, is deleted, or sits in a directory a loaded module globs with a new file re-runs it. A pass that loaded no game source records nothing. Records older than 14 days are pruned when a new one is written. Golden keeps a record per scene instead (`sceneBase`, `sceneUpToDate`, `recordScene`): the files the scene's page requested, with their hashes, under a key for the check code, installed versions and the list of source and public files.
