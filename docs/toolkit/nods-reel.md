---
tool: `npm run capture -- --group nods --out shots/nods --size 1920x1080 --fps 30 --audio --no-webm`, then `scripts/nods-reel.sh shots/nods shots/nods-reel.mp4`
section: run
who: art
covers: scripts/nods-reel.sh
---
The Office Space nods reel. Each nod loads the save from the week before its decision (`moment` with `pre: true`), so the game's own tick raises it, card and freeze included, with the side overlays hidden and the camera held on what the nod stages. The script trims each beat to its decision, crops a 1280x720 window round the action and the card, and titles the beats; the sound is the game's own, the printer's cue included.
