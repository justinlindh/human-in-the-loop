#!/usr/bin/env bash
# Renders takes of every narration line in the approved narrator voice: the Qwen3-TTS Base clone
# server (GPU) driven by the voice-clone script, always with the synthetic deadpan reference and its
# transcript. The script's own default reference is a recording of a real person and is never used.
#
#   VOICE_CLONE=<voice-clone script> TRAILER_VO_REF=<reference wav> TRAILER_VO_REF_TEXT=<its transcript> \
#     scripts/trailer/vo/render.sh [takes dir] [takes per line]
#
# The voice-clone script, the reference clip and its transcript come from the audio lane's tools;
# docs/trailer/README.md says which.
# Writes <takes dir>/<line id>.take<n>.wav. No pitch processing; loudness is set later by pick.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-$ROOT/shots/trailer/takes}"
TAKES="${2:-3}"
CLONE="${VOICE_CLONE:?set VOICE_CLONE to the voice-clone script}"
REF="${TRAILER_VO_REF:?set TRAILER_VO_REF to the narrator reference clip}"
REF_TEXT_FILE="${TRAILER_VO_REF_TEXT:?set TRAILER_VO_REF_TEXT to the reference transcript file}"

[ -x "$CLONE" ] || { echo "trailer-vo: voice-clone script not found at $CLONE" >&2; exit 1; }
[ -f "$REF" ] || { echo "trailer-vo: reference clip not found: $REF" >&2; exit 1; }
[ -s "$REF_TEXT_FILE" ] || { echo "trailer-vo: reference transcript not found: $REF_TEXT_FILE" >&2; exit 1; }
RT="$(cat "$REF_TEXT_FILE")"
mkdir -p "$OUT"

node "$ROOT/scripts/trailer/build.js" --print-vo > "$OUT/lines.json"
node -e 'for (const l of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))) console.log(`${l.id}\t${l.text}`)' "$OUT/lines.json" |
while IFS=$'\t' read -r id text; do
  for n in $(seq 0 $((TAKES - 1))); do
    timeout 300 "$CLONE" -r "$REF" -t "$RT" -o "$OUT/$id.take$n.wav" "$text" </dev/null
    echo "trailer-vo: $OUT/$id.take$n.wav"
  done
done
