---
tool: `scripts/trailer/vo/phonemes.py`
section: run
who: audio
covers: scripts/trailer/vo/phonemes.py
---
Prints the IPA phonemes a narration take actually says, one line per file. Use it when a word sounds wrong but Whisper transcribes it correctly. Whisper maps a mispronounced word back to the word it expects: "Automate" said as "ow too mate" still comes out as "Automate", while the phonemes show `aʊ t uː` in place of `ɑː ɾ ə`. [screen.py](trailer-vo-screen.md) uses it for any line with a `phonemes` pattern.

```
python3 scripts/trailer/vo/phonemes.py <wav>...
```

**Needs:**
- An NVIDIA GPU. It stops without CUDA; there's no CPU fallback.
- Python 3 with `torch` (a CUDA build), `transformers`, `huggingface_hub`, `librosa` and `soundfile`.
- The `facebook/wav2vec2-lv-60-espeak-cv-ft` model (Apache-2.0), which it fetches from the Hugging Face hub on first use.

It decodes the model's output against the model's own vocabulary, so the `phonemizer` package and espeak aren't needed.
