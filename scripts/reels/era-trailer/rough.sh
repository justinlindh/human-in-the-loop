#!/usr/bin/env bash
# Silent cut of the era segment at the main trailer's size: one hard cut per beat of config.js, cropped onto the
# window or card, each with a caption strip made by the trailer's own caption renderer (captions.mjs), placed
# and faded the way build.js places its captions. Usage: rough.sh <capture dir> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/../../.."
export KIT_W=1920 KIT_H=1080
. scripts/reels/kit.sh
dir="${1:-shots/era-seg}"; out="${2:-shots/era-seg/segment.mp4}"
w="$(mktemp -d)"
timeout 300 nice -n 10 node scripts/reels/era-trailer/captions.mjs "$w" > /dev/null
cap() { # in out id dur: the strip fades in at 0.2 s and out ending 0.2 s before the cut, as build.js's do
  _kit_ff -i "$1" -loop 1 -framerate "$KIT_FPS" -t "$4" -i "$w/cap-$3.png" \
    -filter_complex "[1:v]format=rgba,fade=t=in:st=0.2:d=0.15:alpha=1,fade=t=out:st=$(awk -v d="$4" 'BEGIN { print d - 0.35 }'):d=0.15:alpha=1[c];[0:v][c]overlay=0:H-216:shortest=1[v]" \
    -map '[v]' -map 0:a $(_kit_venc) -c:a copy "$2"
}
beat() { # id from dur crop
  kit_trim "$dir/trailer-$1.mp4" "$w/$1.raw.mp4" "$2" "$3" "$4" || return
  # The Y2K beat's own game caption (the date and clock) sits where the strip would, and says the era.
  if [ "$1" = y2k ]; then mv "$w/$1.raw.mp4" "$w/$1.mp4"; else cap "$w/$1.raw.mp4" "$w/$1.mp4" "$1" "$3"; fi
}
beat inventory 1.5 3.0 "iw*0.8:ih*0.8:iw*0.1:ih*0.0"
beat float 7.0 3.0 "iw*0.7:ih*0.7:iw*0.3:ih*0.1"
beat y2k 12.7 4.0 "iw*0.8:ih*0.8:iw*0.1:ih*0.2"
beat ie6 2.0 3.0 "iw*0.8:ih*0.8:iw*0.1:ih*0.0"
beat ai 8.1 3.4 "iw*0.8:ih*0.8:iw*0.2:ih*0.15"
kit_cut "$out" "$w"/inventory.mp4 "$w"/float.mp4 "$w"/y2k.mp4 "$w"/ie6.mp4 "$w"/ai.mp4
rm -rf "$w"
