#!/usr/bin/env bash
# Cases for scripts/test-push.sh in a scratch repo with stand-in npx (lists N test files) and
# test-related. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
r="$tmp/repo"; mkdir -p "$r/scripts/tools" "$r/src" "$tmp/bin"
cp "$HERE/test-push.sh" "$HERE/nice10.sh" "$r/scripts/"
printf 'echo "related $*" >>"%s/runs"\n' "$tmp" >"$r/scripts/tools/test-related.sh"
printf '#!/usr/bin/env bash\nfor i in $(seq 1 "${FAKE_COUNT:-3}"); do echo "tests/t$i.test.js"; done\n' >"$tmp/bin/npx"; chmod +x "$tmp/bin/npx"
g() { git -C "$r" -c user.name=t -c user.email=t@t "$@"; }
g init -q -b main; g commit -q --allow-empty -m base; g update-ref refs/remotes/origin/main HEAD
runit() { out="$(cd "$r" && PATH="$tmp/bin:$PATH" bash scripts/test-push.sh 2>&1)"; rc=$?; }
runs() { if [ -f "$tmp/runs" ]; then wc -l <"$tmp/runs"; else echo 0; fi; }

runit
[ $rc -eq 0 ] && grep -q 'nothing to run' <<<"$out" && [ "$(runs)" -eq 0 ] || fail "no changed JS runs nothing: rc $rc: $out"
echo 'x' >"$r/src/a.js"
FAKE_COUNT=3 runit
[ $rc -eq 0 ] && [ "$(runs)" -eq 1 ] && grep -q 'related --files src/a.js' "$tmp/runs" || fail "a small related set runs: rc $rc: $out"
FAKE_COUNT=41 runit
[ $rc -eq 0 ] && grep -q 'reach 41 test files' <<<"$out" && [ "$(runs)" -eq 1 ] || fail "more than 40 test files skips the run: rc $rc: $out"
HITL_PUSH_TEST_MAX=100 FAKE_COUNT=41 runit
[ "$(runs)" -eq 2 ] || fail "HITL_PUSH_TEST_MAX raises the cutoff: runs $(runs): $out"
[ $fails -eq 0 ] && echo "test-push: all cases pass" || echo "test-push: $fails failing"
[ $fails -eq 0 ]
