#!/usr/bin/env bash
# Cases for scripts/capture.js that need no real footage: an item it rejects leaves nothing behind.
# Exit 0 when all pass. It opens one small page (a GPU slot, or software GL where there is none).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# The tree under test (local CI sets CI_DIR), which has node_modules; local CI runs this test from a
# checkout of main that has none.
TREE="${CI_DIR:-$HERE/..}"
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
(cd "$TREE" && exec timeout 300 node scripts/capture.js --manifest "$tmp/manifest.mjs" --only bad-keys,clip-ok --out "$out" --size 320x180 --fps 10 --no-webm >"$tmp/log" 2>&1) & run=$!
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
# --fast draws small into its own out dir with no WebM; --changed skips an item whose inputs and output are as they were.
cat >"$tmp/m2.mjs" <<'EOF2'
export const ITEMS = [
  { id: 'c-clip', title: 'a one second clip', query: 'mock=garage', seconds: 1 },
  { id: 'c-still', title: 'a still', query: 'mock=garage', still: true, screenshots: [0.5] },
];
EOF2
cap() { (cd "$TREE" && timeout 300 node scripts/capture.js --manifest "$tmp/m2.mjs" "$@" 2>&1); }
fo="$tmp/fast"; cap --fast --only c-clip --out "$fo" >"$tmp/fast.log"; rc=$?
[ $rc -eq 0 ] && grep -q '960x540' "$fo/index.json" && grep -q '"fps": 30' "$fo/index.json" && [ -e "$fo/c-clip.mp4" ] && [ ! -e "$fo/c-clip.webm" ] || fail "--fast draws 960x540 at 30 fps with no WebM (rc $rc: $(tail -2 "$tmp/fast.log"))"
co="$tmp/chg"
cap --changed --no-webm --size 320x180 --fps 10 --out "$co" >"$tmp/c1.log"; [ -e "$co/c-clip.mp4" ] && ! grep -q '^skip' "$tmp/c1.log" || fail "the first --changed run renders every item"
m1="$(stat -c %Y-%s "$co/c-clip.mp4")"
cap --changed --no-webm --size 320x180 --fps 10 --out "$co" >"$tmp/c2.log"; rc=$?
[ $rc -eq 0 ] && [ "$(grep -c '^skip' "$tmp/c2.log")" -eq 2 ] && [ "$(stat -c %Y-%s "$co/c-clip.mp4")" = "$m1" ] || fail "an unchanged rerun skips both items and rewrites nothing (rc $rc: $(tail -3 "$tmp/c2.log"))"
cap --changed --no-webm --size 320x180 --fps 10 --seconds 2 --only c-clip --out "$co" >"$tmp/c3.log"; ! grep -q '^skip c-clip' "$tmp/c3.log" && grep -q 'ok   c-clip' "$tmp/c3.log" || fail "a changed option renders the item again: $(tail -2 "$tmp/c3.log")"
rm "$co/c-still-0.5s.png"; cap --changed --no-webm --size 320x180 --fps 10 --only c-still --out "$co" >"$tmp/c4.log"; [ -e "$co/c-still-0.5s.png" ] && grep -q 'ok   c-still' "$tmp/c4.log" || fail "a missing output renders again: $(tail -2 "$tmp/c4.log")"
cap --no-webm --size 320x180 --fps 10 --only c-still --out "$co" >"$tmp/c5.log"; grep -q 'ok   c-still' "$tmp/c5.log" && ! grep -q '^skip' "$tmp/c5.log" || fail "without --changed nothing is skipped"
[ $fails -eq 0 ] && echo "capture: all cases pass" || echo "capture: $fails failing"
[ $fails -eq 0 ]
