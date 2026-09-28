---
tool: `blender/checks/golden.mjs [--update]`
section: render
covers: blender/checks/golden.mjs blender/checks/golden-identity-controls.mjs blender/checks/cache.mjs
---
Close-up renders compared with stored reference images. Update the references only deliberately, in the PR that changes the look.

Each scene steps to its pose drawing only the final frame (`__settle`), and is cached on its own: a scene that passes, or is updated, records every file its page loaded, and a later verify or `--update` skips it while none of those files, its reference or the tools changed. With every scene unchanged it starts no browser and takes no lock. `HITL_NO_CHECK_CACHE=1` renders them all.

That frame-by-frame identity check has its own success record, separate from the scene records and keyed on the identity scene, the tools and everything they load. A run passes on the cache alone only when every selected scene and that record are current; scenes cached without it open a browser for the identity check alone (`--only=` subsets share the one record). The record is dropped before the check starts and written only when both renders exist, match byte for byte and raise no page errors, so a failed, errored or interrupted check leaves nothing that could vouch for the next run. A check that does not pass exits 1, saves the renders it has as `shots/golden/char-lineup.{stepped,settled}.png` (only one if the other failed to run) and logs their hashes and differing pixels. A mismatch has more than one possible cause: a draw path that keeps state between frames, or a page or asset not ready in one render.

`node blender/checks/golden-identity-controls.mjs` runs golden for real against a scratch cache (`HITL_CHECK_CACHE_DIR`) and checks each case: a cold pass, the browserless rerun, scene records without an identity record, subset selection, a deliberate temporal draw effect (`HITL_GOLDEN_IDENTITY_SETUP`, script run in the identity page before it steps), a single erroring render, changed inputs, the cache disabled, and an interrupted run. About two minutes; run it under `timeout` and `nice` when you change golden or cache.mjs. Requests to other hosts (the web fonts) are recorded by address only and always count as unchanged in a scene's key.
