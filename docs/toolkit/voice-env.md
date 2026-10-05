---
tool: `node src/audio/voice-env.mjs`
section: run
who: audio
covers: src/audio/voice-env.mjs src/audio/voice-env.json src/audio/voiceevent.js
---
Regenerates `src/audio/voice-env.json`, the per-take loudness tracks behind the `hitl:voice` event that faces follow (`rate` 30, `scale` 35: one base36 character per 1/30 s, peak-normalized per take). It decodes each voice bank sprite in `public/audio/voice/` with ffmpeg and reads the take offsets and lengths from `src/audio/assets.json`, so it needs ffmpeg and no GPU, and the same files always give the same output.

Run it after adding, removing or recutting a voice take (any change to `assets.json` voice entries or the voice `.ogg` files), then commit the new JSON. `voiceevent.test.js` fails with a message naming this command when a take has no track or one of the wrong length.
