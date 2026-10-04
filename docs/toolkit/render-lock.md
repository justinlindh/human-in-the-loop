---
tool: `scripts/with-render-lock.sh`, `scripts/render-lock-held.sh`
section: ci
who: all
covers: scripts/with-render-lock.sh scripts/render-lock-held.sh
---
`with-render-lock.sh --gpu <cmd>` takes one of `HITL_GPU_SLOTS` GPU slots (lifecycle, soak, snap, clip, standup, scene, capture and the trailer run here); `--software <cmd>` (the default mode) takes one of `HITL_SOFT_SLOTS` software-GL slots (golden, and anything forced onto SwiftShader; default a quarter of the cores). Slot 1 (`render-checks.lock`) is always available; slots 2 and up are taken only while load1 is under `HITL_SOFT_LOAD` (default three quarters of the cores), so a loaded machine behaves as before, one holder at a time. A waiter blocks briefly on slot 1 and looks at the others again every `SOFT_POLL` seconds (default 5). A quiet window waits for every slot. Nested calls go straight through when a caller already holds a lock that covers them (`render-lock-held.sh`); a software slot covers both kinds.
