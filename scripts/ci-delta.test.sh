#!/usr/bin/env bash
# Cases for scripts/ci-delta.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
export HITL_TESTED_TREES="$tmp/trees"
git init -q -b main "$tmp/r" && cd "$tmp/r" || exit 1
mkdir -p src scripts && echo a >src/a.js && echo b >scripts/b.sh && g add -A && g commit -q -m one
out="$tmp/delta"

bash "$HERE/ci-delta.sh" 7 "$tmp/r" "$out" >/dev/null && fail "a PR with no passed tree gets no delta"
[ ! -e "$out" ] || fail "no delta file is written without a passed tree"

bash "$HERE/tested-trees.sh" record "$tmp/r" 7 "$(git rev-parse HEAD)" main
bash "$HERE/ci-delta.sh" 7 "$tmp/r" "$out" >/dev/null || fail "the same tree is a delta of nothing"
[ -e "$out" ] && [ ! -s "$out" ] || fail "an unchanged tree has an empty delta"

echo a2 >src/a.js && echo c >docs.md && g add -A && g commit -q -m two
bash "$HERE/ci-delta.sh" 7 "$tmp/r" "$out" >/dev/null || fail "a changed tree has a delta"
[ "$(sort "$out" | tr '\n' ' ')" = "docs.md src/a.js " ] || fail "the delta lists the files that differ: $(cat "$out")"

CI_NO_DELTA=1 bash "$HERE/ci-delta.sh" 7 "$tmp/r" "$tmp/none" >/dev/null && fail "CI_NO_DELTA=1 gives no delta"
[ ! -e "$tmp/none" ] || fail "CI_NO_DELTA=1 writes nothing"

bash "$HERE/ci-delta.sh" 8 "$tmp/r" "$tmp/none" >/dev/null && fail "another PR's pass is not this PR's"
printf 'pr=9 head=x base=main at=now\n' >"$tmp/trees/0000000000000000000000000000000000000000"
bash "$HERE/ci-delta.sh" 9 "$tmp/r" "$tmp/none" >/dev/null && fail "a recorded tree the repository lacks gives no delta"
# ci-local.sh's gate: a check runs only when its inputs are among the PR's files and, with a delta, the delta.
eval "$(sed -n '/^reaches() {/,/^}/p' "$HERE/ci-local.sh")"
have_delta=0; delta=""
reaches '^src/' $'src/x.js\ndocs/y.md' || fail "without a delta the PR's files decide"
reaches '^src/' 'docs/y.md' && fail "without a delta a PR with no matching file does not run the check"
have_delta=1; delta=$'docs/z.md'
reaches '^src/' 'src/x.js' && fail "a delta with no matching file skips the check"
delta=$'src/q.js\ndocs/z.md'
reaches '^src/' 'src/x.js' || fail "a delta with a matching file runs the check"
delta=""
reaches '^src/' 'src/x.js' && fail "an empty delta skips the check"
bash "$HERE/ci-delta.sh" 2>/dev/null; [ $? -eq 2 ] || fail "missing arguments exit 2"

[ $fails -eq 0 ] && echo "ci-delta: all cases pass"
exit $fails
