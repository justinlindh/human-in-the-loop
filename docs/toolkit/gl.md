---
tool: `scripts/lib/gl.js`
section: ci
who: all
covers: scripts/lib/gl.js
---
Picks GPU or software GL for every headless browser (`--software` or `--gpu`, else `HITL_GL=software|gpu`, else the GPU), holds the matching render lock, and logs a lost WebGL context to the timing log. Every launcher prints its mode as `<tool>: GL <mode> (<renderer>)`, and a run that asked for the GPU and got software GL fails instead of burning CPU.
