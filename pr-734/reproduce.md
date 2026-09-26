# Reproduce issue 610 measurements

Reference build: 51ec494f0a67389a2b0e1879275705537550aa62.

Use an isolated checkout of the reference build with its locked dependencies installed. Put the supplied bots.mjs, loop.mjs, report.mjs and audit.mjs in shots/pacing-610. These are measurement artifacts, not additions to the repository toolkit.

Run:

```sh
timeout 600 nice -n 10 node shots/pacing-610/bots.mjs
timeout 1200 nice -n 10 node shots/pacing-610/loop.mjs
timeout 240 nice -n 10 node scripts/pace.js --seed 1 --speed 1 --bot sensible --player both --weeks 1040 --timeline --json > shots/pacing-610/pace-1.json
timeout 240 nice -n 10 node scripts/pace.js --seed 1 --speed 2 --bot sensible --player both --weeks 1040 --timeline --json > shots/pacing-610/pace-2.json
node shots/pacing-610/report.mjs
node shots/pacing-610/audit.mjs
timeout 360 nice -n 10 node blender/checks/loop.mjs
timeout 600 nice -n 10 npm run test:fast
```

The browser probe uses the capture tool's deterministic virtual clock and the real browser loop. Its Vite transforms only add event observers and expose the direct-action presentation route for the automated player's dispatch sink. Rendering updates animation and DOM while the existing draw flag suppresses GPU drawing. It uses the existing GPU lock. It does not patch files in src.

Each nonterminal browser sample spans 120 virtual seconds at 30 fps, including eight-second decision dwell and six-second card dwell. Weekly bot actions have no simulated menu delay. Yak arrivals cover all channels; being added to a channel does not mean that channel is selected or the line is visible.

The supplied loop.json is the measured trace. Its original guard reported failure for two samples that retired at time zero. The replay script stops at retirement, and the report and audit exclude those two zero-exposure samples. The 34 accepted samples and their counts are unaffected.

To regenerate tables from the published data without rerunning a browser, place bots.json, loop.json, pace-1.json and pace-2.json in shots/pacing-610, then run report.mjs and audit.mjs.
