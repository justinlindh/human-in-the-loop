# Complete daily standup exchanges and live premises

Source: 44264f598c63025f1fd20047c724c2fc10989194, including merged async outage fix #740.

The two repair clips use the original independent review setup, invoking the real standup producer once and then allowing the actual game clock to continue. They show gathering, all spoken turns and completion. No dialogue is injected. UI cards are dismissed by the fixture. The outage has low severity and resolves through the normal incidents system. Two attendees remain available in the other clip; the rest are on sabbatical. That clip lasts 40 seconds so all five turns and departure fit.

Run repair-capture.mjs from a directory two levels below the repository root, such as shots/standup-review/:

```sh
timeout 360 nice -n 10 node scripts/capture.js --manifest shots/standup-review/repair-capture.mjs --out shots/standup-review/clips --no-webm
```

The extra project clip uses the earlier natural-conversation fixture, with the balanced bot following a seed-26 company from week 110. It records 60 seconds around the second staged meeting. The published project clip contains the first 36 seconds, with no retiming, covering the complete exchange and departure. Keep repair-project-capture.mjs beside repair-conversations.mjs and use the same capture command with that manifest.

Observer trace times use the capture clock, including page setup time; they are not exact video seek positions. The metadata records the exact source build and the recorded conversations. Fresh clips were produced only after the final merge was committed. These are focused scripted captures and one bot-driven conversation, not a career-frequency survey.

The permanent standup gate runs all eight real-loop regression cases alongside its 22 existing staging/speech cases:

```sh
timeout 600 nice -n 10 node blender/checks/standup.mjs --jobs=2
```

The live cases cover normal recovery at 1x/2x/4x, a replacement incident, and two-speaker exchanges among remote, absent, burnt-out or coasting colleagues. They require real simulation progress, complete reading holds, order, one bubble and completion. The old reviewed head fails both reported behavior cases with the new checks.
