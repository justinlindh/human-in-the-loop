#!/usr/bin/env bash
# Cases for scripts/tested-trees.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
export HITL_TESTED_TREES="$tmp/trees"
git init -q -b main "$tmp/r" && cd "$tmp/r" || exit 1
echo a >a && g add a && g commit -q -m one
c1="$(git rev-parse HEAD)"
echo b >b && g add b && g commit -q -m two
c2="$(git rev-parse HEAD)"
g commit -q --allow-empty -m "same tree as two"
c3="$(git rev-parse HEAD)"

bash "$HERE/tested-trees.sh" check "$c2" --repo "$tmp/r" >/dev/null && fail "nothing recorded yet: check should fail"
bash "$HERE/tested-trees.sh" record "$tmp/r" 7 "$c2" main || fail "record should succeed"
out="$(bash "$HERE/tested-trees.sh" check "$c2" --repo "$tmp/r")"; [[ "$out" == "pr=7 head="* ]] || fail "check prints the record: $out"
bash "$HERE/tested-trees.sh" check "$c3" --repo "$tmp/r" >/dev/null || fail "a different commit with the same tree counts"
bash "$HERE/tested-trees.sh" check "$c1" --repo "$tmp/r" >/dev/null && fail "a different tree does not count"
bash "$HERE/tested-trees.sh" check nonsense --repo "$tmp/r" >/dev/null 2>&1 && fail "an unknown ref does not count"
touch -d '20 days ago' "$tmp/trees/$(git rev-parse "$c2^{tree}")"
g checkout -q "$c1"
bash "$HERE/tested-trees.sh" record "$tmp/r" 8 "$c1" main
[ ! -e "$tmp/trees/$(git rev-parse "$c2^{tree}")" ] || fail "records older than 14 days are dropped when one is written"
bash "$HERE/tested-trees.sh" 2>/dev/null; [ $? -eq 2 ] || fail "no command exits 2"

[ $fails -eq 0 ] && echo "tested-trees: all cases pass"
exit $fails
