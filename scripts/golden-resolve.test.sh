#!/usr/bin/env bash
# Cases for scripts/golden-resolve.sh on a real merge conflict, with a stand-in render. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
RENDER='for s in $(tr , " " <<<"$1"); do printf "regenerated %s" "$s" >"blender/checks/golden/$s.png"; done'
setup() { # <name> [a code conflict too]: a repo where merging main into feat conflicts on golden a.png
  local r="$tmp/$1"; mkdir -p "$r/blender/checks/golden" "$r/scripts" "$r/src"
  cp "$HERE/golden-resolve.sh" "$r/scripts/"; printf base >"$r/blender/checks/golden/a.png"; printf base >"$r/blender/checks/golden/b.png"; echo base >"$r/src/x.js"
  g -C "$r" init -q -b main && g -C "$r" add -A && g -C "$r" commit -qm base
  g -C "$r" checkout -q -b feat; printf feat >"$r/blender/checks/golden/a.png"; [ -n "${2:-}" ] && echo feat >"$r/src/x.js"; g -C "$r" commit -qam feat
  g -C "$r" checkout -q main; printf main >"$r/blender/checks/golden/a.png"; [ -n "${2:-}" ] && echo main >"$r/src/x.js"; g -C "$r" commit -qam main
  g -C "$r" checkout -q feat; g -C "$r" merge -q main >/dev/null 2>&1
  echo "$r"
}
r="$(setup ok)"
(cd "$r" && GOLDEN_CMD="$RENDER" bash scripts/golden-resolve.sh --no-sheets >/dev/null 2>&1); rc=$?
[ $rc -eq 0 ] || fail "resolve: rc $rc"
[ -z "$(git -C "$r" diff --name-only --diff-filter=U)" ] || fail "resolve: conflicts remain"
[ "$(git -C "$r" show :blender/checks/golden/a.png)" = "regenerated a" ] || fail "resolve: a.png not regenerated and staged"
[ "$(cat "$r/shots/golden-resolve/a.this-branch.png")" = feat ] && [ "$(cat "$r/shots/golden-resolve/a.merged-in.png")" = main ] || fail "resolve: both sides not kept"
[ "$(git -C "$r" show :blender/checks/golden/b.png)" = base ] || fail "resolve: an image without a conflict was touched"

r="$(setup code yes)"
(cd "$r" && GOLDEN_CMD="$RENDER" bash scripts/golden-resolve.sh --no-sheets >/dev/null 2>&1); rc=$?
[ $rc -eq 1 ] || fail "a code conflict should refuse with 1 (got $rc)"
git -C "$r" diff --name-only --diff-filter=U | grep -q 'golden/a.png' || fail "refusing must leave the golden conflict alone"

r="$(setup broken)"
(cd "$r" && GOLDEN_CMD='exit 3' bash scripts/golden-resolve.sh --no-sheets >/dev/null 2>&1); rc=$?
[ $rc -eq 1 ] || fail "a failed render should exit 1 (got $rc)"
git -C "$r" diff --name-only --diff-filter=U | grep -q 'golden/a.png' || fail "a failed render must leave the conflict unresolved"

r="$tmp/deleted"; mkdir -p "$r/blender/checks/golden" "$r/scripts"; cp "$HERE/golden-resolve.sh" "$r/scripts/"; printf base >"$r/blender/checks/golden/a.png"
g -C "$r" init -q -b main && g -C "$r" add -A && g -C "$r" commit -qm base
g -C "$r" checkout -q -b feat; printf feat >"$r/blender/checks/golden/a.png"; g -C "$r" commit -qam feat
g -C "$r" checkout -q main; g -C "$r" rm -q blender/checks/golden/a.png; g -C "$r" commit -qm "remove the scene"
g -C "$r" checkout -q feat; g -C "$r" merge -q main >/dev/null 2>&1
(cd "$r" && GOLDEN_CMD="$RENDER" bash scripts/golden-resolve.sh --no-sheets >/dev/null 2>"$tmp/del.err"); rc=$?
[ $rc -eq 1 ] && grep -q "deleted on one side" "$tmp/del.err" || fail "a scene deleted on one side should be refused for a hand resolve (rc $rc)"

g -C "$tmp/ok" commit -qm merged
(cd "$tmp/ok" && bash scripts/golden-resolve.sh --no-sheets >/dev/null 2>&1); rc=$?
[ $rc -eq 2 ] || fail "no merge in progress should exit 2 (got $rc)"

[ $fails -eq 0 ] && echo "golden-resolve: all cases pass" || echo "golden-resolve: $fails failing"
[ $fails -eq 0 ]
