#!/usr/bin/env bash
# Cases for scripts/ci-covers.sh over a scratch toolkit. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/docs/toolkit"
printf -- '---\ntool: a\ncovers: scripts/a.sh scripts/a.test.sh scripts/tools/\n---\nbody covers: scripts/zzz.sh\n' >"$tmp/docs/toolkit/a.md"
printf -- '---\ntool: b\ncovers: scripts/b.sh scripts/b.test.mjs scripts/b2.test.sh\n---\n' >"$tmp/docs/toolkit/b.md"
printf -- '---\ntool: c\ncovers: scripts/c.sh\n---\n' >"$tmp/docs/toolkit/c.md"
out() { printf '%s\n' "$@" | bash "$HERE/ci-covers.sh" "$tmp" | tr '\n' ' '; }
eq() { [ "$2" = "$3" ] || fail "$1: want [$3], got [$2]"; }

eq "a changed tool runs its entry's tests" "$(out scripts/a.sh)" "scripts/a.test.sh "
eq "an entry with two tests runs both" "$(out scripts/b.sh)" "scripts/b.test.mjs scripts/b2.test.sh "
eq "a file in a covered folder counts" "$(out scripts/tools/x.sh)" "scripts/a.test.sh "
eq "a tool with no test of its own runs nothing" "$(out scripts/c.sh)" ""
eq "a changed test runs itself" "$(out scripts/other.test.sh)" "scripts/other.test.sh "
eq "an unrelated change runs nothing" "$(out src/sim/x.js docs/readme/a.md)" ""
eq "words below the front matter are not coverage" "$(out scripts/zzz.sh)" ""
eq "no changes, no tests" "$(printf '' | bash "$HERE/ci-covers.sh" "$tmp" | tr '\n' ' ')" ""
# The real toolkit: a tool's own change selects its test.
real="$(printf 'scripts/nice10.sh\n' | bash "$HERE/ci-covers.sh" "$HERE/.." | tr '\n' ' ')"
eq "the real toolkit maps nice10.sh to its test" "$real" "scripts/nice10.test.sh "
real="$(printf 'scripts/ci-local.sh\n' | bash "$HERE/ci-covers.sh" "$HERE/.." | tr '\n' ' ')"
for t in ci-pr-selftest ci-capacity ci-keep-logs ci-delta ci-merge-only; do
  case "$real" in *"scripts/$t.test.sh"*) ;; *) fail "a ci-local.sh change runs $t: [$real]" ;; esac
done

[ $fails -eq 0 ] && echo "ci-covers: all cases pass"
exit $fails
