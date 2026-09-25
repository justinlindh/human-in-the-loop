#!/usr/bin/env bash
# The growth timelapse for the landing page's eras section, from the growth-* items in
# scripts/feature-media/manifest.js:
#
#   node scripts/capture.js --manifest scripts/feature-media/manifest.js --only growth-garage,growth-floor,growth-floor-full,growth-hq,growth-late \
#     --out shots/growth --size 1920x1080 --fps 30 --audio --no-webm
#   scripts/reels/growth.sh shots/growth shots/growth-out
#
# Each stage is cut to its window, labelled with its era and headcount (the capture's headcount mark),
# and crossfaded into the next. Writes growth-desk.mp4 (1920x1080 with the game's sound) and the site's
# files: media/loops/growth.mp4 and .webm (1600x900, muted) and the poster img/loops/growth.webp.
set -euo pipefail
IN=${1:?captures dir}; OUT=${2:?output dir}
export KIT_W=1920 KIT_H=1080
source "$(dirname "$0")/kit.sh"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT/media/loops" "$OUT/img/loops"
# stage|from|seconds (the late HQ keeps its whole push-in)
STAGES=("garage|1|3.4" "floor|1|3.4" "floor-full|1|3.4" "hq|1|3.4" "late|1|4.8")
clips=()
for s in "${STAGES[@]}"; do
  IFS='|' read -r name from secs <<< "$s"
  label=$(node -e "const m=(require('$(realpath "$IN")/index.json').items['growth-$name'].marks||[]).find((x)=>x.label.startsWith('headcount ')); const [, n, , era] = m.label.split(' '); console.log(era + ' · ' + n + (n === '1' ? ' person' : ' people'))")
  kit_trim "$IN/growth-$name.mp4" "$TMP/$name.mp4" "$from" "$secs"
  kit_label "$TMP/$name.mp4" "$TMP/$name-l.mp4" "$label"
  clips+=("$TMP/$name-l.mp4")
  echo "growth: $name, $label"
done
kit_xfade "$OUT/growth-desk.mp4" 0.5 "${clips[@]}"
timeout 600 nice -n 10 ffmpeg -nostdin -loglevel error -y -i "$OUT/growth-desk.mp4" -an -vf scale=1600:900:flags=lanczos -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "$OUT/media/loops/growth.mp4"
timeout 600 nice -n 10 ffmpeg -nostdin -loglevel error -y -i "$OUT/media/loops/growth.mp4" -an -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 "$OUT/media/loops/growth.webm"
timeout 120 nice -n 10 ffmpeg -nostdin -loglevel error -y -i "$OUT/media/loops/growth.mp4" -frames:v 1 -quality 82 "$OUT/img/loops/growth.webp"
echo "growth: $(_kit_dur "$OUT/growth-desk.mp4") s -> $OUT"
