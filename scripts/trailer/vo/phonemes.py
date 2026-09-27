"""IPA phoneme transcription of narration takes, on the GPU only.

    python3 scripts/trailer/vo/phonemes.py <wav>...

Prints each file's phonemes as the model hears them, one line per file. Whisper maps a mispronounced word back
to the word it expects, so "Automate" said as "ow too mate" still transcribes as "Automate"; the phonemes show
the difference (/aʊ t uː/ against /ɑː ɾ ə/). screen.py uses this for lines that list a `phonemes` pattern.

Model: facebook/wav2vec2-lv-60-espeak-cv-ft (Apache-2.0), fetched from the Hugging Face hub on first use.
The CTC output is decoded against the model's own vocabulary, so the phonemizer package isn't needed.
"""
import json
import os
import sys

MODEL = "facebook/wav2vec2-lv-60-espeak-cv-ft"
_state = {}


def require_cuda():
    import torch
    if not torch.cuda.is_available():
        sys.exit("trailer-vo: GPU required, torch sees no CUDA device. Stopping; no CPU fallback.")


def _load():
    if not _state:
        require_cuda()
        from huggingface_hub import snapshot_download
        from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        path = snapshot_download(MODEL)
        _state["fe"] = Wav2Vec2FeatureExtractor.from_pretrained(path)
        _state["model"] = Wav2Vec2ForCTC.from_pretrained(path).to("cuda:0").eval()
        _state["vocab"] = {v: k for k, v in json.load(open(os.path.join(path, "vocab.json"))).items()}
    return _state


def phonemes_of(y, sr):
    """Space-separated IPA phonemes for mono audio y at sample rate sr."""
    import librosa
    import torch
    s = _load()
    y16 = librosa.resample(y, orig_sr=sr, target_sr=16000) if sr != 16000 else y
    with torch.no_grad():
        ids = s["model"](s["fe"](y16, sampling_rate=16000, return_tensors="pt").input_values.to("cuda:0")).logits.argmax(-1)[0].tolist()
    out, prev = [], None
    for i in ids:  # greedy CTC: collapse repeats, drop blanks and specials
        if i != prev and s["vocab"][i] not in ("<pad>", "<s>", "</s>", "<unk>"):
            out.append(s["vocab"][i])
        prev = i
    return " ".join(out)


def phonemes(path):
    import soundfile as sf
    y, sr = sf.read(path, dtype="float32")
    return phonemes_of(y if y.ndim == 1 else y.mean(1), sr)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        print(f"{os.path.basename(p)} | {phonemes(p)}")
