---
tool: `node scripts/tools/drive.mjs (--mock <m> | --seed <N> [--play <bot>:<weeks> [--until '<js>']]) [--setup '<js>' | --setup-file <f>] [--steps '<json>' | --steps-file <f>] [--sizes desktop,small,phone] [--out <dir>] [--clip] [--json <f>]`
section: browser
who: ui, art, reviewer
covers: scripts/tools/drive.mjs scripts/tools/drive.test.sh
---
The shared form of the one-off playwright scripts: it starts vite, launches Chromium under the render lock, loads a mock or a seeded real game, gets it into a state, clicks through the UI and screenshots, at each size. Exits 1 on a console error, a failed step or a failed expect, and 2 on a bad argument.

- **Game:** `--mock floor` or `--seed 11` (`--query 'k=v'` adds page params). `--play squads:90` plays the seeded game with that bot to week 90 (`--until '<js over s>'` stops early); `--setup '<js>'` or `--setup-file` runs an async body in the page with `H` (`window.__HITL`) and `s` (its state) and can `await import('/src/...')`.
- **Steps** (JSON array, run at every size): `{"click": "<css>", "text": "<regex>", "nth": 0, "optional": true, "timeout": ms}` (visible matches only; a tap on touch sizes), `{"dismiss": true}` (closes info cards and takes an open decision's first accepted choice), `{"press": "Escape"}`, `{"wait": ms}`, `{"waitFor": "<js>", "timeout": ms}`, `{"tick": n}`, `{"speed": n}`, `{"dispatch": {...}}`, `{"eval": "<js>", "as": "key"}`, `{"count": "<css>", "as": "key"}`, `{"expect": "<js>", "msg": "..."}`, `{"shot": "name"}`.
- **Sizes:** `desktop` 1920x1080, `laptop` 1440x900, `small` 1024x640, `hd720`, `phone` 390x844 with touch, or `WxH` and `WxHt` (touch).
- **Output:** `<out>/<name>-<shot>-<size>.png` (default `shots/drive/drive-...`); `--clip` records a WebM per size; `--json` writes the eval, count, expect and setup results.

An incident played to its postmortem at two sizes (ui's `incident.mjs`, 72 lines):

    node scripts/tools/drive.mjs --seed 11 --play squads:90 --until "s.week > 90 && s.products.filter((x) => !x.killed).length >= 2 && !s.outage" \
      --setup-file inc-setup.js --sizes desktop,phone --name inc \
      --steps '[{"wait":1500},{"shot":"1alarm"},{"tick":1},{"speed":3},{"waitFor":"window.__HITL.state.pendingDecision && !window.__HITL.state.outage","timeout":90000},{"shot":"4postmortem"}]'

with `inc-setup.js` holding the four lines that call `landIncident`. For phone playability (pinch, HUD overlaps) use [phone-check](phone-check.md); for a still of one scene, `npm run snap` or `scene.mjs`.
