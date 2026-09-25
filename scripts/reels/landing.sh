#!/usr/bin/env bash
# Cuts the landing page media (humanintheloopgame-site, #582) from a capture of the `landing` group:
#
#   npm run capture -- --group landing --out shots/landing/raw --no-webm
#   scripts/reels/landing.sh shots/landing/raw shots/landing/site
#
# Writes the site's own layout and names: img/<name>.webp stills, and for each loop
# media/loops/<name>.mp4 (H.264, muted, faststart), media/loops/<name>.webm (VP9) and its poster
# img/loops/<name>.webp. The CUTS table below sets each file's source, window, crop and size.
set -euo pipefail

RAW="${1:?usage: scripts/reels/landing.sh <capture dir> <out dir>}"
OUT="${2:?usage: scripts/reels/landing.sh <capture dir> <out dir>}"
FF=(timeout 600 nice -n 10 ffmpeg -nostdin -hide_banner -loglevel error -y)
mkdir -p "$OUT/img/loops" "$OUT/media/loops"

# kind name source start seconds crop(w:h:x:y of the 1920x1080 frame, or -) size fps
# still: source is a PNG and start is unused; loop: source is an MP4.
CUTS='
still hero           landing-hero-4.0s.png           0    0    -                1920x1080 0
loop  hero           landing-hero.mp4                0.5  14   -                1600x900  24
still hq-night       landing-hq-night-4.0s.png       0    0    -                1600x900  0
still floor          landing-floor-4.0s.png          0    0    -                1600x900  0
still garage         landing-garage-4.0s.png         0    0    -                1600x900  0
still launch         landing-launch-6.0s.png         0    0    -                1920x1080 0
still lockdown       landing-lockdown-10.0s.png      0    0    -                1920x1080 0
loop  era            landing-era.mp4                 4    6.1  -                1280x720  30
loop  incident       landing-incident.mp4            4    9.2  -                1280x720  30
loop  music          landing-music.mp4               18   4.2  1280:720:320:180 1280x720  30
loop  ransomware     landing-ransomware.mp4          5    4.2  1280:720:320:180 1280x720  30
loop  waffle         landing-waffle.mp4              16   4.2  1280:720:320:180 1280x720  30
loop  printer        landing-printer.mp4             15   6    1280:720:320:180 1280x720  30
loop  visitor        landing-visitor.mp4             4    6    1280:720:320:180 1280x720  30
still yak-post       landing-yak-post-18.0s.png      0    0    -                1600x900  0
still stapler        landing-stapler-8.5s.png        0    0    1280:720:320:180 1600x900  0
still cover-sheets   landing-cover-sheets-8.5s.png   0    0    1280:720:320:180 1600x900  0
still rival-sign     landing-rival-sign-13.0s.png    0    0    1280:720:320:180 1600x900  0
still cheque         landing-cheque-13.0s.png        0    0    1280:720:320:180 1600x900  0
still whiteboard     landing-whiteboard-5.0s.png     0    0    -                1600x900  0
'

vf() { local crop="$1" size="$2"; local s="scale=${size%x*}:${size#*x}:flags=lanczos"; [ "$crop" = - ] && echo "$s" || echo "crop=$crop,$s"; }

while read -r kind name src start secs crop size fps; do
  [ -n "${kind:-}" ] || continue
  [ -f "$RAW/$src" ] || { echo "landing: missing $RAW/$src" >&2; exit 1; }
  if [ "$kind" = still ]; then
    "${FF[@]}" -i "$RAW/$src" -vf "$(vf "$crop" "$size")" -c:v libwebp -quality 80 "$OUT/img/$name.webp"
    echo "landing: img/$name.webp $(stat -c %s "$OUT/img/$name.webp") bytes"
  else
    mp4="$OUT/media/loops/$name.mp4"
    "${FF[@]}" -ss "$start" -t "$secs" -i "$RAW/$src" -an -vf "$(vf "$crop" "$size"),fps=$fps" \
      -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart "$mp4"
    "${FF[@]}" -i "$mp4" -an -c:v libvpx-vp9 -row-mt 1 -crf 36 -b:v 0 -pix_fmt yuv420p "$OUT/media/loops/$name.webm"
    # The hero's poster is its own still; every other loop gets its first frame.
    [ "$name" = hero ] || "${FF[@]}" -i "$mp4" -frames:v 1 -c:v libwebp -quality 80 "$OUT/img/loops/$name.webp"
    echo "landing: media/loops/$name.mp4 $(stat -c %s "$mp4") bytes, .webm $(stat -c %s "$OUT/media/loops/$name.webm") bytes"
  fi
done <<<"$CUTS"
