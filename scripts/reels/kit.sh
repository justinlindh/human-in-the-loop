#!/usr/bin/env bash
# The reel effects kit: named presets a reel script sources and calls. docs/reels.md says when to
# use each one. Camera moves (push-in, pull-out, pan) happen in the render, through a capture item's
# `camera` keyframes; push_in_2d is the fallback for a flat frame only.
#
#   source scripts/reels/kit.sh
#   kit_title   <out.mp4> <title> [subtitle] [seconds=2.5]           a title card on cream, a small logo above
#   kit_end     <out.mp4> [url] [seconds=3]                          the end card: the logo and the site
#   kit_lower   <in> <out> <text> [start=0.3] [seconds=2.6]          a lower-third caption
#   kit_label   <in> <out> <text>                                    a corner label for a whole clip (an era); KIT_LABEL_SCALE=26 for a smaller one
#   kit_trim    <in> <out> <from> <seconds> [crop w:h:x:y]           cut a beat, optionally cropped
#   kit_cut     <out> <clip>...                                      hard cuts, in order
#   kit_xfade   <out> <seconds> <clip>...                            crossfades (picture and sound)
#   kit_ramp    <in> <out> <at> <factor>                             from at, play at factor speed (0.5 to 1: a payoff in slow motion)
#   kit_vignette <in> <out> [strength=0.35]                          a subtle focus vignette
#   kit_push_in_2d <in> <out> [zoom=1.12]                            a 2D push-in over the whole clip
#
# Clips are 1280x720 at 30 fps (KIT_W, KIT_H, KIT_FPS), H.264 through NVENC when the machine has
# it, else libx264 (KIT_ENC picks one), with AAC. Every ffmpeg call runs under timeout and nice.
# Functions return ffmpeg's status.

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_W=${KIT_W:-1280} KIT_H=${KIT_H:-720} KIT_FPS=${KIT_FPS:-30}
# The GPU encoder when it works on this machine (a one-frame test encode), else libx264; KIT_ENC
# overrides either way.
if [ -z "${KIT_ENC:-}" ]; then
  if timeout 20 ffmpeg -nostdin -hide_banner -loglevel error -f lavfi -i color=c=black:s=256x256:d=0.1 -frames:v 1 -c:v h264_nvenc -f null - 2>/dev/null; then KIT_ENC=h264_nvenc; else KIT_ENC=libx264; fi
fi
# Fredoka's static weights are instanced from the variable Fredoka (Google Fonts) with fontTools.
KIT_TITLE_FONT="$KIT_DIR/fonts/Fredoka-Bold.ttf"
KIT_BODY_FONT="$KIT_DIR/fonts/Fredoka-SemiBold.ttf"
KIT_MONO_FONT="$KIT_DIR/fonts/JetBrainsMono-Bold.ttf"
# The game's interface palette (src/ui/styles/01-base.css).
KIT_INK=0x2a2630 KIT_INK_SOFT=0x5b5361 KIT_CREAM=0xfbf5ea
# The one accent (src/render/palette.js marker_orange): a site URL or one highlighted word.
KIT_ACCENT=0xe08a3c

_kit_ff() { timeout 600 nice -n 10 ffmpeg -nostdin -hide_banner -loglevel error -y "$@"; }
_kit_venc() { if [ "$KIT_ENC" = h264_nvenc ]; then echo -c:v h264_nvenc -preset p5 -cq 20 -pix_fmt yuv420p; else echo -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p; fi; }
_kit_aenc() { echo -c:a aac -b:a 160k -ar 48000 -ac 2; }
# drawtext reads text from a file, so quotes and colons in a line need no escaping.
_kit_txt() { local f; f="$(mktemp --suffix=.txt)"; printf '%s' "$1" > "$f"; echo "$f"; }
_kit_dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# kit_title and kit_end draw on cream with the game's logo (scripts/reels/logo.png, from the site's
# img/logo.png): small above a title, larger as the end card, where it names the game.
KIT_LOGO="$KIT_DIR/logo.png"
_kit_card() {
  local out="$1" secs="$2" logo_w="$3" logo_y="$4" draw="$5"
  _kit_ff -f lavfi -i "color=c=${KIT_CREAM}:s=${KIT_W}x${KIT_H}:r=${KIT_FPS}:d=${secs}" -i "$KIT_LOGO" -f lavfi -i "anullsrc=r=48000:cl=stereo" \
    -filter_complex "[0:v]format=rgb24[b];[1:v]scale=${logo_w}:-1:flags=lanczos,format=rgba[l];[b][l]overlay=format=rgb:x=(W-w)/2:y=${logo_y}${draw:+,${draw}},fade=t=in:st=0:d=0.3,fade=t=out:st=$(awk -v d="$secs" 'BEGIN{print d-0.3}'):d=0.3[v]" \
    -map "[v]" -map 2:a -t "$secs" $(_kit_venc) $(_kit_aenc) "$out"
}

kit_title() {
  local out="$1" title="$2" sub="${3:-}" secs="${4:-2.5}" t s
  t="$(_kit_txt "$title")"; s="$(_kit_txt "$sub")"
  _kit_card "$out" "$secs" $((KIT_W / 6)) $((KIT_H / 7)) "drawtext=fontfile=${KIT_TITLE_FONT}:textfile=${t}:fontsize=$((KIT_H / 10)):fontcolor=${KIT_INK}:x=(w-text_w)/2:y=(h-text_h)/2+$((KIT_H / 30)),drawtext=fontfile=${KIT_BODY_FONT}:textfile=${s}:fontsize=$((KIT_H / 26)):fontcolor=${KIT_INK_SOFT}:x=(w-text_w)/2:y=(h/2)+$((KIT_H / 8))"
  local r=$?; rm -f "$t" "$s"; return $r
}

kit_end() {
  local out="$1" url="${2:-humanintheloopgame.com}" secs="${3:-3}" u
  u="$(_kit_txt "$url")"
  _kit_card "$out" "$secs" $((KIT_W * 2 / 5)) $((KIT_H / 4)) "drawtext=fontfile=${KIT_BODY_FONT}:textfile=${u}:fontsize=$((KIT_H / 22)):fontcolor=${KIT_ACCENT}:x=(w-text_w)/2:y=$((KIT_H * 7 / 10))"
  local r=$?; rm -f "$u"; return $r
}

kit_lower() {
  local in="$1" out="$2" text="$3" st="${4:-0.3}" secs="${5:-2.6}" t en
  t="$(_kit_txt "$text")"; en=$(awk -v a="$st" -v b="$secs" 'BEGIN{print a+b}')
  _kit_ff -i "$in" -vf "drawtext=fontfile=${KIT_TITLE_FONT}:textfile=${t}:fontsize=$((KIT_H / 16)):fontcolor=${KIT_CREAM}:box=1:boxcolor=${KIT_INK}@0.82:boxborderw=$((KIT_H / 40)):x=$((KIT_W / 20)):y=h-text_h-$((KIT_H / 9)):enable='between(t,${st},${en})':alpha='if(lt(t,${st}+0.25),(t-${st})/0.25,if(gt(t,${en}-0.25),(${en}-t)/0.25,1))'" \
    $(_kit_venc) -c:a copy "$out"
  local r=$?; rm -f "$t"; return $r
}

kit_label() {
  local in="$1" out="$2" text="$3" t
  t="$(_kit_txt "$text")"
  _kit_ff -i "$in" -vf "drawtext=fontfile=${KIT_TITLE_FONT}:textfile=${t}:fontsize=$((KIT_H / ${KIT_LABEL_SCALE:-18})):fontcolor=${KIT_CREAM}:box=1:boxcolor=${KIT_INK}@0.82:boxborderw=$((KIT_H / 48)):x=$((KIT_W / 24)):y=$((KIT_H / 18))" \
    $(_kit_venc) -c:a copy "$out"
  local r=$?; rm -f "$t"; return $r
}

kit_trim() {
  local in="$1" out="$2" from="$3" secs="$4" crop="${5:-}" vf
  vf="${crop:+crop=${crop},}scale=${KIT_W}:${KIT_H}:flags=lanczos,fps=${KIT_FPS}"
  if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$in" | grep -q .; then
    _kit_ff -ss "$from" -t "$secs" -i "$in" -vf "$vf" $(_kit_venc) $(_kit_aenc) "$out"
  else
    _kit_ff -ss "$from" -t "$secs" -i "$in" -f lavfi -i "anullsrc=r=48000:cl=stereo" -vf "$vf" -map 0:v -map 1:a -shortest $(_kit_venc) $(_kit_aenc) "$out"
  fi
}

kit_cut() {
  local out="$1"; shift
  local list; list="$(mktemp --suffix=.txt)"
  for c in "$@"; do echo "file '$(realpath "$c")'" >> "$list"; done
  _kit_ff -f concat -safe 0 -i "$list" $(_kit_venc) $(_kit_aenc) "$out"
  local r=$?; rm -f "$list"; return $r
}

kit_xfade() {
  local out="$1" fd="$2"; shift 2
  local inputs=() fc="" off=0 prev="0:v" aprev="0:a" i=0 d
  for c in "$@"; do inputs+=(-i "$c"); done
  for c in "$@"; do
    d=$(_kit_dur "$c")
    if [ $i -gt 0 ]; then
      fc+="[${prev}][${i}:v]xfade=transition=fade:duration=${fd}:offset=${off}[v${i}];[${aprev}][${i}:a]acrossfade=d=${fd}[a${i}];"
      prev="v${i}"; aprev="a${i}"
    fi
    off=$(awk -v o="$off" -v d="$d" -v f="$fd" 'BEGIN{print o+d-f}')
    i=$((i + 1))
  done
  [ $i -gt 1 ] || { cp "$1" "$out"; return; }
  _kit_ff "${inputs[@]}" -filter_complex "${fc%;}" -map "[${prev}]" -map "[${aprev}]" $(_kit_venc) $(_kit_aenc) "$out"
}

kit_ramp() {
  local in="$1" out="$2" at="$3" f="$4" a b
  awk -v f="$f" 'BEGIN{exit !(f >= 0.5 && f <= 1)}' || { echo "kit_ramp: factor $f outside 0.5 to 1 (docs/reels.md)" >&2; return 2; }
  a="$(mktemp --suffix=.mp4)"; b="$(mktemp --suffix=.mp4)"
  _kit_ff -i "$in" -t "$at" $(_kit_venc) $(_kit_aenc) "$a" \
  && _kit_ff -ss "$at" -i "$in" -vf "setpts=PTS/${f},fps=${KIT_FPS}" -af "atempo=${f}" $(_kit_venc) $(_kit_aenc) "$b" \
  && kit_cut "$out" "$a" "$b"
  local r=$?; rm -f "$a" "$b"; return $r
}

kit_vignette() {
  local in="$1" out="$2" k="${3:-0.35}"
  _kit_ff -i "$in" -vf "vignette=angle=PI/5*${k}/0.35" $(_kit_venc) -c:a copy "$out"
}

kit_push_in_2d() {
  local in="$1" out="$2" z="${3:-1.12}" n
  n=$(awk -v d="$(_kit_dur "$in")" -v f="$KIT_FPS" 'BEGIN{printf "%d", d*f}')
  _kit_ff -i "$in" -vf "scale=$((KIT_W * 2)):$((KIT_H * 2)),zoompan=z='1+(${z}-1)*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${KIT_W}x${KIT_H}:fps=${KIT_FPS}" $(_kit_venc) -c:a copy "$out"
}
