#!/usr/bin/env bash
# Compacts a teammate that just reported "handoff ready", but only at a safe boundary: its inbox is
# empty (nobody is mid-conversation with it) and none of its PRs has changes requested (its latest
# verdict review says so). The gates run again right before /compact is typed, with a look at the lane's
# transcript for a message that arrived since and was already read. After the compact it types a prompt
# asking the lane to restate its paths, open work and open threads, so the lead can check nothing dropped.
# Usage: hitl-autocompact.sh [--memory <dir>] [--teams <dir>] <name> [--check]
# Exit 0 compacted (or, with --check, the gates pass); 3 held (reason on stdout); 1 error (no team lists
# the name, no pane); 2 bad arguments. --check also lists other lanes whose handoff names <name>, for the
# lead's open-threads check before it confirms.
# The team directory is --teams, else $HITL_TEAMS_DIR, else <config>/teams, and its session-* directories
# are searched newest first for one whose config.json lists the name. The memory directory (handoffs live
# in <memory>/handoffs) is --memory, else $HITL_MEMORY_DIR, else the Claude project's memory folder for
# this checkout. The compact is scripts/team/reset-teammate.sh, logged to <memory>/reset-trial.log.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hitl-lane-paths.sh
. "$HERE/hitl-lane-paths.sh"

usage() { sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }
args=(); recheck=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --check) args+=("--check"); shift ;;
    --memory) [ $# -ge 2 ] || { echo "--memory needs a directory" >&2; exit 2; }; export HITL_MEMORY_DIR="$2"; shift 2 ;;
    --teams) [ $# -ge 2 ] || { echo "--teams needs a directory" >&2; exit 2; }; HITL_TEAMS_DIR="$2"; shift 2 ;;
    --recheck) [ $# -ge 2 ] || { echo "--recheck needs a time" >&2; exit 2; }; recheck="$2"; shift 2 ;;
    --*) echo "unknown option $1" >&2; exit 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
check=""; names=()
for a in "${args[@]}"; do if [ "$a" = --check ]; then check="--check"; else names+=("$a"); fi; done
[ "${#names[@]}" -eq 1 ] || { echo "usage: hitl-autocompact.sh [--memory <dir>] [--teams <dir>] <name> [--check]" >&2; exit 2; }
name="${names[0]}"
repo="$(lane_repo_root)" || { echo "not inside the repository" >&2; exit 1; }
teams="$(lane_teams_dir)"
team="$(ls -td "$teams"/session-*/ 2>/dev/null | while read -r t; do jq -e --arg n "$name" '.members[]? | select(.name == $n)' "$t/config.json" >/dev/null 2>&1 && { echo "$t"; break; }; done)"
[ -n "$team" ] || { echo "no team lists $name" >&2; exit 1; }

inbox="$team/inboxes/$name.json"
# A lane's branches carry its prefix; three lanes are named differently.
case "$name" in integrator) prefix=integ ;; tools2) prefix=tools ;; team-lead) prefix=lead ;; *) prefix="$name" ;; esac

# The gates: an empty inbox (nobody is mid-conversation with the lane) and no PR whose latest verdict is
# changes requested. Verdicts are reviews whose body starts `**Verdict: pass**` or `**Verdict: changes
# requested**` (the reviews are COMMENTED, so reviewDecision stays empty); the latest one decides, so a head
# that only merged main still counts. Exits 3 with the reason when one holds, and when gh can't answer.
gates() {
  if [ -s "$inbox" ] && [ "$(jq 'length' "$inbox" 2>/dev/null || echo 0)" -gt 0 ]; then
    echo "held: $name has unread messages"; exit 3
  fi
  local asked
  asked="$(cd "$repo" && gh pr list --json headRefName,reviews --jq "[.[] | select(.headRefName | startswith(\"$prefix/\")) | [.reviews[] | select(.body | test(\"^\\\\s*\\\\*\\\\*Verdict: (pass|changes requested)\\\\*\\\\*\"))] | last | select(. != null) | select(.body | test(\"^\\\\s*\\\\*\\\\*Verdict: changes requested\"))] | length" 2>/dev/null)" || asked=""
  [ -n "$asked" ] || { echo "held: couldn't read $name's PRs from GitHub"; exit 3; }
  if [ "$asked" -gt 0 ]; then
    echo "held: $name has a PR with changes requested"; exit 3
  fi
}

# A message that reached the lane after <since> and was read already (reading drains the inbox) is only in
# its transcript (the one lane-transcript.sh picks), a user record carrying a
# <teammate-message> stamped after <since>.
new_mail_since() {
  local proj t
  proj="${CLAUDE_PROJECTS_DIR:-$(dirname "$(lane_memory_dir)")}"
  t="$(bash "$HERE/lane-transcript.sh" "$proj" "$name")" || return 1
  jq -R -e --arg s "$1" 'fromjson? | select(.type == "user" and (.timestamp // "") > $s and ((.message.content // "") | tostring | contains("<teammate-message")))' "$t" >/dev/null 2>&1
}

since="$(date -u +%FT%T.%3NZ)"
gates
if [ -n "$recheck" ]; then
  if new_mail_since "$recheck"; then echo "held: $name has a new message since the check"; exit 3; fi
  exit 0
fi

if [ "$check" = --check ]; then
  hand="$(lane_memory_dir)/handoffs"
  others="$(grep -l -i -w "$name" "$hand"/*.md 2>/dev/null | grep -v "/$name.md$" | xargs -r -n1 basename | sed 's/\.md$//' | tr '\n' ' ')"
  echo "gates pass for $name; other handoffs naming it: ${others:-none}"
  exit 0
fi

mem="$(lane_memory_dir)"; mkdir -p "$mem"
# reset-teammate.sh waits for the pane to go idle, which can take a while; right before it types /compact it
# runs the gates again and looks for a message that came in since this check, so the lane is not compacted
# with an instruction its handoff doesn't have.
again="bash $(printf '%q' "$HERE/hitl-autocompact.sh") --memory $(printf '%q' "$mem") --teams $(printf '%q' "$teams") --recheck $since $name"
bash "$HERE/../team/reset-teammate.sh" "$name" compact 60 --log "$mem/reset-trial.log" --before-send "$again" || { rc=$?; echo "not compacted $name (exit $rc): no restate prompt typed" >&2; exit "$rc"; }

pane=""
for p in $(tmux list-panes -a -F '#{pane_id}'); do
  tmux capture-pane -p -t "$p" | tail -3 | grep -q "@$name\b" && { pane="$p"; break; }
done
[ -n "$pane" ] || { echo "compacted, but no pane shows @$name for the restate prompt" >&2; exit 1; }
sleep "${HITL_RESET_RESTATE_WAIT:-3}"
restate="You've been compacted. Re-read memory/handoffs/$name.md, then in one message restate your paths, your open work and your open threads (who you're waiting on or owe a reply), re-arm your watchers, and continue."
# The prompt is typed into a cleared input box and checked there before Enter, so it can never be sent glued to
# text left in the box (the box is below the rows a lane pane shows).
bash "$HERE/pane-input.sh" put "$pane" "$restate" || { echo "compacted $name, but the restate prompt could not be typed into its input" >&2; exit 1; }
tmux send-keys -t "$pane" Enter
echo "compacted $name and asked it to restate"
