# Yak queue expiry at 4x

Compare `yak-before-4x-focused.mp4` and `yak-after-4x-focused.mp4`, both 28 seconds at 30 fps. Still images show 26 seconds into each run.

The game loop runs a seed-1 company at 4x. The fixture gives it desks and a product, emits a reading notice, then queues two posts at 0.2 seconds. One is tied to the outage through the real simulation's chat emitter. The other announces a standup. The real outage clear function resolves the outage at 1 second. Natural sim messages, prompts and reading waits still run.

Before (`da4bf3ac`), the investigation post appears at 16.467 seconds, eight game weeks after recovery. The standup post appears at 22.5 seconds, eleven game weeks after enqueue. After (`86517b1e2f56eba416d9b92c52e954591efd9a8b`), neither stale post appears. The initial reading notice appears at 0.033 seconds in both runs. Both captures report zero browser errors. `traces.json` records DOM arrivals and outage state.

The capture overlay shows elapsed seconds, simulation week and outage status. Yak is enlarged for legibility; the published clips and stills crop that area at native resolution. These presentation adjustments belong only to the capture fixture. Clips are silent.

Place `capture.mjs` outside the checkout and run from each build, supplying its path as `CAPTURE_MANIFEST`:

```sh
YAK_BUILD_LABEL=Before timeout 300 nice -n 10 node scripts/capture.js --manifest "$CAPTURE_MANIFEST" --out shots/yak-before --no-webm --quality medium
YAK_BUILD_LABEL=After timeout 300 nice -n 10 node scripts/capture.js --manifest "$CAPTURE_MANIFEST" --out shots/yak-after --no-webm --quality medium
```

The existing capture tool acquires its render lock. To produce the focused crop, use `ffmpeg -vf 'crop=608:644:0:80'` on each clip. Screenshots use the same crop.

Automated verification:

```sh
timeout 1500 nice -n 10 npm test
timeout 90 nice -n 10 npx vitest run src/yak-pacing.test.js tests/sim/talk.test.js
```

Full suite: 104 files, 882 tests passed, exit 0. Focused suite: 2 files, 26 tests passed, exit 0. `tests.txt` contains the full-suite output with the checkout path removed.
