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
| `trailer-vertical.mp4` | 1080x1920: the logo above a square gameplay window, captions and the play URL below |
| `trailer.json` | what went in: build commit, beat timings, voiceover lines and their lengths |
| `clips/` | the raw captures, one per beat, with the capture `index.json` |
| `gfx/` | the rendered cards, captions and vertical frame |
| `mix.wav` | the final audio mix |

Flags:

- `--vo <dir>`: the voiceover, one WAV per line named by line id (`l1.wav`, `l2.wav`, ...). Without it the
  trailer is built with music and captions only, which is handy while editing cuts.
- `--reuse`: keep clips already captured from the same commit and capture only the rest.
- `--no-vertical`, `--no-captions`: skip the vertical cut, or the burned-in captions.
- `--print-vo`: print the voiceover lines as JSON (the input the voice script reads).
- `--software`: capture with SwiftShader when there is no GPU for the browser.

The cards load the Fredoka font from Google Fonts, so the build needs network access; it stops if the
font does not load rather than falling back to a different face.

## Changing it

Everything lives in `scripts/trailer/config.js`:

- `BEATS`: the cuts, in order. A clip beat names a capture item from `scripts/capture-manifest.js`
  (`item`), overrides for it (`capture`: seconds, warmup, hideUi, ...), where to cut (`from`, `dur`),
  optional camera zooms (`camera: [{ at, zoom }]`) and page actions, and where the vertical cut's square
  window sits (`vx`). A card beat names one of `CARDS`.
- `MUSIC`: the bed, tracks that swap in for a stretch (the music night track), stingers, ducking under the
  narrator, and the fade out. Times are seconds or `{ beat, offset }`, so they follow a beat when cuts move.
- `VO`: the narration lines, their cue points and caption switch.

`scripts/trailer/manifest.js` turns the beats into a capture manifest; `scripts/trailer/cards.js`
renders the stills; `scripts/trailer/build.js` runs capture, cuts, mixes and encodes. Capture runs under
`timeout` and `nice`, and each ffmpeg step has its own ceiling.

To check a cut quickly, build without the voiceover and with `--reuse`, then look at a contact sheet:

```sh
npm run trailer -- --reuse --no-vertical
ffmpeg -i shots/trailer/trailer.mp4 -vf "fps=2,scale=480:-1,tile=6x10" -frames:v 1 shots/trailer/sheet.png
```

If a beat's `from + dur` runs past its capture, the build stops and says which beat.

## The voiceover

See `scripts/trailer/vo/` for how the narration is rendered, and `LICENSES.md` for the voice's source and
license. Rules: the voice is synthetic or from a source whose license allows this use, never a clone of an
identifiable living person without that person's license; no pitch-shifting; generation runs on the GPU
and stops if the GPU is unavailable.
