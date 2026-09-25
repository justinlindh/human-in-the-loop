#!/usr/bin/env bash
# The Office Space nods reel (#383), from the capture group 'nods':
#
#   npm run capture -- --group nods --out shots/nods --size 1280x720 --fps 30 --audio --no-webm
#   scripts/nods-reel.sh shots/nods shots/nods-reel.mp4 [font.ttf]
#
# The beats play in the order one company meets them. Each gets a title for its first seconds and
# a short fade; the printer beat gets its music cue (public/audio/moments/printer_smash.ogg), laid
# in where the moment starts (its hitl:moment start, marked in the capture's index.json).
set -euo pipefail
IN=${1:?captures dir}; OUT=${2:?output mp4}
FONT=${3:-$(fc-match -f '%{file}' 'Fredoka:bold' 2>/dev/null || true)}
[ -f "$FONT" ] || FONT=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CUE="$ROOT/public/audio/moments/printer_smash.ogg"
# Where the printer moment starts, from the mark its capture saved (hitl:moment start printer_jam).
PRINTER_CUE_AT=$(node -e "const i = require(process.argv[1]).items['nods-printer']; const m = (i.marks ?? []).find((x) => x.label === 'hitl:moment start printer_jam'); if (!m) { console.error('nods-reel: no printer_jam start mark in the capture index'); process.exit(1); } console.log(m.t)" "$(cd "$IN" && pwd)/index.json")
BEATS=(
  "nods-printer|PC LOAD LETTER"
  "nods-saturday|About Saturday"
  "nods-stapler|The red stapler"
  "nods-cover-sheets|The TPS report cover sheets"
  "nods-consultants|The consultants"
  "nods-banner|Is this good for the company?"
)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
LIST="$TMP/list.txt"; : > "$LIST"
i=0
for b in "${BEATS[@]}"; do
  id=${b%%|*}; title=${b#*|}
  src="$IN/$id.mp4"; [ -f "$src" ] || { echo "nods-reel: missing $src" >&2; exit 1; }
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  fo=$(awk -v d="$dur" 'BEGIN { printf "%.3f", d - 0.25 }')
  printf '%s' "$title" > "$TMP/title$i.txt"
  vf="fade=t=in:st=0:d=0.25,fade=t=out:st=$fo:d=0.25,drawtext=fontfile=$FONT:textfile=$TMP/title$i.txt:fontsize=44:fontcolor=0xfbf5ea:box=1:boxcolor=0x2a2630@0.78:boxborderw=18:x=(w-text_w)/2:y=h*0.80:enable='between(t,0.3,2.9)':alpha='if(lt(t,0.6),(t-0.3)/0.3,if(gt(t,2.6),(2.9-t)/0.3,1))'"
  if [ "$id" = nods-printer ]; then
    ms=$(awk -v s="$PRINTER_CUE_AT" 'BEGIN { printf "%d", s * 1000 }')
    af="[1:a]adelay=$ms|$ms,apad[m];[0:a][m]amix=inputs=2:duration=first:normalize=0,afade=t=in:st=0:d=0.25,afade=t=out:st=$fo:d=0.25[a]"
    timeout 300 nice -n 10 ffmpeg -y -loglevel error -i "$src" -i "$CUE" -filter_complex "[0:v]$vf[v];$af" -map '[v]' -map '[a]' -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -c:a aac -ar 48000 -ac 2 -b:a 160k "$TMP/b$i.mp4"
  else
    timeout 300 nice -n 10 ffmpeg -y -loglevel error -i "$src" -vf "$vf" -af "afade=t=in:st=0:d=0.25,afade=t=out:st=$fo:d=0.25" -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -c:a aac -ar 48000 -ac 2 -b:a 160k "$TMP/b$i.mp4"
  fi
  echo "file '$TMP/b$i.mp4'" >> "$LIST"
  i=$((i + 1))
done
timeout 300 nice -n 10 ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy "$OUT"
echo "nods-reel: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT") s -> $OUT"
