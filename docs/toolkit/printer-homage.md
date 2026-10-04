---
tool: `node scripts/capture.js --manifest scripts/reels/printer-homage/manifest.js --out <dir>`, then `scripts/reels/printer-homage/cut.sh <dir> <out.mp4> [audio]`
section: run
who: video, art, audio
covers: scripts/reels/printer-homage/
---
The #681 printer homage animatic. `shots.json` is the shot list (our own staging: start, length, subject, framing, lens, camera move, action and estimated hit times for 20 shots at 30 fps, 81.47 s). `cameras.js` holds each shot's flying-camera keys in metres on a flat field with the printer at the origin; a key with `rel` ('K', 'T', 'S' or 'G') is an offset from that figure's track. `standins.js` builds the stand-ins (a ground plane, a printer box, three capsule figures on simple tracks) in the game's own renderer. `manifest.js` makes one capture item per shot, `homage-00` to `homage-19`, hiding the office and flying the camera at the shot's real length; `cut.sh` joins them in order, with an optional sound bed laid under (the cut ends with the shorter of the two). Art's blocking replaces the stand-ins; the camera keys and timings stay.

The reference clip the shot list was cut from is the owner's, local only: nothing from it is committed, uploaded or attached to a PR.
