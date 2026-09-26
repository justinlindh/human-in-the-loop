---
tool: `blender/checks/cache.mjs`
section: ci
who: art
covers: blender/checks/cache.mjs
---
Skips a render check whose inputs haven't changed since it last passed. Golden keeps a record per scene instead (`sceneBase`, `sceneUpToDate`, `recordScene`): the files the scene's page requested, with their hashes, under a key for the check code, installed versions and the list of source and public files.
