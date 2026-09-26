# Reproduce the chatter sample

Place the downloaded probe.mjs, snapshots.mjs, snapshots.json, clip.mjs and report.mjs under shots/chatter in the branch checkout. The snapshots are identical for both builds.

Run node shots/chatter/probe.mjs after. Set CHATTER_BASE to a checkout of 3b86414b and run node shots/chatter/probe.mjs before. The probe uses the capture tool's frozen clock, the real main.js game loop, seeded saves and trace hooks on event emission, label creation and Yak arrival. Run node shots/chatter/report.mjs for the tables.

For clips, run node scripts/capture.js --manifest shots/chatter/clip.mjs --out shots/chatter/clip --quality medium --no-webm --audio. Repeat from the baseline checkout, passing the manifest path. The capture manifest loads the same Office Floor save and plays for 30 seconds at 1x.

The published trace files are named chatter-before.json and chatter-after.json. Rename them before.json and after.json under shots/chatter to regenerate tables without running a browser.
