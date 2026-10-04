#!/usr/bin/env bash
# Joins the printer homage shots (homage-00 .. homage-19 from manifest.js) in order into one cut at their
# real lengths. Usage: cut.sh <capture dir> <out.mp4> [audio file]
# With an audio file (the sound bed) it is laid under the picture and the cut ends with the shorter of the two.
set -euo pipefail
dir="${1:?usage: cut.sh <capture dir> <out.mp4> [audio]}"; out="${2:?usage: cut.sh <capture dir> <out.mp4> [audio]}"; audio="${3:-}"
list="$(mktemp -p "${TMPDIR:-$HOME/.cache/hitl-ci/tmp}")"
for i in $(seq -w 0 19); do
  f="$dir/homage-$i.mp4"
  [ -f "$f" ] || { echo "cut: missing $f" >&2; rm -f "$list"; exit 1; }
  echo "file '$(realpath "$f")'" >>"$list"
done
args=(-loglevel error -y -f concat -safe 0 -i "$list")
[ -n "$audio" ] && args+=(-i "$audio" -map 0:v -map 1:a -shortest)
nice -n 10 timeout 600 ffmpeg "${args[@]}" -vf "scale=1280:-2,fps=30" -c:v libx264 -crf 22 -preset medium -pix_fmt yuv420p ${audio:+-c:a aac -b:a 160k} -movflags +faststart "$out"
rm -f "$list"
echo "cut: wrote $out"
