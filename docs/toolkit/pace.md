---
tool: `node scripts/pace.js ...`
section: sim
who: sim, integrator
covers: scripts/pace.js
---
Plays the real sim through the pacer with a simulated player and reports what a person would see, and when, in real time.

Tagged `say.moment` lines leave the weekly pacer immediately. Their reading order and scene timing belong to the renderer, which keeps them moving while a decision or spotlight holds the sim clock; use a real-game capture to judge those bubbles.
