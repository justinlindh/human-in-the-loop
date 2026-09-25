#!/usr/bin/env bash
# The landing page's "Decisions you can see" loop: the novelty cheque, the pivot whiteboard and the
# first user test, about 3 s each with hard cuts, from a feature-media render kept raw:
#
#   npm run feature-media -- --only site-cheque,site-whiteboard,site-visitor --out shots/fm --keep-raw
#   scripts/reels/decisions.sh shots/fm/.raw shots/fm
#
# Each beat is cropped round its subject at native pixels (the cheque and board from the 4K
# recordings). Writes media/loops/decisions.mp4 and .webm (1280x720, muted) and the poster
# img/loops/decisions.webp under the output folder.
set -euo pipefail
RAW=${1:?raw dir}; OUT=${2:?output dir}
source "$(dirname "$0")/kit.sh"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT/media/loops" "$OUT/img/loops"
kit_trim "$RAW/3840x2160/site-cheque.mp4" "$TMP/1.mp4" 17 3 1440:810:1180:395
kit_trim "$RAW/3840x2160/site-whiteboard.mp4" "$TMP/2.mp4" 4.5 3 1440:810:1200:455
kit_trim "$RAW/1920x1080/site-visitor.mp4" "$TMP/3.mp4" 5 3.5 1280:720:260:100
kit_cut "$TMP/all.mp4" "$TMP/1.mp4" "$TMP/2.mp4" "$TMP/3.mp4"
FF=(timeout 600 nice -n 10 ffmpeg -nostdin -loglevel error -y)
"${FF[@]}" -i "$TMP/all.mp4" -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "$OUT/media/loops/decisions.mp4"
"${FF[@]}" -i "$OUT/media/loops/decisions.mp4" -an -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 "$OUT/media/loops/decisions.webm"
"${FF[@]}" -i "$OUT/media/loops/decisions.mp4" -frames:v 1 -quality 82 "$OUT/img/loops/decisions.webp"
echo "decisions: $(_kit_dur "$OUT/media/loops/decisions.mp4") s -> $OUT"
