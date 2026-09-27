#!/usr/bin/env bash
# Cases for scripts/hooks/commit-msg. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
t() { # <want exit> <message> <label>
  printf '%s\n' "$2" >"$tmp/msg"
  bash "$HERE/commit-msg" "$tmp/msg" 2>/dev/null; rc=$?
  [ $rc -eq "$1" ] || { echo "FAIL $3: exit $rc, want $1"; fails=$((fails + 1)); }
}
t 0 'feat(ui): a plain commit

A body that mentions Claude the character and a session of play.' plain
t 0 "Merge remote-tracking branch 'origin/main' into tools/x" merge
t 0 'fix(sim): x

# Claude-Session: a comment line git strips' comment
t 1 'feat(ui): x

Claude-Session: https://claude.ai/code/session_abc' session-trailer
t 1 'feat(ui): x

Co-Authored-By: Claude <noreply@anthropic.com>' co-author
t 1 'feat(ui): x

co-authored-by: someone <a@b>' co-author-lower
t 1 'feat(ui): x

See https://claude.ai/code/session_abc for the run.' session-link
t 1 'feat(ui): x

Generated with [Claude Code](https://claude.com/claude-code)' generated
[ $fails -eq 0 ] && echo "commit-msg: all cases pass"
exit $fails
