#!/usr/bin/env bash
# Cases for scripts/main-guard.sh's reporting, with a stand-in gh and stand-in runs. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
# GH_OPEN holds "label number" lines: the open issue per label.
cat >"$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$GH_LOG"
case "$*" in
  "issue list"*) args="$*"; label="${args#*--label }"; label="${label%% *}"; awk -v l="$label" '$1 == l { print $2 }' "$GH_OPEN" 2>/dev/null ;;
  "issue create"*) echo "https://github.com/o/r/issues/99" ;;
esac
GH
chmod +x "$tmp/bin/gh"
fails=0
PASS='printf "| step | result | seconds |\n|---|---|---|\n| test:fast | pass | 1 |\n" >"$SUMMARY"'
FAIL_BAL='printf "| step | result | seconds |\n|---|---|---|\n| test:fast | pass | 1 |\n| test:balance | FAIL | 9 |\n" >"$SUMMARY"; exit 1'
run() { # <name> <suite> <sweep> <strict> <perf> <open "label n" lines, ; separated> <expected gh patterns, | separated> [--no-post]
  local log="$tmp/$RANDOM.log" open="$tmp/$RANDOM.open"; : >"$log"; printf '%s' "$6" | tr ';' '\n' >"$open"
  GH_LOG="$log" GH_OPEN="$open" PATH="$tmp/bin:$PATH" CI_WORKTREE_ROOT="$tmp/root-$RANDOM" \
    MAIN_GUARD_SUITE="$2" MAIN_GUARD_SWEEP="$3" MAIN_GUARD_STRICT="$4" MAIN_GUARD_PERF="$5" \
    bash "$HERE/main-guard.sh" --sha HEAD ${8:-} >/dev/null 2>&1
  local want; IFS='|' read -ra want <<<"$7"
  for w in "${want[@]}"; do
    case "$w" in
      !*) grep -qF -- "${w#!}" "$log" && { echo "FAIL $1: unexpected ${w#!}"; fails=$((fails + 1)); } ;;
      *) grep -qF -- "$w" "$log" || { echo "FAIL $1: missing $w"; fails=$((fails + 1)); } ;;
    esac
  done
}
OK='exit 0'
run 'green, nothing open: success, no issue' "$PASS" "$OK" "$OK" "$OK" '' 'state=success|!issue create|!issue close'
run 'green closes the open main-red issue' "$PASS" "$OK" "$OK" "$OK" 'main-red 41' 'state=success|issue close 41'
run 'red opens a main-red issue' "$FAIL_BAL" "$OK" "$OK" "$OK" '' 'state=failure|description=Red: test:balance|issue create --title main is red at|--label main-red'
run 'red again comments on the open main-red issue' "$FAIL_BAL" "$OK" "$OK" "$OK" 'main-red 41' 'state=failure|issue comment 41|!issue create'
run 'a gating sweep failure makes main red' "$PASS" 'exit 1' "$OK" "$OK" '' 'state=failure|description=Red: sweep|--label main-red'
run 'a seed-only strict finding leaves main green and opens a sweep-finding issue' "$PASS" "$OK" 'echo NEW seed:1:w303; exit 1' "$OK" '' 'state=success|--label sweep-finding|!--label main-red --body'
run 'a perf regression leaves main green and opens a perf-regression issue' "$PASS" "$OK" "$OK" 'echo "floor/low render x1.6 > 1.4"; exit 1' '' 'state=success|--label perf-regression|!--label main-red --body'
run 'a clean strict sweep closes the open sweep-finding issue' "$PASS" "$OK" "$OK" "$OK" 'sweep-finding 52' 'state=success|issue close 52'
run 'no-post posts nothing' "$FAIL_BAL" 'exit 1' 'exit 1' 'exit 1' '' '!statuses|!issue' --no-post
[ $fails -eq 0 ] && echo "main-guard: all cases pass" || echo "main-guard: $fails failing"
[ $fails -eq 0 ]
