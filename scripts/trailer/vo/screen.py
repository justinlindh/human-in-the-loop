"""Screens narration takes the way a listener rejects them and writes the best three per line, on the GPU only.

    python3 scripts/trailer/vo/screen.py --lines <lines.json> --takes <takes dir> --out <dir>

Takes are <takes>/<id>.take<n>.wav (render.sh names them so). A short line can also be rendered inside a longer
sentence as <takes>/ctx_<id>.take<n>.wav; the line's words are cut out at a real pause before its first word.

Each take is checked for:
  - clipping at either end: the raw take opens and closes in silence (its first and last 15 ms below -50 dB of
    its peak). Mastering keeps soft consonants: bounds at -55 dB of peak, 60 ms before the first sound and
    120 ms after the last, then short fades and a 0.2 s tail.
  - wrong or slurred words: Whisper hears the script exactly, and each script word, forced through Whisper's
    decoder, scores above a log-probability floor. Casing and punctuation never count against a word.
  - mispronunciation Whisper can't hear: a line may give a `phonemes` regex that the take's IPA phonemes must
    match (phonemes.py), for example "^(ɑː|ɔː)" to require "aw" and not "ow" at the start of "Automate".
  - flat or odd tone: the pitch movement sits in the line's own middle range (not its flattest or wildest
    takes), and enough of the speech is voiced, which rejects creaky or breathy reads.
  - a sentence-final read: a line may give `end_fall`, the fall in semitones its pitch must make across the
    last word, so it sounds finished rather than mid-sentence.

lines.json is a list of {id, text} with optional fields:
  check     the words to hear, when the take was rendered from a phonetic spelling in `text`
  phonemes  regex over the take's space-separated IPA phonemes
  end_fall  minimum pitch fall in semitones over the last word
  rank      how to order passing takes: "weakest_word" (default), "first_word" or "end_fall"
Writes <out>/<id>-a.wav, -b, -c (48 kHz mono, -18 LUFS, peaks limited to -1.5 dBFS) with a .webm of each, and
<out>/screen.json with every take's measurements and why it passed or failed. No pitch or tempo processing.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

SR = 48000
WHISPER = "openai/whisper-large-v3"
WORD_FLOOR = -2.5
VOICED_MIN = 0.35


def require_cuda():
    import torch
    if not torch.cuda.is_available():
        sys.exit("trailer-vo: GPU required, torch sees no CUDA device. Stopping; no CPU fallback.")


def words(text):
    return re.sub(r"[^a-z0-9' ]+", " ", text.lower()).split()


def same_words(a, b):
    """Compares word sequences with spacing ignored, so "busy work" matches "busywork"."""
    return "".join(words(a)) == "".join(words(b))


class Ears:
    def __init__(self):
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor, pipeline
        self.torch = torch
        self.proc = WhisperProcessor.from_pretrained(WHISPER)
        self.model = WhisperForConditionalGeneration.from_pretrained(WHISPER, dtype=torch.float16).to("cuda:0").eval()
        self.asr = pipeline("automatic-speech-recognition", model=self.model, tokenizer=self.proc.tokenizer,
                            feature_extractor=self.proc.feature_extractor, dtype=torch.float16, device="cuda:0")

    def hear(self, y16, word_times=False):
        kw = {"return_timestamps": "word"} if word_times else {}
        return self.asr(y16, generate_kwargs={"language": "english"}, **kw)

    def _forced(self, feats, text):
        tok = self.proc.tokenizer
        prefix = tok.convert_tokens_to_ids(["<|startoftranscript|>", "<|en|>", "<|transcribe|>", "<|notimestamps|>"])
        ids = tok(" " + text, add_special_tokens=False).input_ids
        dec = self.torch.tensor([prefix + ids], device="cuda:0")
        with self.torch.no_grad():
            lp = self.torch.log_softmax(self.model(input_features=feats, decoder_input_ids=dec).logits.float(), -1)[0]
        out, cur, acc = [], "", 0.0
        for i, t in enumerate(ids):  # a word's score sums its alphabetic tokens; punctuation tokens don't count
            piece = tok.decode([t])
            if piece.startswith(" ") and cur:
                out.append((cur, acc))
                cur, acc = "", 0.0
            cur += piece
            if re.search(r"[A-Za-z0-9]", piece):
                acc += float(lp[len(prefix) - 1 + i, t])
        out.append((cur, acc))
        return [(w.strip(), a) for w, a in out if re.search(r"[A-Za-z0-9]", w)]

    def word_scores(self, y16, text):
        """Each word's log-probability, best over the script as written, without punctuation, and in title case."""
        feats = self.proc(y16, sampling_rate=16000, return_tensors="pt").input_features.to("cuda:0", self.torch.float16)
        plain = re.sub(r"[^A-Za-z0-9' ]+", "", text)
        variants = [text, plain[:1] + plain[1:].lower(), " ".join(w[:1].upper() + w[1:] for w in plain.split())]
        runs = [self._forced(feats, v) for v in variants]
        n = min(len(r) for r in runs)
        return [(runs[0][k][0], max(r[k][1] for r in runs)) for k in range(n)]


def edges_db(y):
    import numpy as np
    pk = np.abs(y).max() + 1e-9
    n = int(0.015 * SR)
    return [float(20 * np.log10(np.sqrt(np.mean(s ** 2)) / pk + 1e-9)) for s in (y[:n], y[-n:])]


def trim(y):
    """Speech bounds that keep soft consonants, short fades, a 0.2 s tail. Returns (audio, speech seconds)."""
    import numpy as np
    hop = int(0.005 * SR)
    rms = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)]) + 1e-9
    on = np.where(20 * np.log10(rms / rms.max()) > -55)[0]
    a = max(0, on[0] * hop - int(0.06 * SR))
    b = min(len(y), (on[-1] + 1) * hop + int(0.12 * SR))
    z = y[a:b].copy()
    fi, fo = int(0.01 * SR), int(0.04 * SR)
    z[:fi] *= np.linspace(0, 1, fi)
    z[-fo:] *= np.linspace(1, 0, fo)
    return np.concatenate([z, np.zeros(int(0.2 * SR))]).astype(np.float32), (on[-1] - on[0]) * hop / SR


def cut_from_context(ears, y, text):
    """The line's words out of an in-context take: the quietest 10 ms within 0.25 s of Whisper's boundary before
    the line's first word, used only where it is a real pause (below -40 dB of peak)."""
    import librosa
    import numpy as np
    chunks = ears.hear(librosa.resample(y, orig_sr=SR, target_sr=16000), word_times=True)["chunks"]
    first = words(text)[0]
    idx = [i for i, c in enumerate(chunks) if i > 0 and words(c["text"])[:1] == [first]]
    if not idx or chunks[idx[-1]]["timestamp"][0] is None:
        return None
    t = chunks[idx[-1]]["timestamp"][0]
    hop, pk = int(0.01 * SR), np.abs(y).max()
    lo, hi = max(0, int((t - 0.25) * SR)), min(len(y) - hop, int((t + 0.25) * SR))
    rms, j = min((np.sqrt(np.mean(y[k:k + hop] ** 2)), k) for k in range(lo, hi, hop // 2))
    return y[j:] if 20 * np.log10(rms / pk + 1e-9) <= -40 else None


def pitch(z, speech):
    """Voiced fraction, semitone spread, and the fall across the last word (peak of the final 40% of voiced
    frames' first half against their last five)."""
    import librosa
    import numpy as np
    f0, v, _ = librosa.pyin(z[:int((speech + 0.1) * SR)], fmin=60, fmax=300, sr=SR, frame_length=2048)
    voiced = float(v.mean())
    f0 = f0[v]
    spread = float(np.std(12 * np.log2(f0 / np.median(f0)))) if len(f0) > 10 else 0.0
    tail = f0[int(len(f0) * 0.6):] if len(f0) > 12 else f0
    fall = float(12 * np.log2(np.max(tail[:max(1, len(tail) // 2)]) / np.median(tail[-5:]))) if len(tail) >= 6 else 0.0
    return voiced, spread, fall


def ffmpeg(*argv):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *argv], check=True)


def write_master(z, dst):
    import soundfile as sf
    tmp = dst + ".tmp.wav"
    sf.write(tmp, z, SR)
    o = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", tmp, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    gain = -18.0 - float(o[o.rfind("Summary:"):].split("I:")[1].split("LUFS")[0])
    ffmpeg("-i", tmp, "-af", f"volume={gain:.2f}dB,alimiter=limit={10 ** (-1.5 / 20):.4f}:attack=2:release=50:level=false",
           "-ac", "1", "-c:a", "pcm_s16le", dst)
    os.remove(tmp)
    ffmpeg("-i", dst, "-c:a", "libopus", "-b:a", "96k", dst[:-4] + ".webm")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lines", required=True)
    ap.add_argument("--takes", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    require_cuda()
    import librosa
    import numpy as np
    import soundfile as sf
    os.makedirs(a.out, exist_ok=True)
    ears = Ears()
    report = {}
    for line in json.load(open(a.lines)):
        lid, script = line["id"], line.get("check", line["text"])
        pattern = re.compile(line["phonemes"]) if line.get("phonemes") else None
        if pattern:
            from phonemes import phonemes_of
        cands = []
        for p in sorted(glob.glob(os.path.join(a.takes, f"{lid}.take*.wav"))):
            cands.append((os.path.basename(p)[:-4], sf.read(p, dtype="float32")[0], False))
        for p in sorted(glob.glob(os.path.join(a.takes, f"ctx_{lid}.take*.wav"))):
            y = sf.read(p, dtype="float32")[0]
            c = cut_from_context(ears, y if y.ndim == 1 else y.mean(1), script)
            if c is not None:
                cands.append((os.path.basename(p)[:-4] + "_cut", c, True))
        rows = []
        for name, y, ctx in cands:
            y = y if y.ndim == 1 else y.mean(1)
            e0, e1 = edges_db(y)
            z, speech = trim(y)
            y16 = librosa.resample(z, orig_sr=SR, target_sr=16000)
            heard = ears.hear(y16)["text"].strip()
            ws = ears.word_scores(y16, script)
            weakest = min(ws, key=lambda w: w[1])
            voiced, spread, fall = pitch(z, speech)
            ph = phonemes_of(z, SR) if pattern else None
            rows.append({"take": name, "z": z, "speech": round(float(speech), 2), "heard": heard, "exact": same_words(heard, script),
                         "edge_db": [round(e0, 1), round(e1, 1)], "clip_start": e0 > -50 and not ctx, "clip_end": e1 > -50,
                         "weakest": weakest[0], "weakest_lp": round(weakest[1], 2), "first_lp": round(ws[0][1], 2),
                         "voiced": round(voiced, 2), "pitch_spread": round(spread, 2), "end_fall": round(fall, 2),
                         "phonemes": ph, "phonemes_ok": bool(pattern.search(ph)) if pattern else True})
        if not rows:
            print(f"trailer-vo: {lid}: no takes in {a.takes}", flush=True)
            continue
        sp = np.array([r["pitch_spread"] for r in rows])
        lo, hi = np.percentile(sp, 20), np.percentile(sp, 90)
        for r in rows:
            r["tone_ok"] = bool(lo <= r["pitch_spread"] <= hi and r["voiced"] >= VOICED_MIN)
            r["fall_ok"] = r["end_fall"] >= line.get("end_fall", -99)
            r["why"] = [k for k, bad in (("words", not r["exact"]), ("clip-start", r["clip_start"]), ("clip-end", r["clip_end"]),
                                         ("weak-word", r["weakest_lp"] <= WORD_FLOOR), ("phonemes", not r["phonemes_ok"]),
                                         ("tone", not r["tone_ok"]), ("no-fall", not r["fall_ok"])) if bad]
        rank = {"first_word": lambda r: -r["first_lp"], "end_fall": lambda r: -r["end_fall"]}.get(line.get("rank"), lambda r: -r["weakest_lp"])
        ok = sorted([r for r in rows if not r["why"]], key=rank)
        for tag, r in zip("abc", ok):
            r["file"] = f"{lid}-{tag}.wav"
            write_master(r["z"], os.path.join(a.out, r["file"]))
        for r in rows:
            print(f"trailer-vo:   {r['take']:22s} {r['speech']:.2f}s  voiced {r['voiced']:.2f}  spread {r['pitch_spread']:.2f}  fall {r['end_fall']:.1f}  "
                  f"weakest {r['weakest']} {r['weakest_lp']:.2f}  heard {r['heard']!r}  " + (f"-> {r['file']}" if r.get("file") else "pass" if not r["why"] else "fail: " + ",".join(r["why"])))
        print(f"trailer-vo: {lid}: {len(ok)}/{len(rows)} pass", flush=True)
        report[lid] = [{k: v for k, v in r.items() if k != "z"} for r in rows]
    json.dump(report, open(os.path.join(a.out, "screen.json"), "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
