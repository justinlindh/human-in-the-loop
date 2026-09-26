# Independent review reproductions for PR 746

Reviewed source: 62cacad0a790e0b27e96a5c293b7b098199bafd7.

Place failure-capture.mjs in logs/review-746/ of that checkout. Run:

```sh
timeout 600 nice -n 10 node scripts/capture.js --manifest logs/review-746/failure-capture.mjs --out logs/review-746/failure-media --quality medium --no-webm
```

The capture helper acquires its render lock. Source is unchanged. These are focused, scripted fixtures using the real standup producer, renderer and main loop, not frequency measurements from an unmodified career. They invoke the producer once after arranging the state; they do not supply dialogue text. Menus and decisions are dismissed to keep the real simulation advancing. The camera is focused on actual attendee goals. The UI stays visible.

- independent-daily-outage-4x.mp4: 35 seconds at 30 fps. Seed 26, balanced bot to week 110, office attendance, idle assignments and no projects. At clip second 4, create a recoverable outage, generate a daily standup through standupSystem, present its event, and continue at 4x. The normal incidents system clears the outage on the next tick. The 10-second still shows the recovery toast and the contradictory new bubble together. Later turns and meeting completion are included. No Yak outage linkage is involved.
- independent-two-attendees.mp4: 20 seconds at 30 fps. Seed 26 at week 110, two available attendees and the rest on sabbatical. At clip second 4, generate and present the daily standup. The only spoken lines are "Any questions we are avoiding?" and "What does done mean for this week?". The script's answer is absent from the generated event, and the meeting ends. This company already has standups unlocked.

Trace timestamps are the capture clock, including boot time, not exact clip-relative timestamps. The outage trace records event creation at 4.533 seconds, recovery at 5.533 seconds, and the false "still down" line at 9.900 seconds. The two-attendee trace records the questions at 6.967 and 11.167 seconds, then meeting completion at 15.933 seconds.

The separate real-loop probe records recovery 2.0 seconds after its fixture starts, and the false line at 5.4 seconds. Its main-loop shim comes from blender/checks/loop.mjs, and the probe steps at 30 fps. Its successful lifecycle cases cover 1x, 2x, 4x, speed switching, explicit pause, real Settings-menu pause, launch replay, departure, remote status and sabbatical status. The renderer harness separately covers denied-slot retry and empty meetings.

acceptance.log records the failed behavioral assertions. npm-test-public.txt records the full unit suite. sim-probes.log records 200-seed, 50-meeting comparisons for each mode: exact async events/state, and exact daily RNG/state apart from the new bounded conversation memory.
