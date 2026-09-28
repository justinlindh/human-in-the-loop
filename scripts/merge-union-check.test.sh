#!/usr/bin/env bash
# Cases for scripts/merge-union-check.mjs on small real repos: a PR head that passed, a main commit,
# and a hand-resolved merge of main into the PR. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
g() { git -C "$r" -c user.name=t -c user.email=t@t -c commit.gpgsign=false "$@" >/dev/null 2>&1; }
put() { mkdir -p "$(dirname "$r/$1")"; printf '%b' "$2" >"$r/$1"; }

# new_case: a base commit with a few files, then branches main and pr from it.
new_case() {
  r="$tmp/$RANDOM$RANDOM"; mkdir -p "$r"; git -C "$r" init -q -b main
  put docs/a.md 'one\ntwo\n'
  put src/data/captions.js "export const C = {\n  a: 'A',\n};\n"
  put src/sim/balance.js 'export const B = {\n  x: 1, y: 2,\n  z: 3,\n};\n'
  put src/sim/logic.js 'export const f = () => 1;\n// a\n// b\n// c\n// d\nexport const g = () => 2;\n'
  put src/contract/contract.md 'contract\n'
  put tests/t.test.js "it('first', () => {});\n"
  g add -A; g commit -qm base; g branch pr
}
on() { g checkout -q "$1"; }
commit() { g add -A; g commit -qm "$1"; }
# merge_as <file=content ...>: merge main into pr, write the given resolutions, commit.
merge_as() {
  on pr; g merge -q --no-edit main
  local kv; for kv in "$@"; do put "${kv%%=*}" "${kv#*=}"; done
  g add -A; g -c core.editor=true commit -q --no-edit
}
check() { # <name> <want exit> [passed-ref]
  local passed="${3:-pr^1}" out rc
  out="$(node "$HERE/merge-union-check.mjs" "$(git -C "$r" rev-parse "$passed")" "$(git -C "$r" rev-parse pr)" main --repo "$r")"; rc=$?
  [ $rc -eq "$2" ] || { echo "FAIL $1: exit $rc, want $2 ($out)"; fails=$((fails + 1)); }
}

new_case; on pr; put docs/a.md 'one\npr line\ntwo\n'; commit pr; on main; put docs/a.md 'one\nmain line\ntwo\n'; commit main
merge_as "docs/a.md=one\npr line\nmain line\ntwo\n"
check 'docs: ours then theirs carries' 0

new_case; on pr; put docs/a.md 'one\npr line\ntwo\n'; commit pr; on main; put docs/a.md 'one\nmain line\ntwo\n'; commit main
merge_as "docs/a.md=one\nmain line\npr line\ntwo\n"
check 'docs: theirs then ours carries' 0

new_case; on pr; put docs/a.md 'one\npr line\ntwo\n'; commit pr; on main; put docs/a.md 'one\nmain line\ntwo\n'; commit main
merge_as "docs/a.md=one\npr line, edited\nmain line\ntwo\n"
check 'a hand edit inside a region does not carry' 1

new_case; on pr; put docs/a.md 'one\npr line\ntwo\n'; commit pr; on main; put docs/a.md 'one\nmain line\ntwo\n'; commit main
merge_as "docs/a.md=one\npr line\nmain line\ntwo\n" "src/sim/logic.js=export const f = () => 9;\nexport const g = () => 2;\n"
check 'a hand edit to a file with no conflict does not carry' 1

new_case; on pr; put src/sim/logic.js 'export const f = () => 10;\nexport const g = () => 2;\n'; commit pr
on main; put src/sim/logic.js 'export const f = () => 20;\nexport const g = () => 2;\n'; commit main
merge_as "src/sim/logic.js=export const f = () => 10;\nexport const f = () => 20;\nexport const g = () => 2;\n"
check 'a conflict in sim code does not carry, even kept both ways' 1

new_case; on pr; put src/contract/contract.md 'contract\npr\n'; commit pr; on main; put src/contract/contract.md 'contract\nmain\n'; commit main
merge_as "src/contract/contract.md=contract\npr\nmain\n"
check 'the contract never carries' 1

new_case; on pr; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, p: 5,\n  z: 3,\n};\n'; commit pr
on main; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, m: 6,\n  z: 3,\n};\n'; commit main
merge_as "src/sim/balance.js=export const B = {\n  x: 1, y: 2, p: 5, m: 6,\n  z: 3,\n};\n"
check 'balance.js: one line holding both additions carries' 0

new_case; on pr; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, p: 5,\n  z: 3,\n};\n'; commit pr
on main; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, m: 6,\n  z: 3,\n};\n'; commit main
merge_as "src/sim/balance.js=export const B = {\n  x: 1, y: 2, p: 5,\n  x: 1, y: 2, m: 6,\n  z: 3,\n};\n"
check 'balance.js: both whole lines kept (every key twice) does not carry' 1

new_case; on pr; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, p: 5,\n  z: 3,\n};\n'; commit pr
on main; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, p: 7,\n  z: 3,\n};\n'; commit main
merge_as "src/sim/balance.js=export const B = {\n  x: 1, y: 2, p: 5,\n  z: 3,\n};\n"
check 'balance.js: a key with two values does not carry' 1

new_case; on pr; put src/sim/balance.js 'export const B = {\n  x: 1, y: [2, 4], p: 5,\n  z: 3,\n};\n'; commit pr
on main; put src/sim/balance.js 'export const B = {\n  x: 1, y: [2, 4], m: 6,\n  z: 3,\n};\n'; commit main
merge_as "src/sim/balance.js=export const B = {\n  x: 1, y: [2, 9], p: 5, m: 6,\n  z: 3,\n};\n"
check 'balance.js: an array value edited after its first element does not carry' 1

new_case; on pr; put src/sim/balance.js 'export const B = {\n  x: 1, y: [2, 4], p: 5,\n  z: 3,\n};\n'; commit pr
on main; put src/sim/balance.js 'export const B = {\n  x: 1, y: [2, 4], m: { a: 1, b: 2 },\n  z: 3,\n};\n'; commit main
merge_as "src/sim/balance.js=export const B = {\n  x: 1, y: [2, 4], p: 5, m: { a: 1, b: 2 },\n  z: 3,\n};\n"
check 'balance.js: array and object values kept whole carry' 0

new_case; on pr; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, p: 5,\n  z: 3,\n};\n'; commit pr
on main; put src/sim/balance.js 'export const B = {\n  x: 1, y: 2, m: 6,\n  z: 3,\n};\n'; commit main
merge_as "src/sim/balance.js=export const B = {\n  x: 1, y: 2, p: 5, m: 6, junk\n  z: 3,\n};\n"
check 'balance.js: stray text on the line does not carry' 1

new_case; on pr; put src/data/captions.js "export const C = {\n  a: 'A',\n  b: 'from pr',\n};\n"; commit pr
on main; put src/data/captions.js "export const C = {\n  a: 'A',\n  c: 'C',\n};\n"; commit main
merge_as "src/data/captions.js=export const C = {\n  a: 'A',\n  b: 'from pr',\n  c: 'C',\n};\n"
check 'data: new keys on both sides carry' 0

new_case; on pr; put src/data/captions.js "export const C = {\n  a: 'A',\n  b: 'from pr',\n};\n"; commit pr
on main; put src/data/captions.js "export const C = {\n  a: 'A',\n  b: 'from main',\n};\n"; commit main
merge_as "src/data/captions.js=export const C = {\n  a: 'A',\n  b: 'from pr',\n  b: 'from main',\n};\n"
check 'data: the same key on both sides does not carry' 1

new_case; on pr; put tests/t.test.js "it('first', () => {});\nit('same', () => { pr(); });\n"; commit pr
on main; put tests/t.test.js "it('first', () => {});\nit('same', () => { main(); });\n"; commit main
merge_as "tests/t.test.js=it('first', () => {});\nit('same', () => { pr(); });\nit('same', () => { main(); });\n"
check 'tests: a test name twice does not carry' 1

new_case; on pr; put src/sim/logic.js 'export const f = () => 10;\n// a\n// b\n// c\n// d\nexport const g = () => 2;\n'; put docs/a.md 'one\npr line\ntwo\n'; commit pr
on main; put src/sim/logic.js 'export const f = () => 1;\n// a\n// b\n// c\n// d\nexport const g = () => 20;\n'; put docs/a.md 'one\nmain line\ntwo\n'; commit main
merge_as "docs/a.md=one\npr line\nmain line\ntwo\n"
check "main changing one of the PR's src files does not carry" 1

new_case; on pr; put docs/a.md 'one\npr line\ntwo\n'; commit pr; put docs/b.md 'more\n'; commit more
on main; put docs/a.md 'one\nmain line\ntwo\n'; commit main
merge_as "docs/a.md=one\npr line\nmain line\ntwo\n"
check 'a merge whose first parent is not the passed head does not carry' 1 'pr^1^1'

# Main split docs/features.md into docs/features/ while the PR edited it: moving the PR's own edits
# verbatim into the area files carries; anything else doesn't.
split_case() { # <resolution of a.md> <resolution of b.md>
  new_case; put docs/features.md 'intro\nalpha line\nbeta line\n'; g add -A; g commit -qm inv; g branch -f pr
  on pr; put docs/features.md 'intro\nalpha line, improved\nbeta line\n'; commit pr
  on main; g rm -q docs/features.md; put docs/features/README.md 'intro\n'; put docs/features/a.md 'alpha line\n'; put docs/features/b.md 'beta line\n'; commit split
  on pr; g merge -q --no-edit main; g rm -q docs/features.md; put docs/features/a.md "$1"; put docs/features/b.md "$2"
  g add -A; g -c core.editor=true commit -q --no-edit
}
split_case 'alpha line, improved\n' 'beta line\n'
check 'features: edits moved verbatim into docs/features/ carry' 0
split_case 'alpha line, improved again\n' 'beta line\n'
check 'features: an edit changed on the way into docs/features/ does not carry' 1
split_case 'alpha line, improved\n' 'beta line, and more\n'
check 'features: a move plus another edit under docs/features/ does not carry' 1

[ $fails -eq 0 ] && echo "merge-union-check: all cases pass" || echo "merge-union-check: $fails failing"
[ $fails -eq 0 ]
