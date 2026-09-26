---
tool: `blender/checks/golden.mjs [--update]`
section: render
covers: blender/checks/golden.mjs
---
Close-up renders compared with stored reference images. Update the references only deliberately, in the PR that changes the look.

Each scene steps to its pose drawing only the final frame (`__settle`), and is cached on its own: a scene that passes, or is updated, records every file its page loaded, and a later verify or `--update` skips it while none of those files, its reference or the tools changed. With every scene unchanged it starts no browser and takes no lock. `HITL_NO_CHECK_CACHE=1` renders them all.

Whenever golden renders, it also draws `char-lineup` frame by frame and fails unless that matches its final-frame render byte for byte, so a draw path that starts keeping state between frames breaks loudly. Requests to other hosts (the web fonts) are recorded by address only and always count as unchanged in a scene's key.
