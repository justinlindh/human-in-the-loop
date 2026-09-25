---
tool: `node scripts/phone-check.js [--devices ...] [--checks ...]`
section: browser
covers: scripts/phone-check.js
---
Plays the real game on phone and tablet device descriptors (iPhone 14 portrait and landscape, a 360x800 Android, iPad Mini; also iPhone SE and Android landscape, and desktop for layout) with real multi-touch, and fails on anything that blocks play by finger: pinch zoom and pan, HUD overlaps, panels and decision cards that don't fit or can't be tapped, toasts, tap placement, pinch-safe taps, Yak expanding and maximizing without covering the HUD, and audio unlock under an iOS-like gesture rule. Screenshots go to `--out` (default `shots/phone/`). Run it on any change to the HUD, panels, camera input or audio unlock. `--query mock=hq` exercises all nine panels. Local CI runs it (step `phone-check`, on a GPU slot) when a PR touches `src/ui/`, `src/audio/`, `index.html`, `src/main.js`, `src/quality.js`, or the render code that takes pointer input or picks (`src/render/build.js`, `camera.js`, `index.js`); the main guard runs it hourly on main.
