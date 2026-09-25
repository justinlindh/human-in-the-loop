#!/usr/bin/env bash
# The shareable printer smash clip, from the capture item share-printer:
#
#   npm run capture -- --only share-printer --out shots/nods --size 1920x1080 --fps 30 --audio --no-webm
#   scripts/reels/share-printer.sh shots/nods shots/printer-smash.mp4
#
# The beat from the card (held about 6 s) through the smash, cropped to 1280x720 round the action and
# the card, with a title lower third and the end card. The sound is the game's own.
set -euo pipefail
IN=${1:?captures dir}; OUT=${2:?output mp4}
source "$(dirname "$0")/kit.sh"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
kit_trim "$IN/share-printer.mp4" "$TMP/body.mp4" 1.2 26.6 1280:720:640:140
kit_lower "$TMP/body.mp4" "$TMP/titled.mp4" "PC LOAD LETTER" 0.3 2.6
kit_end "$TMP/end.mp4" "Human in the Loop" 2.5
kit_xfade "$OUT" 0.4 "$TMP/titled.mp4" "$TMP/end.mp4"
echo "share-printer: $(_kit_dur "$OUT") s -> $OUT"
