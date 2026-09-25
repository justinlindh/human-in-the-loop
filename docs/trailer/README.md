# The trailer

A 25 to 30 second trailer built entirely from the current tree: seeded real games (and a few staged
mock scenes) recorded through the deterministic capture path, the game's own music and stingers, cards
rendered in the game's font and palette, and a narrated voiceover.

## Regenerate it

```sh
npm ci
npm run trailer -- --vo shots/trailer/vo
```

Output lands in `shots/trailer/` (ignored by git):

| File | What |
|---|---|
| `trailer.mp4` | 1920x1080, 30 fps, H.264 and AAC, loudness-normalized to -14 LUFS |
| `trailer-vertical.mp4` | only with `--vertical`: 1080x1920, the logo above a square gameplay window, captions and the play URL below |
| `trailer.json` | what went in: build commit, beat timings, voiceover lines and their lengths |
| `clips/` | the raw captures, one per beat, with the capture `index.json` |
| `gfx/` | the rendered cards, captions and vertical frame |
| `mix.wav` | the final audio mix |

Flags:

- `--vo <dir>`: the voiceover, one WAV per line named by line id (`l1.wav`, `l2.wav`, ...). Without it the
  trailer is built with music and captions only, which is handy while editing cuts.
- `--reuse`: keep clips already captured from the same commit and capture only the rest.
- `--vertical`: also build the 1080x1920 cut.
- `--no-captions`: skip the burned-in captions.
- `--print-vo`: print the voiceover lines as JSON (the input the voice script reads).
- `--software`: capture with SwiftShader when there is no GPU for the browser.

The cards load the Fredoka font from Google Fonts, so the build needs network access; it stops if the
font does not load rather than falling back to a different face.

## Changing it

Everything lives in `scripts/trailer/config.js`:

- `BEATS`: the cuts, in order. A clip beat names a capture item from `scripts/capture-manifest.js`
  (`item`), overrides for it (`capture`: seconds, warmup, hideUi, ...), where to cut (`from`, `dur`),
  optional in-game camera zooms (`camera: [{ at, zoom }]`) and page actions, a camera-style push-in done
  in the edit (`punch: { at: [x, y], zoom: [from, to] }`, eased over the beat toward that point of the
  frame), and where the vertical cut's square window sits (`vx`). A card beat names one of `CARDS`.
- `MUSIC`: the bed, tracks that swap in for a stretch (the music night track), stingers, ducking under the
  narrator, and the fade out. Times are seconds or `{ beat, offset }`, so they follow a beat when cuts move.
- `VO`: the narration lines, their cue points and caption switch.

The first launch, the incident and the era arrivals are the trailer's own capture items
(`scripts/trailer/manifest.js`). Each plays a real game with the balanced bot and stops the week before
its event, so the event happens live on camera. The launch and incident seeds are not fixed: when the
manifest loads, it replays candidate seeds in the pure sim and takes the first whose event lands in a
clean week (no decision or other launch card on top), so a sim change never leaves the trailer showing
the wrong scene. If the page's game ever misses its event, the capture logs an error and the build stops.

`scripts/trailer/manifest.js` turns the beats into a capture manifest; `scripts/trailer/cards.js`
renders the stills; `scripts/trailer/build.js` runs capture, cuts, mixes and encodes. Capture runs under
`timeout` and `nice`, and each ffmpeg step has its own ceiling.

To check a cut quickly, build without the voiceover and with `--reuse`, then look at a contact sheet:

```sh
npm run trailer -- --reuse
ffmpeg -i shots/trailer/trailer.mp4 -vf "fps=2,scale=480:-1,tile=6x10" -frames:v 1 shots/trailer/sheet.png
```

If a beat's `from + dur` runs past its capture, the build stops and says which beat.

## The voiceover

The narrator is a synthetic deadpan voice: the Qwen3-TTS Base clone model, run on the GPU through the
audio lane's voice-clone script, prompted with the audio lane's designed reference `ref_masc_deadpan`
and its transcript. Source and licence are in `LICENSES.md` next to this file.

1. Render takes, three per line by default:

   ```sh
   VOICE_CLONE=<the audio lane's voice-clone script> \
   TRAILER_VO_REF=<ref_masc_deadpan.wav> \
   TRAILER_VO_REF_TEXT=<ref_text.txt, the reference transcript> \
     scripts/trailer/vo/render.sh shots/trailer/takes 3
   ```

   The lines come from `VO.lines` in `config.js` (written to `shots/trailer/takes/lines.json`), and
   each take lands as `<line id>.take<n>.wav`. All three variables are required: the script refuses to
   run without them, so the voice-clone script's own default reference (a recording of a real person)
   is never used.

2. Pick and master:

   ```sh
   HF_HUB_OFFLINE=1 python3 scripts/trailer/vo/pick.py --lines shots/trailer/takes/lines.json \
     --takes shots/trailer/takes --out shots/trailer/vo
   ```

   Run it with a Python that has torch (CUDA) and transformers, and a local Whisper large-v3. Each take is
   transcribed with word timings and checked the way an ear would:
   - A take is rejected if it stops before its voice has decayed (clean takes end at -70 dB or lower).
   - It's rejected if its last word ends less than 120 ms before the audio does, or if Whisper doesn't hear the line's last word.
   - Among the rest, the lowest word error wins, then the fewest pauses over 0.6 s, then the length closest to the median take. The shortest take isn't preferred, because that favours rushed or cut takes.

   `--take l1=2,l3=0` forces takes by ear.

   The winner is trimmed to 40 ms before its first sound and to its natural decay. It then gets `--tail` seconds of silence (0.2 by default) so a line never stops dead. Finally one fixed gain sets it to -18 LUFS, under a gentle peak limit; there is no dynamic loudness processing. It's written as `<line id>.wav`. `picks.json` records every take's checks and transcript, and `sample.wav` plays the lines back to back.

3. Build with `npm run trailer -- --vo shots/trailer/vo`. The build warns when a line runs into the next
   one or past the end; move its cue (`at`) in `config.js`.

Rules: no pitch processing, ever. Generation and transcription run on the GPU and stop if it is
unavailable; there is no CPU path. Never clone an identifiable living person's voice.

## Cards and the logo

The cards read `docs/readme/logo.png` fresh on every build (they are never reused), so a new logo shows
up on the next `npm run trailer`, even with `--reuse`.
