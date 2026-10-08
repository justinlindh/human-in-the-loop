# First-person clips (epic #1810)

Render with `node scripts/capture.js --manifest scripts/reels/first-person/manifest.js --only <id> --audio`.

Each clip: 1920x1080 desktop unless noted, UI as a player sees it in the mode (HUD hidden by the game), 5 to 12 s, game audio on, a crop strip of one frame a second.

| id | shot | size | notes |
|---|---|---|---|
| fp-seeas-walk | See as a person walking desk to coffee counter | 1920x1080 | fixed view, no input; showing the "Seeing as" tag |
| fp-seeas-work | See as a person sitting and working at a desk | 1920x1080 | monitor and hands-level view; 6 s hold |
| fp-walk-desktop | Walk with WASD and mouse look: forward, turn, along a desk, into a wall | 1920x1080 | keys sent as keydown/keyup, look through the input hook; hint line visible |
| fp-walk-ipad | Walk on touch: stick held under the left thumb, drag right half to look | 820x1180 | needs capture `touch: true` (asked integrator); stick and knob visible |
| fp-enter-exit | Click See as / Walk, then Exit; overhead returns exactly | 1920x1080 | buttons clicked for real, HUD returns |
| fp-transition | Overhead eased push to a person, then See as; one continuous shot | 1920x1080 | eased capture camera, no snap; camera stats printed |

Checks per clip: camera step stats (largest step, largest change between steps), game audio audible, no console errors, the mode tag visible in the frame.
