#!/usr/bin/env bash
# Compacts a teammate that just reported "handoff ready", but only at a safe boundary: its inbox is
# empty (nobody is mid-conversation with it) and none of its PRs has changes requested. After the
# compact it types a prompt asking the lane to restate its paths, open work and open threads, so the
# lead can check nothing dropped.
# Usage: hitl-autocompact.sh [--memory <dir>] [--teams <dir>] [--exclude <transcript-prefix>] <name> [--check]
# Exit 0 compacted (or, with --check, the gates pass); 3 held (reason on stdout); 1 error (no team lists
# the name, no pane); 2 bad arguments. --check also lists other lanes whose handoff names <name>, for the
# lead's open-threads check before it confirms.
# The team directory is --teams, else $HITL_TEAMS_DIR, else <config>/teams, and its session-* directories
# are searched newest first for one whose config.json lists the name. The memory directory (handoffs live
# in <memory>/handoffs) and --exclude are as in hitl-reset.sh, which does the compact.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hitl-lane-paths.sh
. "$HERE/hitl-lane-paths.sh"

usage() { sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --check) args+=("--check"); shift ;;
    --memory) [ $# -ge 2 ] || { echo "--memory needs a directory" >&2; exit 2; }; export HITL_MEMORY_DIR="$2"; shift 2 ;;
    --teams) [ $# -ge 2 ] || { echo "--teams needs a directory" >&2; exit 2; }; HITL_TEAMS_DIR="$2"; shift 2 ;;
    --exclude) [ $# -ge 2 ] || { echo "--exclude needs a prefix" >&2; exit 2; }; export HITL_RESET_EXCLUDE="$2"; shift 2 ;;
    --*) echo "unknown option $1" >&2; exit 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
check=""; names=()
for a in "${args[@]}"; do if [ "$a" = --check ]; then check="--check"; else names+=("$a"); fi; done
[ "${#names[@]}" -eq 1 ] || { echo "usage: hitl-autocompact.sh [--memory <dir>] [--teams <dir>] [--exclude <prefix>] <name> [--check]" >&2; exit 2; }
name="${names[0]}"
repo="$(lane_repo_root)" || { echo "not inside the repository" >&2; exit 1; }
teams="$(lane_teams_dir)"
team="$(ls -td "$teams"/session-*/ 2>/dev/null | while read -r t; do jq -e --arg n "$name" '.members[]? | select(.name == $n)' "$t/config.json" >/dev/null 2>&1 && { echo "$t"; break; }; done)"
[ -n "$team" ] || { echo "no team lists $name" >&2; exit 1; }

inbox="$team/inboxes/$name.json"
if [ -s "$inbox" ] && [ "$(jq 'length' "$inbox" 2>/dev/null || echo 0)" -gt 0 ]; then
  echo "held: $name has unread messages"; exit 3
fi

prefix="$name"; [ "$name" = integrator ] && prefix=integ
asked="$(cd "$repo" && gh pr list --json headRefName,reviewDecision --jq "[.[] | select((.headRefName | startswith(\"$prefix/\")) and .reviewDecision == \"CHANGES_REQUESTED\")] | length" 2>/dev/null || echo 0)"
if [ "${asked:-0}" -gt 0 ]; then
  echo "held: $name has a PR with changes requested"; exit 3
fi

if [ "$check" = --check ]; then
  hand="$(lane_memory_dir)/handoffs"
  others="$(grep -l -i -w "$name" "$hand"/*.md 2>/dev/null | grep -v "/$name.md$" | xargs -r -n1 basename | sed 's/\.md$//' | tr '\n' ' ')"
  echo "gates pass for $name; other handoffs naming it: ${others:-none}"
  exit 0
fi

bash "$HERE/hitl-reset.sh" "$name" compact 60 || exit $?

pane=""
for p in $(tmux list-panes -a -F '#{pane_id}'); do
  tmux capture-pane -p -t "$p" | tail -3 | grep -q "@$name\b" && { pane="$p"; break; }
done
[ -n "$pane" ] || { echo "compacted, but no pane shows @$name for the restate prompt" >&2; exit 1; }
sleep "${HITL_RESET_RESTATE_WAIT:-3}"
tmux send-keys -t "$pane" "You've been compacted. Re-read memory/handoffs/$name.md, then in one message restate your paths, your open work and your open threads (who you're waiting on or owe a reply), re-arm your watchers, and continue." Enter
echo "compacted $name and asked it to restate"
