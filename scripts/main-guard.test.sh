#!/usr/bin/env bash
# Cases for scripts/main-guard.sh's reporting, with a stand-in gh and stand-in runs. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$GH_LOG"
case "$*" in
  "issue list"*) cat "$GH_OPEN" 2>/dev/null ;;
  "issue create"*) echo "https://github.com/o/r/issues/99" ;;
esac
GH
chmod +x "$tmp/bin/gh"
fails=0
PASS='printf "| step | result | seconds |\n|---|---|---|\n| test:fast | pass | 1 |\n" >"$SUMMARY"'
FAIL_BAL='printf "| step | result | seconds |\n|---|---|---|\n| test:fast | pass | 1 |\n| test:balance | FAIL | 9 |\n" >"$SUMMARY"; exit 1'
run() { # <name> <suite> <sweep> <open issue number or ""> <expected gh patterns, |-separated> [--no-post]
  local log="$tmp/$RANDOM.log" open="$tmp/$RANDOM.open"; : >"$log"; [ -n "$4" ] && echo "$4" >"$open"
  GH_LOG="$log" GH_OPEN="$open" PATH="$tmp/bin:$PATH" CI_WORKTREE_ROOT="$tmp/root" \
    MAIN_GUARD_SUITE="$2" MAIN_GUARD_SWEEP="$3" bash "$HERE/main-guard.sh" --sha HEAD ${6:-} >/dev/null 2>&1
  local want; IFS='|' read -ra want <<<"$5"
  for w in "${want[@]}"; do
    case "$w" in
      !*) grep -qF -- "${w#!}" "$log" && { echo "FAIL $1: unexpected ${w#!}"; fails=$((fails + 1)); } ;;
      *) grep -qF -- "$w" "$log" || { echo "FAIL $1: missing $w"; fails=$((fails + 1)); } ;;
    esac
  done
}
run 'green, nothing open: success status, no issue' "$PASS" 'exit 0' '' 'state=success|!issue create|!issue close'
run 'green closes the open main-red issue' "$PASS" 'exit 0' '41' 'state=success|issue close 41'
run 'red, nothing open: failure status and a new issue' "$FAIL_BAL" 'exit 0' '' 'state=failure|description=Red: test:balance|issue create --title main is red at|--label main-red'
run 'red again comments on the open issue' "$FAIL_BAL" 'exit 0' '41' 'state=failure|issue comment 41|!issue create'
run 'a new strict-sweep finding makes main red' "$PASS" 'exit 1' '' 'state=failure|description=Red: sweep --strict|issue create'
run 'no-post posts nothing' "$FAIL_BAL" 'exit 1' '' '!statuses|!issue' --no-post
[ $fails -eq 0 ] && echo "main-guard: all cases pass" || echo "main-guard: $fails failing"
[ $fails -eq 0 ]
