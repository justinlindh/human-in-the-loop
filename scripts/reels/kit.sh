#!/usr/bin/env bash
# The reel effects kit: named presets a reel script sources and calls. docs/reels.md says when to
# use each one. Camera moves (push-in, pull-out, pan) happen in the render, through a capture item's
# `camera` keyframes; push_in_2d is the fallback for a flat frame only.
#
#   source scripts/reels/kit.sh
#   kit_title   <out.mp4> <title> [subtitle] [seconds=2.5]           a title card on cream
#   kit_end     <out.mp4> [line] [seconds=3]                         the end card: name and site
#   kit_lower   <in> <out> <text> [start=0.3] [seconds=2.6]          a lower-third caption
#   kit_label   <in> <out> <text>                                    a corner label for a whole clip (an era)
#   kit_trim    <in> <out> <from> <seconds> [crop w:h:x:y]           cut a beat, optionally cropped
#   kit_cut     <out> <clip>...                                      hard cuts, in order
#   kit_xfade   <out> <seconds> <clip>...                            crossfades (picture and sound)
#   kit_ramp    <in> <out> <at> <factor>                             from at, play at factor speed (0.5 to 1: a payoff in slow motion)
#   kit_vignette <in> <out> [strength=0.35]                          a subtle focus vignette
#   kit_push_in_2d <in> <out> [zoom=1.12]                            a 2D push-in over the whole clip
#
# Clips are 1280x720 at 30 fps (KIT_W, KIT_H, KIT_FPS), H.264 through NVENC (KIT_ENC=libx264 to
# use the CPU) with AAC. Every ffmpeg call runs under timeout and nice. Functions return ffmpeg's status.

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_W=${KIT_W:-1280} KIT_H=${KIT_H:-720} KIT_FPS=${KIT_FPS:-30}
KIT_ENC=${KIT_ENC:-h264_nvenc}
# Fredoka's static weights are instanced from the variable Fredoka (Google Fonts) with fontTools.
KIT_TITLE_FONT="$KIT_DIR/fonts/Fredoka-Bold.ttf"
KIT_BODY_FONT="$KIT_DIR/fonts/Fredoka-SemiBold.ttf"
KIT_MONO_FONT="$KIT_DIR/fonts/JetBrainsMono-Bold.ttf"
# The game's interface palette (src/ui/styles/01-base.css).
KIT_INK=0x2a2630 KIT_INK_SOFT=0x5b5361 KIT_CREAM=0xfbf5ea KIT_GOOD=0x25a877

_kit_ff() { timeout 600 nice -n 10 ffmpeg -nostdin -hide_banner -loglevel error -y "$@"; }
_kit_venc() { if [ "$KIT_ENC" = h264_nvenc ]; then echo -c:v h264_nvenc -preset p5 -cq 20 -pix_fmt yuv420p; else echo -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p; fi; }
_kit_aenc() { echo -c:a aac -b:a 160k -ar 48000 -ac 2; }
# drawtext reads text from a file, so quotes and colons in a line need no escaping.
_kit_txt() { local f; f="$(mktemp --suffix=.txt)"; printf '%s' "$1" > "$f"; echo "$f"; }
_kit_dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

kit_title() {
  local out="$1" title="$2" sub="${3:-}" secs="${4:-2.5}" t s
  t="$(_kit_txt "$title")"; s="$(_kit_txt "$sub")"
  _kit_ff -f lavfi -i "color=c=${KIT_CREAM}:s=${KIT_W}x${KIT_H}:r=${KIT_FPS}:d=${secs}" -f lavfi -i "anullsrc=r=48000:cl=stereo" \
    -vf "drawtext=fontfile=${KIT_TITLE_FONT}:textfile=${t}:fontsize=$((KIT_H / 10)):fontcolor=${KIT_INK}:x=(w-text_w)/2:y=(h-text_h)/2-$((KIT_H / 22)),drawtext=fontfile=${KIT_BODY_FONT}:textfile=${s}:fontsize=$((KIT_H / 26)):fontcolor=${KIT_INK_SOFT}:x=(w-text_w)/2:y=(h/2)+$((KIT_H / 18)),fade=t=in:st=0:d=0.3,fade=t=out:st=$(awk -v d="$secs" 'BEGIN{print d-0.3}'):d=0.3" \
    -t "$secs" $(_kit_venc) $(_kit_aenc) -shortest "$out"
  local r=$?; rm -f "$t" "$s"; return $r
}

kit_end() {
  local out="$1" line="${2:-Human in the Loop}" secs="${3:-3}"
  kit_title "$out" "$line" "humanintheloopgame.com" "$secs"
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
  _kit_ff -i "$in" -vf "drawtext=fontfile=${KIT_TITLE_FONT}:textfile=${t}:fontsize=$((KIT_H / 18)):fontcolor=${KIT_CREAM}:box=1:boxcolor=${KIT_INK}@0.82:boxborderw=$((KIT_H / 48)):x=$((KIT_W / 24)):y=$((KIT_H / 18))" \
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
