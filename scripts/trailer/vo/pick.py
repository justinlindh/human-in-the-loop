"""Picks the best take of each narration line and masters it for the trailer, on the GPU only.

    HF_HUB_OFFLINE=1 /opt/miniforge/bin/python3 scripts/trailer/vo/pick.py --lines <takes>/lines.json \
        --takes <takes dir> --out <vo dir> [--lufs -18] [--take l1=2,l3=0]

Every take is transcribed with Whisper large-v3; the take whose words match the script best wins,
and among equals the shorter one. --take forces a take by hand. The winner is loudness-normalized
(its only processing) and written as <out>/<line id>.wav (48 kHz mono), with
picks.json recording what was chosen and why. Also writes <out>/sample.wav: the lines back to back,
for auditioning the voice. No pitch processing.
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
        for t in takes:
            heard = asr(t, generate_kwargs={"language": "english"})["text"].strip()
            scored.append({"take": os.path.basename(t), "wer": round(wer(line["text"], heard), 3), "seconds": round(duration(t), 2), "heard": heard})
        n = forced.get(line["id"])
        best = next(s for s in scored if s["take"].endswith(f".take{n}.wav")) if n is not None else min(scored, key=lambda s: (s["wer"], s["seconds"]))
        src = os.path.join(a.takes, best["take"])
        dst = os.path.join(a.out, f"{line['id']}.wav")
        ffmpeg("-i", src, "-af", f"loudnorm=I={a.lufs}:TP=-1.5,aresample=48000", "-ac", "1", "-c:a", "pcm_s16le", dst)
        picks[line["id"]] = {"chosen": best["take"], "forced": n is not None, "seconds": round(duration(dst), 2), "takes": scored}
        print(f"trailer-vo: {line['id']} <- {best['take']} (wer {best['wer']}, {picks[line['id']]['seconds']}s) heard: {best['heard']}", flush=True)

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
