---
tool: `scripts/lib/gl.js`
section: ci
who: all
covers: scripts/lib/gl.js
---
Picks GPU or software GL for every headless browser (`--software` or `--gpu`, else `HITL_GL=software|gpu`, else the GPU), holds the matching render lock, and logs a lost WebGL context to the timing log. Every launcher prints its mode as `<tool>: GL <mode> (<renderer>)`, and a run that asked for the GPU and got software GL fails instead of burning CPU.

`holdRenderLock(mode)` re-runs the command under `scripts/with-render-lock.sh` and exits with its status. The re-run carries a parent-death signal (`setpriv --pdeathsig TERM`), so killing the top process alone, even with `kill -9`, stops the render and frees the lock. On a machine without `setpriv` the re-run outlives a killed parent; signal the whole process group there.
