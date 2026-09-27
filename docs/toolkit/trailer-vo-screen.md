---
tool: `scripts/trailer/vo/screen.py`
section: run
who: audio
covers: scripts/trailer/vo/screen.py
---
A stricter pick for narration takes, for lines the user rejected or that `pick.py` keeps getting wrong. It checks every take the way a listener rejects one, and writes the best three per line as `<id>-a/b/c.wav` with a `.webm` of each, ready for the user's approval.

What it checks:
- **Clipping at either end:** the raw take has to open and close in silence. Its mastering keeps soft consonants such as a final "s" or "ft".
- **Wrong or slurred words:** Whisper has to hear the script exactly, and every word, forced through Whisper's decoder, has to score above a floor.
- **Mispronunciation Whisper can't hear:** Whisper maps a misspoken word back to the word it expects. A line can give a `phonemes` pattern, and `phonemes.py` checks the take against it.
- **Flat, creaky or odd tone:** pitch movement has to sit in the line's own middle range, and enough of the speech has to be voiced.
- **A finished, sentence-final read:** a line can require its pitch to fall by `end_fall` semitones across the last word.

Run it on takes from `render.sh` (`<id>.take<n>.wav`):

```
python3 scripts/trailer/vo/screen.py --lines lines.json --takes <takes dir> --out <dir>
```

`lines.json` lists `{id, text}` per line, with these optional fields:

| Field | What it does |
|---|---|
| `check` | The words to hear, when `text` is a phonetic spelling fed to the voice, such as "Awto-mate". |
| `phonemes` | A regex over the take's IPA phonemes, for example `^(ɑː\|ɔː) (t\|ɾ)`. |
| `end_fall` | The pitch fall in semitones required across the last word, for example `7`. |
| `rank` | How passing takes are ordered: `weakest_word` (the default), `first_word` or `end_fall`. |

A short line that reads as mid-sentence can also be rendered inside a longer sentence as `ctx_<id>.take<n>.wav`. The screen then cuts the line out at a real pause.

`screen.json` records every take's measurements and why it passed or failed.

**Needs:**
- An NVIDIA GPU. It stops without CUDA; there's no CPU fallback.
- `ffmpeg`.
- Python 3 with `torch` (a CUDA build), `transformers`, `huggingface_hub`, `librosa`, `soundfile` and `numpy`.
- The `openai/whisper-large-v3` model, which it fetches from the Hugging Face hub on first use. Set `HF_HUB_OFFLINE=1` once the model is cached.
- A `phonemes` pattern also needs [phonemes.py](trailer-vo-phonemes.md).

No pitch or tempo processing.
