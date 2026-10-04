---
tool: `blender/checks/standup.mjs [--jobs=N] [--browser] [--no-live]`
section: render
covers: blender/checks/standup.mjs blender/checks/standup-pages.js blender/checks/standup-speech.mjs blender/checks/standup-live.mjs
---
Standups gather everyone inside the walls and clear of furniture, in every office.

**Where it runs.** The cases play on the studio engine by default, each in its own Node process (`scripts/studio/page-host.mjs`), `--jobs=N` at once (default an eighth of the cores), with no Vite server, browser or render slot. The engine keeps a small DOM tree, so the speech cases find the game's bubbles by class as a page does (nothing is laid out). `--browser` plays the same page function (`standup-pages.js`) in harness pages instead, 8 at once by default, the reference the engine is held to: `node scripts/studio/parity.mjs --preset standup` runs both and compares every line. The check cache keys engine and browser passes apart, and an engine pass also on `scripts/studio/`.

The speech cases observe actual bubbles through complete meetings at 1x, 2x and 4x. They require every turn in event order, including a returning speaker, full reading holds, and a single bubble slot. A priority bubble tests denied-slot retry; unrelated chatter and routine celebration lines must wait outside the conversation. Pause, menu freeze, speed changes, departures, away status and an empty meeting exercise completion and release.

A spotlight (a short letter scene, started directly) interrupts a visible standup bubble in the priority case. The meeting waits out the scene and replays the interrupted turn for its full reading hold before continuing.

Once the cases pass, the standup gate runs `node blender/checks/standup-live.mjs` in a browser (it needs main.js's own game loop); `--no-live` leaves it out. It can run alone to check the actual producer and main game loop: normal outage recovery at 1x/2x/4x, replacement incidents, and complete two-speaker scripts among remote, absent, burnt-out or coasting colleagues. Every resulting turn needs its full reading hold, one bubble and the expected order. The simulation must advance and the meeting must finish. Captures and assertion marks go to `shots/standup-live`.
