#!/usr/bin/env bash
# Evidence media for PRs: contact sheets from images and clips, sized for a PR comment (at most
# 1600 px wide). Every ffmpeg call runs under timeout and nice and reads one frame per input, so a
# bad input cannot turn into a runaway job.
#
#   scripts/sheet.sh grid <out.png> [--cols N] <image>...          labelled grid, labels = file names
#   scripts/sheet.sh pair <out.png> <before> <after> [--labels "Before,After"]
#   scripts/sheet.sh frames <out.png> <clip> [--count K] [--cols N]  K evenly spaced frames, labelled by time
#
# Images can be anything ffmpeg reads (png, jpg, a video's first frame). Exit 0 on success.
set -uo pipefail

WIDTH=1600           # widest output, in pixels
LIMIT=60             # seconds any single ffmpeg or ffprobe call may run
FF=(timeout "$LIMIT" nice -n 10 ffmpeg -nostdin -hide_banner -loglevel error -y)
usage() { grep '^#   scripts/sheet.sh' "$0" | sed 's/^#   /usage: /' >&2; exit 2; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# cell <input> <label> <cell width> <index> [seek seconds]: one letterboxed 16:9 cell with a label band.
cell() {
  local in="$1" label="$2" cw="$3" i="$4" seek="${5:-}" ch=$(( $3 * 9 / 16 ))
  printf '%s' "$label" >"$tmp/label$i.txt"
  "${FF[@]}" ${seek:+-ss "$seek"} -i "$in" -frames:v 1 -vf \
    "scale=$cw:$ch:force_original_aspect_ratio=decrease,pad=$cw:$ch:(ow-iw)/2:(oh-ih)/2:color=white,pad=iw:ih+34:0:34:color=white,drawtext=font='DejaVu Sans':textfile=$tmp/label$i.txt:x=8:y=8:fontsize=20:fontcolor=black" \
    "$tmp/cell_$(printf '%03d' "$i").png" || { echo "sheet: cannot read $in" >&2; return 1; }
}

# assemble <out> <cols> <count>: tile the cells, filling any empty slot with white.
assemble() {
  local out="$1" cols="$2" n="$3" rows=$(( ($3 + $2 - 1) / $2 ))
  "${FF[@]}" -framerate 1 -i "$tmp/cell_%03d.png" -vf "tile=${cols}x${rows}:padding=6:margin=6:color=white" -frames:v 1 "$out" \
    || { echo "sheet: could not assemble $out" >&2; return 1; }
  echo "sheet: wrote $out ($n cells, ${cols}x${rows})"
}

mode="${1:-}"; out="${2:-}"; [ -n "$mode" ] && [ -n "$out" ] || usage
shift 2
case "$mode" in
  grid)
    cols=3; files=()
    while [ $# -gt 0 ]; do case "$1" in --cols) cols="$2"; shift 2 ;; *) files+=("$1"); shift ;; esac; done
    [ ${#files[@]} -gt 0 ] || usage
    [ ${#files[@]} -lt "$cols" ] && cols=${#files[@]}
    cw=$(( (WIDTH - 6 * (cols + 1)) / cols )); i=0
    for f in "${files[@]}"; do cell "$f" "$(basename "$f")" "$cw" "$i" || exit 1; i=$((i + 1)); done
    assemble "$out" "$cols" "$i" ;;
  pair)
    [ $# -ge 2 ] || usage
    before="$1"; after="$2"; shift 2; labels="Before,After"
    [ "${1:-}" = --labels ] && labels="${2:?--labels needs \"A,B\"}"
    cw=$(( (WIDTH - 18) / 2 ))
    cell "$before" "${labels%%,*}" "$cw" 0 && cell "$after" "${labels#*,}" "$cw" 1 || exit 1
    assemble "$out" 2 2 ;;
  frames)
    [ $# -ge 1 ] || usage
    clip="$1"; shift; count=6; cols=3
    while [ $# -gt 0 ]; do case "$1" in --count) count="$2"; shift 2 ;; --cols) cols="$2"; shift 2 ;; *) usage ;; esac; done
    dur="$(timeout "$LIMIT" nice -n 10 ffprobe -v error -show_entries format=duration -of csv=p=0 "$clip")" \
      || { echo "sheet: cannot read $clip" >&2; exit 1; }
    [ "$count" -lt "$cols" ] && cols=$count
    cw=$(( (WIDTH - 6 * (cols + 1)) / cols ))
    for i in $(seq 0 $((count - 1))); do
      t="$(awk -v d="$dur" -v i="$i" -v n="$count" 'BEGIN { printf "%.2f", d * (i + 0.5) / n }')"
      cell "$clip" "${t}s" "$cw" "$i" "$t" || exit 1
    done
    assemble "$out" "$cols" "$count" ;;
  *) usage ;;
esac
