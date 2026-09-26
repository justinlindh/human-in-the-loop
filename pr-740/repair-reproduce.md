# Async standup outage repair evidence

PR #740, head b90c5acf7c74c962f9699ed1003c97e96b345f89.

The paired eight-second clips use the actual standup producer, Yak queue and main game loop at 4x. They add close Yak framing and a status banner for inspection. They are a scripted acceptance reproduction, not a general playtest or standup frequency measurement.

Both queue the same two outage posts and one ordinary async post at 0.2 seconds behind a short reading notice. The outage clears at 1 second. Before repair, the stale outage line appears at 6.033 seconds, below both age ceilings. On the repaired head, the ordinary async post appears at 6.033 seconds and neither outage post appears. The reading notice appears at 0.033 seconds in both; both report zero browser errors.

The before capture uses 86517b1 with main 811d8765 merged and the spotlight conflict reconciled, before modifying standup.js. Its capture index reports the pre-commit HEAD because the merge was uncommitted. The after clip was rerun on the clean committed source b90c5acf. No capture fixture edits production source. No other visual design changes are introduced by the repair.

Download repair-capture-base.mjs, repair-standup-capture.mjs and repair-paired-capture.mjs together into one evidence directory. Run from the repository root:

```sh
YAK_BUILD_LABEL=After timeout 300 nice -n 10 node scripts/capture.js --manifest evidence/repair-paired-capture.mjs --out evidence/after --no-webm
```

The capture tool acquires the GPU render lock. For a matching before capture in an owned baseline worktree, use the same command with YAK_BUILD_LABEL=Before and an evidence/before output directory. check-capture.mjs checks both index.json files, exact arrival times, outage linkage, unchanged producer text and zero browser errors:

```sh
node evidence/check-capture.mjs evidence
```

Regression and validation commands, all successful commands exit 0:

```sh
timeout 120 nice -n 10 npx vitest run tests/sim/standup-queue.test.js
timeout 120 nice -n 10 npx vitest run src/yak-pacing.test.js tests/sim/talk.test.js tests/sim/standup.test.js tests/sim/standup-queue.test.js src/spotlight-pacing.test.js
timeout 1500 nice -n 10 npm test
timeout 300 nice -n 10 node blender/checks/loop.mjs --moments ''
timeout 120 nice -n 10 npm run build
node scripts/features-ids.mjs
timeout 120 nice -n 10 node independent-checks.mjs
```

Before repair the new producer-to-queue file has six failing resolved/replaced-outage cases and 15 passing controls, exit 1. After repair its 21 cases pass within the 56-case focused run. Full npm test passes 109 files and 926 tests. The independent acceptance probe has three passing groups and zero failing acceptance cases. Spotlight validation passes six real-loop checks.

producer-equivalence.mjs write baseline.json records 200 seeds per mode with 10 standups each. Running producer-equivalence.mjs compare baseline.json on the repaired source finds identical complete events and state after excluding only the new outageChat linkage, including RNG and synchronous standup behavior. Baseline and repaired runs must share the same merged main. No balancing values or thresholds were changed.

The owner's original presentation approval remains recorded at issuecomment-5850648037. Fresh independent technical review and exact-head checks remain required; auto-merge is off.
