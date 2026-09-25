"""Picks the best take of each narration line and masters it for the trailer, on the GPU only.

    HF_HUB_OFFLINE=1 /opt/miniforge/bin/python3 scripts/trailer/vo/pick.py --lines <takes>/lines.json \
        --takes <takes dir> --out <vo dir> [--lufs -18] [--tail 0.2] [--take l1=2,l3=0]

Every take is transcribed with Whisper large-v3 (with word timings) and checked the way an ear would:
  - clipped: the take stops before its voice has decayed (its last 40 ms within 55 dB of its peak;
    clean takes fall to -70 dB or lower), or its last word ends less than 120 ms before the audio does;
  - truncated: the last word Whisper hears is not the script's last word;
  - halting: a pause of more than 0.6 s between words.
Clipped or truncated takes are rejected; among the rest the lowest word error wins, then the fewest
halting pauses, then the length closest to the median of the line's takes (not the shortest, which
favours rushed or cut takes). --take forces a take by hand.
Mastering: trim to 40 ms before the first sound and to the natural decay after the last, add --tail
seconds of silence so the line never stops dead, then one fixed gain to --lufs with a gentle peak
limit (no dynamic loudness processing). Written as <out>/<line id>.wav (48 kHz mono), with
picks.json recording every take's checks and why the winner won. Also writes <out>/sample.wav: the
lines back to back, for auditioning the voice. No pitch processing.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys



def require_cuda():
    """Transcription runs on the GPU or not at all."""
    import torch
    if not torch.cuda.is_available():
        sys.exit("trailer-vo: GPU required, torch sees no CUDA device. Stopping; no CPU fallback.")


def words(text):
    return re.sub(r"[^a-z0-9' ]+", " ", text.lower()).split()


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def lufs_of(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    summ = out[out.rfind("Summary:"):]
    return float(summ.split("I:")[1].split("LUFS")[0]), float(summ.split("Peak:")[1].split("dBFS")[0])


def ear_checks(path, heard_words, script_last):
    """Clipped end, missing last word, and halting pauses, from the audio and Whisper's word timings."""
    import numpy as np
    import soundfile as sf
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    y = y.mean(1)
    peak = float(np.abs(y).max()) + 1e-9
    tail = y[-int(0.04 * sr):]
    tail_db = 20 * np.log10(float(np.sqrt(np.mean(tail ** 2))) + 1e-9) - 20 * np.log10(peak)
    dur = len(y) / sr
    ends = [w["end"] for w in heard_words if w.get("end") is not None]
    last_end = ends[-1] if ends else dur
    starts = [w["start"] for w in heard_words]
    pauses = [b - a for a, b in zip(ends[:-1], starts[1:]) if a is not None and b is not None]
    last_heard = words(heard_words[-1]["text"])[-1] if heard_words and words(heard_words[-1]["text"]) else ""
    return {
        "clipped": bool(tail_db > -55 or dur - last_end < 0.12),
        "tail_db": round(float(tail_db), 1),
        "last_word_gap": round(dur - last_end, 3),
        "truncated": last_heard != script_last,
        "halting_pauses": sum(p > 0.6 for p in pauses),
    }


def master(src, dst, lufs, tail_s):
    """Trims to the speech (40 ms lead-in, natural decay kept), pads tail_s of silence, one fixed gain."""
    import numpy as np
    import soundfile as sf
    y, sr = sf.read(src, dtype="float32", always_2d=True)
    y = y.mean(1)
    hop = int(0.01 * sr)
    rms = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)]) + 1e-9
    db = 20 * np.log10(rms / rms.max())
    loud = np.where(db > -45)[0]
    a = max(0, loud[0] * hop - int(0.04 * sr))
    b = min(len(y), (loud[-1] + 1) * hop + int(0.03 * sr))
    y = np.concatenate([y[a:b], np.zeros(int(tail_s * sr), dtype="float32")])
    tmp = dst + ".tmp.wav"
    sf.write(tmp, y, sr)
    i, tp = lufs_of(tmp)
    gain = lufs - i
    ffmpeg("-i", tmp, "-af", f"volume={gain:.2f}dB,alimiter=limit={10 ** (-1.5 / 20):.4f}:attack=2:release=50:level=false,aresample=48000",
           "-ac", "1", "-c:a", "pcm_s16le", dst)
    os.remove(tmp)


def ffmpeg(*argv):
    subprocess.run(["timeout", "120", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *argv], check=True)


def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True).stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True)
    ap.add_argument("--takes", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--lufs", type=float, default=-18.0)
    ap.add_argument("--tail", type=float, default=0.2, help="seconds of silence after each line")
    ap.add_argument("--take", default="", help="force takes: l1=2,l3=0")
    a = ap.parse_args()
    forced = dict(kv.split("=") for kv in a.take.split(",") if kv)
    lines = json.load(open(a.lines))
    os.makedirs(a.out, exist_ok=True)

    require_cuda()
    import torch
    from transformers import pipeline
    snap = glob.glob(os.path.expanduser("~/.cache/huggingface/hub/models--openai--whisper-large-v3/snapshots/*/"))
    if not snap:
        sys.exit("trailer-vo: no local Whisper large-v3 snapshot")
    asr = pipeline("automatic-speech-recognition", model=snap[0], torch_dtype=torch.float16, device="cuda:0")
    if not all(p.is_cuda for p in asr.model.parameters()):
        sys.exit("trailer-vo: Whisper loaded off the GPU. Stopping.")

    picks = {}
    for line in lines:
        takes = sorted(glob.glob(os.path.join(a.takes, f"{line['id']}.take*.wav")))
        if not takes:
            sys.exit(f"trailer-vo: no takes for {line['id']} in {a.takes}")
        scored = []
        script_last = words(line["text"])[-1]
        for t in takes:
            r = asr(t, return_timestamps="word", generate_kwargs={"language": "english"})
            heard = r["text"].strip()
            ws = [{"text": c["text"], "start": c["timestamp"][0], "end": c["timestamp"][1]} for c in r.get("chunks", [])]
            scored.append({"take": os.path.basename(t), "wer": round(wer(line["text"], heard), 3), "seconds": round(duration(t), 2),
                           "heard": heard, **ear_checks(t, ws, script_last)})
        median = sorted(s["seconds"] for s in scored)[len(scored) // 2]
        usable = [s for s in scored if not s["clipped"] and not s["truncated"]] or scored
        n = forced.get(line["id"])
        best = next(s for s in scored if s["take"].endswith(f".take{n}.wav")) if n is not None else \
            min(usable, key=lambda s: (s["wer"], s["halting_pauses"], abs(s["seconds"] - median)))
        src = os.path.join(a.takes, best["take"])
        dst = os.path.join(a.out, f"{line['id']}.wav")
        master(src, dst, a.lufs, a.tail)
        picks[line["id"]] = {"chosen": best["take"], "forced": n is not None, "usable": sum(not x["clipped"] and not x["truncated"] for x in scored), "seconds": round(duration(dst), 2), "takes": scored}
        print(f"trailer-vo: {line['id']} <- {best['take']} (wer {best['wer']}, tail {best['tail_db']} dB, last-word gap {best['last_word_gap']}s, "
              f"pauses {best['halting_pauses']}, {picks[line['id']]['seconds']}s; {sum(not x['clipped'] and not x['truncated'] for x in scored)}/{len(scored)} usable) heard: {best['heard']}", flush=True)

    json.dump(picks, open(os.path.join(a.out, "picks.json"), "w"), indent=2)
    # The audition: every line in order with a short pause between.
    parts = []
    for line in lines:
        parts += ["-i", os.path.join(a.out, f"{line['id']}.wav")]
    n = len(lines)
    graph = "".join(f"[{i}:a]apad=pad_dur=0.5[p{i}];" for i in range(n)) + "".join(f"[p{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[out]"
    ffmpeg(*parts, "-filter_complex", graph, "-map", "[out]", os.path.join(a.out, "sample.wav"))


if __name__ == "__main__":
    main()
