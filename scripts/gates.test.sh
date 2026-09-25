#!/usr/bin/env bash
# Cases for scripts/gates.sh in a stand-in repo whose test:fast inspects the snapshot. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
export HITL_TIMINGS=off HITL_GATES_ROOT="$tmp/root" HITL_LOCK_DIR="$tmp/locks"
r="$tmp/repo"; mkdir -p "$r/scripts/lib" "$r/blender/checks" "$r/node_modules"
cp "$HERE/gates.sh" "$HERE/with-render-lock.sh" "$HERE/render-lock-held.sh" "$r/scripts/"; cp "$HERE/lib/timing.sh" "$HERE/lib/ci-capacity.sh" "$r/scripts/lib/"
cat >"$r/package.json" <<'JSON'
{ "name": "t", "private": true, "scripts": { "test:fast": "node check.js" } }
JSON
echo '{}' >"$r/package-lock.json"
# The stand-in test:fast: the snapshot has the edit, the deletion and the new file, and it isn't the source tree.
cat >"$r/check.js" <<'JS'
(() => {
const fs = require('fs');
const ok = fs.readFileSync('a.txt', 'utf8') === 'edited\n' && !fs.existsSync('gone.txt') && fs.readFileSync('new.txt', 'utf8') === 'new\n'
  && process.cwd() !== process.env.SRC && !fs.existsSync('fail.flag');
console.log(ok ? 'snapshot ok' : `snapshot wrong in ${process.cwd()}`);
process.exit(ok ? 0 : 1);
})();
JS
cat >"$r/blender/checks/clip.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
writeFileSync(`${process.env.SRC}/../sleeper.pid`, String(process.pid));
setInterval(() => {}, 1000);
JS
printf "const SCENARIOS = {\n  printer: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'printer_jam', subjectId: 's1', stage: { prop: 'printer_jammed', anchor: 'kitchen' } } } },\n};\n" >"$r/blender/checks/stage.mjs"
echo original >"$r/a.txt"; echo bye >"$r/gone.txt"; printf 'node_modules\n' >"$r/.gitignore"
g init -q -b main "$r" && g -C "$r" add -A && g -C "$r" commit -qm init
echo edited >"$r/a.txt"; rm "$r/gone.txt"; echo new >"$r/new.txt"
export SRC="$r"

out="$(cd "$r" && bash scripts/gates.sh --only test 2>&1)"; rc=$?
[ $rc -eq 0 ] || fail "a snapshot with the edit, the deletion and the new file should pass (rc $rc: $out)"
[[ "$out" == *"| test | pass |"* ]] || fail "the table should show test passing (got: $out)"
[ "$(cat "$r/a.txt")" = edited ] && [ -f "$r/new.txt" ] && [ ! -e "$r/gone.txt" ] || fail "the source tree must be left as it was"
[ -z "$(ls -d "$tmp/root"/gates-* 2>/dev/null)" ] || fail "the snapshot should be removed"
[ -z "$(g -C "$r" worktree list | sed 1d)" ] || fail "the snapshot's worktree should be unregistered"

touch "$r/fail.flag"
out="$(cd "$r" && bash scripts/gates.sh --only test 2>&1)"; rc=$?
[ $rc -eq 1 ] || fail "a failing gate should exit 1 (rc $rc)"
[[ "$out" == *"| test | FAIL |"* && "$out" == *"test failed; last lines"* ]] || fail "a failure should show in the table with its log (got: $out)"
rm "$r/fail.flag"

out="$(cd "$r" && bash scripts/gates.sh --only test --keep 2>&1)"
kept="$(ls -d "$tmp/root"/gates-* 2>/dev/null)"
[ -n "$kept" ] && [[ "$out" == *"snapshot kept at $kept"* ]] || fail "--keep should keep and name the snapshot (got: $out)"
g -C "$r" worktree remove --force "$kept" 2>/dev/null

# Stopped mid-run (TERM, as timeout or a kill by PID sends it): no gate or its children survive,
# including those under the gate's own timeout, which runs in a process group of its own.
# The stand-in clip.mjs never finishes; it runs as a real render gate does, under with-render-lock and timeout.
rm -f "$tmp/sleeper.pid"
(cd "$r" && exec bash scripts/gates.sh --only clip >"$tmp/term.out" 2>&1) & gp=$!
for _ in $(seq 1 100); do [ -s "$tmp/sleeper.pid" ] && break; sleep 0.1; done
sp="$(cat "$tmp/sleeper.pid" 2>/dev/null)"
if [ -z "$sp" ]; then fail "the slow gate never started ($(cat "$tmp/term.out"))"
else
  kill -TERM "$gp"; wait "$gp"; trc=$?
  [ $trc -eq 143 ] || fail "gates stopped by TERM should exit 143 (got $trc)"
  for _ in $(seq 1 30); do kill -0 "$sp" 2>/dev/null || break; sleep 0.1; done
  kill -0 "$sp" 2>/dev/null && { fail "a gate survived TERM (PID $sp)"; kill -KILL "$sp"; }
  [ -z "$(ls -d "$tmp/root"/gates-* 2>/dev/null)" ] || fail "the snapshot should be removed after TERM"
fi

out="$(cd "$r" && bash scripts/gates.sh --moment nosuch --only test 2>&1)"; rc=$?
[ $rc -eq 2 ] && [[ "$out" == *"known: printer"* ]] || fail "an unknown moment should exit 2 and list the known ones (rc $rc: $out)"
out="$(cd "$r" && bash scripts/gates.sh --only nosuch 2>&1)"; rc=$?
[ $rc -eq 2 ] || fail "an unknown gate should exit 2 (rc $rc)"

[ $fails -eq 0 ] && echo "gates: all cases pass" || echo "gates: $fails failing"
[ $fails -eq 0 ]
