#!/usr/bin/env bash
# Cases for scripts/tools/drive.mjs: argument errors (no browser), then one real run on the mock
# floor with a passing and a failing expect. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TREE="${CI_DIR:-$HERE/../..}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
export HITL_TIMINGS=off
d() { (cd "$TREE" && timeout 240 node scripts/tools/drive.mjs "$@" 2>&1); }
out="$(d --sizes 800 --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] && grep -q 'unknown size "800"' <<<"$out" || fail "a bad size exits 2: $rc $out"
out="$(d --steps '{"shot":"a"}' --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] && grep -q 'must be a JSON array' <<<"$out" || fail "steps that aren't an array exit 2: $rc $out"
out="$(d --steps '[{"clik":"x"}]' --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] && grep -q 'step 0' <<<"$out" || fail "an unknown step exits 2: $rc $out"
out="$(d --steps '[{"tick":0}]' --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] && grep -q 'step 0' <<<"$out" || fail "an empty step exits 2: $rc $out"
out="$(d --steps '[{"shot":""}]' --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] || fail "an empty shot name exits 2: $rc $out"
out="$(d --mock floor --play squads:5 --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] || fail "--play with --mock exits 2: $rc $out"
out="$(d --play squads:5 --out "$tmp/o")"; rc=$?; [ $rc -eq 2 ] || fail "--play without --seed exits 2: $rc $out"
out="$(d --mock floor --sizes small,400x300t --name t --out "$tmp/o" --steps '[{"wait":200},{"eval":"1+1","as":"two"},{"count":"canvas","as":"canvases"},{"expect":"window.__HITL.state != null","msg":"has state"},{"shot":"s"}]' --json "$tmp/r.json")"; rc=$?
[ $rc -eq 0 ] && [ -s "$tmp/o/t-s-small.png" ] && [ -s "$tmp/o/t-s-400x300t.png" ] || fail "a run writes a shot per size: $rc $out"
grep -q '"two": 2' "$tmp/r.json" && grep -q '"has state": true' "$tmp/r.json" || fail "results reach the json: $(cat "$tmp/r.json" 2>&1 | head -5)"
out="$(d --mock floor --out "$tmp/o" --steps '[{"expect":"false","msg":"never"},{"click":".no-such-thing","timeout":1000},{"shot":"x"}]')"; rc=$?
[ $rc -eq 1 ] && grep -q 'expect failed: never' <<<"$out" && grep -q 'FAIL' <<<"$out" || fail "a failed expect or click exits 1 and says why: $rc $out"
out="$(d --mock floor --out "$tmp/o" --steps '[{"click":".no-such-thing","optional":true},{"press":"Escape"},{"dismiss":true}]')"; rc=$?
[ $rc -eq 0 ] || fail "an optional click that finds nothing passes: $rc $out"
# --play is runBot's game: the same seed, bot and week give the same company as the balance tools' loop.
want="$(cd "$TREE" && node --input-type=module -e "
import { runBot } from './src/sim/bots.js'; import { dispatch } from './src/sim/index.js';
const s = runBot('squads', 11, 40).state;
if (s.pendingDecision) dispatch(s, { type: 'resolveDecision', choice: 0 });
console.log(JSON.stringify({ week: s.week, cash: s.cash, staff: s.staff.length }));")"
d --seed 11 --play squads:40 --setup 'return { week: s.week, cash: s.cash, staff: s.staff.length };' --out "$tmp/o" --json "$tmp/p.json" >/dev/null
got="$(node -e "const r = JSON.parse(require('fs').readFileSync('$tmp/p.json','utf8')).desktop.setup; console.log(JSON.stringify(r))")"
[ "$got" = "$want" ] || fail "--play matches runBot: drive $got, runBot $want"
[ $fails -eq 0 ] && echo "drive: all cases pass"
exit $fails
