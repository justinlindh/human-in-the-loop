---
tool: `blender/checks/standup.mjs`
section: render
covers: blender/checks/standup.mjs blender/checks/standup-speech.mjs blender/checks/standup-live.mjs
---
Standups gather everyone inside the walls and clear of furniture, in every office.

The speech cases observe actual bubbles through complete meetings at 1x, 2x and 4x. They require every turn in event order, including a returning speaker, full reading holds, and a single bubble slot. A priority bubble tests denied-slot retry; unrelated chatter and routine celebration lines must wait outside the conversation. Pause, menu freeze, speed changes, departures, away status and an empty meeting exercise completion and release. Run with `--jobs=2` to limit concurrent pages; unchanged inputs use the normal render-check cache.

A launch spotlight interrupts a visible standup bubble in the priority case. The meeting waits out the scene and replays the interrupted turn for its full reading hold before continuing.

The standup gate also runs `node blender/checks/standup-live.mjs`, which can run alone to check the actual producer and main game loop: normal outage recovery at 1x/2x/4x, replacement incidents, and complete two-speaker scripts among remote, absent, burnt-out or coasting colleagues. Every resulting turn needs its full reading hold, one bubble and the expected order. The simulation must advance and the meeting must finish. Captures and assertion marks go to `shots/standup-live`.
