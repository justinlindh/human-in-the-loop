# Independent outage-expiry review reproduction

Reviewed commit: 86517b1e2f56eba416d9b92c52e954591efd9a8b.

Run `node "$EVIDENCE_DIR/independent-checks.mjs"` from the reviewed checkout. It uses the actual async standup producer, outage lifecycle, product action and save loader. The resolved-outage assertions fail at 1x, 2x and 4x, exit 1. Historical retention, product removal and old-save groups pass. This is an acceptance failure outside the submitted regression suite, which passes 104 files and 882 tests, exit 0.

For visible timing, keep `standup-capture.mjs` beside the original PR's `capture.mjs`. Run:

```sh
YAK_BUILD_LABEL=Review timeout 180 nice -n 10 node scripts/capture.js --manifest "$EVIDENCE_DIR/standup-capture.mjs" --out shots/independent-standup --no-webm --quality medium
```

The tool acquires the render lock. Crop the output with `ffmpeg -vf 'crop=608:644:0:80'`.

This fixture uses the real game loop at 4x and the actual `standupSystem` producer. It sets up a week-1 company with two idle engineers, a product and a short reading notice. At 0.2 seconds it starts an outage and runs the async standup producer until it emits chat (at most ten calls). It disables the policy afterward to isolate the queued posts, clears the outage at 1 second, and selects #standup. The first stale post appears at 6.033 seconds, week 4: "Still on the Inboxer outage. The logs hate me." The trace records no outage context on the posts and outage false at delivery. The eight-second capture completes with zero browser errors. No simulation rule or source file is changed.

This is a focused scripted regression reproduction, not a general playtest or a measure of how often players encounter the bug. The supplied paired 28-second clips remain valid evidence for the tagged emitter path and age expiry. They do not exercise the untagged async standup path.
