#!/usr/bin/env bash
# The Office Space nods reel (#383), from the capture group 'nods':
#
#   npm run capture -- --group nods --out shots/nods --size 1920x1080 --fps 30 --audio --no-webm
#   scripts/nods-reel.sh shots/nods shots/nods-reel.mp4 [font.ttf]
#
# The beats play in the manifest's order, each from its own indexed moment (so from different
# companies and weeks). Each is trimmed to start once its decision is up, cropped to a 1280x720
# window around the action and the decision card (a 1.5x zoom on a 1920x1080 capture; a smaller
# capture is used whole), titled for its first seconds, and faded. The sound is the game's own,
# the printer's music cue and the ducked soundtrack included.
set -euo pipefail
IN=${1:?captures dir}; OUT=${2:?output mp4}
FONT=${3:-$(fc-match -f '%{file}' 'Fredoka:bold' 2>/dev/null || true)}
[ -f "$FONT" ] || FONT=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
# id|title|seconds to trim from the start (the week before the decision is raised)
BEATS=(
  "nods-printer|PC LOAD LETTER|1.2"
  "nods-stapler|The red stapler|1.5"
  "nods-cover-sheets|The TPS report cover sheets|1.5"
  "nods-consultants|The consultants|2"
  "nods-banner|Is this good for the company?|1.2"
)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
LIST="$TMP/list.txt"; : > "$LIST"
i=0
for b in "${BEATS[@]}"; do
  IFS='|' read -r id title trim <<< "$b"
  src="$IN/$id.mp4"; [ -f "$src" ] || { echo "nods-reel: missing $src" >&2; exit 1; }
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$src")
  len=$(awk -v d="$dur" -v t="$trim" 'BEGIN { printf "%.3f", d - t }')
  fo=$(awk -v d="$len" 'BEGIN { printf "%.3f", d - 0.25 }')
  crop=""; [ "$w" -ge 1920 ] && crop="crop=1280:720:640:140,"
  printf '%s' "$title" > "$TMP/title$i.txt"
  vf="${crop}fade=t=in:st=0:d=0.25,fade=t=out:st=$fo:d=0.25,drawtext=fontfile=$FONT:textfile=$TMP/title$i.txt:fontsize=44:fontcolor=0xfbf5ea:box=1:boxcolor=0x2a2630@0.78:boxborderw=18:x=(w-text_w)/2:y=h*0.84:enable='between(t,0.3,2.9)':alpha='if(lt(t,0.6),(t-0.3)/0.3,if(gt(t,2.6),(2.9-t)/0.3,1))'"
  timeout 300 nice -n 10 ffmpeg -y -loglevel error -ss "$trim" -i "$src" -t "$len" -vf "$vf" -af "afade=t=in:st=0:d=0.25,afade=t=out:st=$fo:d=0.25" -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -c:a aac -ar 48000 -ac 2 -b:a 160k "$TMP/b$i.mp4"
  echo "file '$TMP/b$i.mp4'" >> "$LIST"
  i=$((i + 1))
done
timeout 300 nice -n 10 ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy "$OUT"
echo "nods-reel: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT") s -> $OUT"
