#!/usr/bin/env bash
# Cases for scripts/check-commits.sh in a scratch repo. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -C "$tmp/r" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/r"; g init -q -b main; g commit -q --allow-empty -m 'chore: base'; base="$(g rev-parse HEAD)"
check() { (cd "$tmp/r" && bash "$HERE/check-commits.sh" "$base" HEAD "${1:-feat(x): y}" 2>&1); }

g commit -q --allow-empty -m 'feat(ui): a plain change'
out="$(check)"; [ $? -eq 0 ] || fail "a plain commit: $out"
out="$(check 'Add stuff')"; [ $? -eq 1 ] && grep -q 'PR title' <<<"$out" || fail "a bad title: $out"
g commit -q --allow-empty -m 'fix(ui): x' -m 'Claude-Session: https://claude.ai/code/session_abcdefghijklmnopqrstuvwxyz'
out="$(check)"; [ $? -eq 1 ] && grep -q 'carries attribution' <<<"$out" && ! grep -q 'abcdefghijklmnopqrstuvwxyz' <<<"$out" && ! grep -q '^Expected' <<<"$out" || fail "a session trailer: $out"
g reset -q --hard HEAD~1; g checkout -q -b side; g commit -q --allow-empty -m 'feat(ui): side'; g checkout -q main
g merge -q --no-ff side -m 'Merge side' -m 'Co-Authored-By: Claude <noreply@anthropic.com>'
out="$(check)"; [ $? -eq 1 ] && grep -q 'carries attribution' <<<"$out" || fail "a trailer on a merge commit: $out"

[ $fails -eq 0 ] && echo "check-commits: all cases pass"
exit $fails
