# Standup conversation evidence

PR head: 62cacad0a790e0b27e96a5c293b7b098199bafd7.
Rendered source: 3664bbea8e1dcb5a7028d4525ac8b7a91b489aa6. The capture index reports ca9add26 because capture began before the prepared merge was committed. Final head adds the main UI-logo merge and remote/sabbatical cast exclusion. The recording fixture has office attendees, so that exclusion does not alter these conversations.

The capture manifest uses seed 26, played by the balanced bot to week 110. Daily standups and office attendance are selected for the fixture. The game clock then runs normally; the bot handles decisions after three seconds and supplies weekly actions. Speech comes from the simulation and real renderer. No dialogue or meeting events are injected. The camera follows attendee goals with the existing eased capture helper and yields during spotlights. Side panels are hidden; gameplay and stat bubbles remain.

A continuous 650-second scout identifies the successive staged meetings at weeks 111, 131 and 152. The selected capture deterministically replays that run and warms through the quiet intervals before recording each complete meeting, including gathering and return to work. Transcript timestamps include warmup; subtract each item's origin to get clip time. Earlier meetings in an item's transcript occurred during warmup.

The second meeting waits for an existing launch bubble before speaking. The third meeting's final turn is interrupted by a launch spotlight and replayed with its full reading time. The speed clips use the opening meeting at 2x and 4x and retain the first 33 seconds of each 60-second capture, including the complete conversation and return.

Place manifest.mjs, selected.mjs, speeds.mjs and scout.mjs under shots/standup741, then run from the repository root:

```sh
timeout 1500s nice -n 10 node scripts/capture.js --manifest shots/standup741/scout.mjs --out shots/standup741/merged-scout --quality medium --no-webm
timeout 1200s nice -n 10 node scripts/capture.js --manifest shots/standup741/selected.mjs --out shots/standup741/final --quality medium --no-webm
timeout 600s nice -n 10 node scripts/capture.js --manifest shots/standup741/speeds.mjs --out shots/standup741/final-speeds --quality medium --no-webm
```

All three capture commands exited zero with zero browser errors. The capture tool takes its render lock. Close stills are 680x420 crops from the 1280x800 output, offset 340,180. Review sheets use scripts/sheet.sh.

The first reading interval, seconds 6 to 27, has max camera step 0.0023 m, max jerk 0.0003 m, and max zoom step 0.0000. The eased approach has max step 0.2085 m, max jerk 0.0304 m, max zoom step 0.0486. These are capture-camera measurements, not gameplay changes.
