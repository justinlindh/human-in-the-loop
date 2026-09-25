#!/usr/bin/env bash
# Cases for scripts/capture.js that need no real footage: an item it rejects leaves nothing behind.
# Exit 0 when all pass. It opens one small page (a GPU slot, or software GL where there is none).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
export HITL_TIMINGS=off
cat >"$tmp/manifest.mjs" <<'EOF'
export const ITEMS = [
  { id: 'bad-keys', title: 'camera keys out of order', query: 'mock=garage', seconds: 1, camera: [{ at: 1, target: [0, 0] }, { at: 0.5, target: [2, 2] }] },
  { id: 'clip-ok', title: 'a clip after it, long enough to watch the run', query: 'mock=garage', seconds: 4 },
];
EOF
out="$tmp/out"
(cd "$HERE/.." && exec timeout 300 node scripts/capture.js --manifest "$tmp/manifest.mjs" --only bad-keys,clip-ok --out "$out" --size 320x180 --fps 10 --no-webm >"$tmp/log" 2>&1) & run=$!
# While the run goes on to the next item, nothing may exist for the rejected one: no encoder, no file.
stray=""; file=""
while kill -0 "$run" 2>/dev/null; do
  for q in /proc/[0-9]*; do
    { c="$(tr '\0' ' ' <"$q/cmdline")"; } 2>/dev/null || continue
    case "$c" in ffmpeg*bad-keys*) stray="${q#/proc/} $c" ;; esac
  done
  [ -e "$out/bad-keys.mp4" ] && file=1
  sleep 0.2
done
wait "$run"; rc=$?
[ $rc -eq 1 ] || fail "a rejected item should fail the run (exit $rc: $(tail -3 "$tmp/log"))"
grep -q 'FAIL bad-keys: camera key 1 (at 0.5) is out of order' "$tmp/log" || fail "the rejection should name the item and the key ($(grep -m1 bad-keys "$tmp/log"))"
[ -z "$stray" ] || fail "an encoder was started for the rejected item: $stray"
[ -z "$file" ] && [ ! -e "$out/bad-keys.mp4" ] || fail "the rejected item left a clip"
[ -e "$out/clip-ok.mp4" ] || fail "the item after it should still run"
[ $fails -eq 0 ] && echo "capture: all cases pass" || echo "capture: $fails failing"
[ $fails -eq 0 ]
