---
tool: `node scripts/phone-check.js [--devices ...] [--checks or --only ...] [--failed] [--list] [--jobs 4]`
section: browser
covers: scripts/phone-check.js
---
Plays the real game on phone and tablet device descriptors (iPhone 14 portrait and landscape, a 360x800 Android, iPad Mini; also iPhone SE and Android landscape, and desktop for layout) with real multi-touch, and fails on anything that blocks play by finger: pinch zoom and pan, HUD overlaps, panels and decision cards that don't fit or can't be tapped, toasts, tap placement, pinch-safe taps, Yak expanding and maximizing without covering the HUD, and audio unlock under an iOS-like gesture rule. Screenshots go to `--out` (default `shots/phone/`). Run it on any change to the HUD, panels, camera input or audio unlock. `--query mock=hq` exercises all nine panels. Local CI runs it (step `phone-check`, on a GPU slot) when a PR touches `src/ui/`, `src/audio/`, `index.html`, `src/main.js`, `src/quality.js`, or the render code that takes pointer input or picks (`src/render/build.js`, `camera.js`, `index.js`); the main guard runs it hourly on main.

The `yakdecision` case opens the big Yak, raises a decision, checks the card is on top, answers it and checks the clock runs again; it also checks the minimize button is 44 px.

The `skip` case also checks caption ownership during overlapping moments, queued warning suppression and release, and ending spotlights when the player opens Staff.

A game that doesn't load within 90 s gets one retry; if it still doesn't, that check fails with "game didn't load, twice" and the run moves on to the next one. The long-toast case clears any open cards (and keeps the clock stopped) before it taps, and polls for the opened toast instead of waiting a fixed time.

`--jobs <n>` (default 4) runs that many device and check pairs at once, each job in a Chromium of its own against one dev server; every pair still gets a fresh browser context, and the output, `last-run.json` and `--failed` read exactly as a one-job run (`--jobs 1`).

Fix loop: the full run is 40 device and check pairs, so while fixing run one case or the ones that failed. `--only <check[,check]>` is `--checks`; `--devices` narrows the devices; `--failed` reruns only the device and check pairs that failed in the last run (recorded in `<out>/last-run.json`, updated by every run, so a pair that passes drops off and one that isn't rerun keeps its record); `--list` prints the check and device names. A single case on one device takes about three seconds. Run the whole thing once before pushing.

A clean full run is recorded in the check cache (`blender/checks/cache.mjs`) with every file its pages requested (UI, CSS, audio, render, sim, models, fonts, `index.html`) and the script's own imports. The key adds the GL mode, Node, the installed Playwright, Chromium, three and vite, and the page shell. A rerun skips, before taking a GPU slot, while all of those are unchanged. It prints `phone-check: skipped, reusing the clean pass recorded at <commit>` and makes no new screenshots. A narrowed run (`--failed`, `--devices`, `--checks`, `--only`, `--query`) never skips or records. `HITL_NO_CHECK_CACHE=1` forces a run.
