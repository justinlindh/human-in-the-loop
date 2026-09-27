---
tool: `node blender/checks/onscreen.mjs [--mock m | --moment '<query>' | --snapshot <path>] [--speed 1] [--frames a,b] [--patch-js ...] [--event '<json>'] [--json <file>]`
section: run
who: video, art, reviewer
covers: blender/checks/onscreen.mjs
---
What's on screen, without recording: for each sampled frame, whether the title screen is up, the clock (week, speed, paused or frozen, a spotlight holding it), the pending decision and where it stages its prop, every visible UI panel (decision card, tray cards, top bar chips, chat) with its first line of text and screen rectangle, the camera's yaw and zoom, and the screen box of every staged prop and person on screen. It runs the game's own frame (sim, UI and renderer) with drawing off, so a moment's setup reads back in two or three seconds. Run it before a capture or a render check to confirm the shot holds what you expect: the card is up, the clock is stopped, the prop is in frame, nothing covers the subject. `--speed 1` lets the clock run (a mock or a loaded game otherwise sits at speed 0). A snapshot opened with `--moment` or `--snapshot` loads the save without leaving the title screen, and the probe says so on each frame.
