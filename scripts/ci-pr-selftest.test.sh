#!/usr/bin/env bash
# Cases for ci-local's pr_selftest: under ci-pr, a self-test the PR changes runs as the PR wrote it.
# Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }

# pr_selftest and tool_step, lifted from ci-local.sh.
awk '/^pr_selftest\(\)/ { f=1 } f { print } /^tool_step\(\)/ { t=1 } t && /^}/ { exit }' "$HERE/ci-local.sh" >"$tmp/fns.sh"
grep -q '^pr_selftest()' "$tmp/fns.sh" || { echo "FAIL could not lift pr_selftest from ci-local.sh"; exit 1; }

# main's scripts dir (SELF) and a PR tree (cwd) sharing one history.
SELF="$tmp/main/scripts"; mkdir -p "$SELF/hooks" "$tmp/tree"
cd "$tmp/tree" && git init -q -b main . && git config user.email t@t && git config user.name t
mkdir -p scripts/hooks
echo 'echo old' >scripts/a.test.sh; echo 'echo old' >scripts/hooks/b.test.sh; echo 'echo old' >scripts/c.test.sh
git add -A && git commit -qm base
tool_mb="$(git rev-parse HEAD)"
cp scripts/a.test.sh scripts/c.test.sh "$SELF/"; cp scripts/hooks/b.test.sh "$SELF/hooks/"
echo old >"$SELF/lib.txt"
echo 'echo fixed-$(cat "$(dirname "$0")/lib.txt")' >scripts/a.test.sh; echo 'echo fixed' >scripts/hooks/b.test.sh; echo new >scripts/lib.txt
git add -A && git commit -qm pr

LOGS="$tmp/logs"; mkdir -p "$LOGS"
note() { echo "$*" >>"$LOGS/notes"; }
# pstep stub (tool_step starts its steps with pstep): runs the test file it is handed, in the
# foreground, and records which copy that was.
pstep() { case "${*: -1}" in "$tmp"/tree/*) ran="PR:$(bash "${@: -1}")" ;; *) ran="MAIN:$(bash "${@: -1}")" ;; esac; }
tool_changes=1
source "$tmp/fns.sh"
run() { ran=""; : >"$LOGS/notes"; tool_step "$@"; }

CI_PR_SELFTESTS=1
run a bash "$SELF/a.test.sh"
[ "$ran" = "PR:fixed-new" ] || fail "changed test should run the PR's copy against the PR's scripts (got $ran)"
grep -q 'scripts/a.test.sh' "$LOGS/notes" || fail "the note should name the file"
[ -e "$tmp/tree/scripts/a.test.sh" ] || fail "the PR's own test file must stay in its tree"
run b bash "$SELF/hooks/b.test.sh"
[ "$ran" = "PR:fixed" ] || fail "a test in a subdirectory should swap too (got $ran)"
run c bash "$SELF/c.test.sh"
[ "$ran" = "MAIN:old" ] || fail "an unchanged test should run main's (got $ran)"
[ ! -s "$LOGS/notes" ] || fail "no note for an unchanged test"
echo 'echo old' >"$SELF/d.test.sh"; echo 'echo old' >"$tmp/elsewhere.sh"
run d bash "$SELF/d.test.sh"
[ "$ran" = "MAIN:old" ] || fail "a test the PR tree lacks (an older checkout) runs main's (got $ran)"
run e bash "$tmp/elsewhere.sh"
[ "$ran" = "MAIN:old" ] || fail "a step with no self-test path is left alone (got $ran)"
tool_mb=""
run a bash "$SELF/a.test.sh"
[ "$ran" = "MAIN:old" ] || fail "with no merge base main's test runs (got $ran)"
tool_mb="$(git rev-parse HEAD~1)"
CI_PR_SELFTESTS=""
run a bash "$SELF/a.test.sh"
[ "$ran" = "MAIN:old" ] || fail "without CI_PR_SELFTESTS main's test runs (got $ran)"

if [ $fails -eq 0 ]; then echo "ci-pr-selftest: all cases pass"; else exit 1; fi
