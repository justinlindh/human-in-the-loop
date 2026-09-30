#!/usr/bin/env bash
# Resets an idle teammate's context with /clear or /compact, from outside its session.
# Usage: scripts/team/reset-teammate.sh <name> <clear|compact> [max-wait-seconds] [--log <file>]
# Finds the teammate's tmux pane by the "@<name>" bar on its last lines, waits until it is idle at
# the prompt (default wait 1800 s), prints its context size, sends the slash command, and confirms a
# compact from the transcript's compact_boundary line. A clear writes nothing to the transcript until
# the next message, so it is confirmed by sending the command and letting the pane settle; resend the
# teammate's spawn brief afterwards, since a clear drops it. --log appends a row (time, name, mode,
# context size, transcript) to that file.
# The transcript directory is Claude Code's, for the main checkout's path (found from any worktree): ~/.claude/projects/<the path
# with every character outside A-Z a-z 0-9 turned into a dash>. CLAUDE_PROJECTS_DIR names another one.
# A teammate's transcript is the newest one, touched in the last day, whose first lines hold its spawn
# brief ("You are `<name>`"). Run it from the team lead's session, never for the session you are in.
# Exit: 0 done, 1 not found, still busy or not confirmed, 2 usage.
set -uo pipefail
usage="usage: scripts/team/reset-teammate.sh <name> <clear|compact> [max-wait-seconds] [--log <file>]"
pos=(); log=""
while [ $# -gt 0 ]; do
  case "$1" in
    --log) log="${2:?$usage}"; shift 2 ;;
    -*) echo "$usage" >&2; exit 2 ;;
    *) pos+=("$1"); shift ;;
  esac
done
name="${pos[0]:-}"; mode="${pos[1]:-}"; maxwait="${pos[2]:-1800}"
[ -n "$name" ] && [ "${#pos[@]}" -le 3 ] || { echo "$usage" >&2; exit 2; }
case "$mode" in clear|compact) ;; *) echo "mode must be clear or compact" >&2; exit 2 ;; esac
case "$maxwait" in ''|*[!0-9]*) echo "max-wait must be a number of seconds" >&2; exit 2 ;; esac
case "$name" in *[!A-Za-z0-9_-]*) echo "name must be letters, digits, dash or underscore" >&2; exit 2 ;; esac

# The main checkout (the parent of the shared .git), so running this from any worktree finds the
# transcripts of sessions started at the repository's root.
here="$(cd "$(dirname "$0")/../.." && pwd)"
common="$(git -C "$here" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && repo="$(dirname "$common")" || repo="$here"
proj="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects/$(printf '%s' "$repo" | sed 's/[^A-Za-z0-9]/-/g')}"
[ -d "$proj" ] || { echo "no transcript directory at $proj" >&2; exit 1; }

pane=""
for p in $(tmux list-panes -a -F '#{pane_id}'); do
  tmux capture-pane -p -t "$p" | tail -3 | grep -q "@$name\b" && { pane="$p"; break; }
done
[ -n "$pane" ] || { echo "no pane shows @$name" >&2; exit 1; }

transcript() { # the teammate's newest transcript (the brief sits in its first lines)
  local f
  for f in $(find "$proj" -maxdepth 1 -name '*.jsonl' -mmin -1440 -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-); do
    head -n 20 "$f" | grep -q "You are \`$name\`" && { echo "$f"; return; }
  done
}
tokens() { # context size of the newest assistant turn in a transcript
  # A record can carry the usage object more than once; count only the first.
  tac "$1" | grep -m1 '"cache_read_input_tokens"' | grep -o '"usage":{[^}]*}' | head -1 \
    | grep -o '"\(input_tokens\|cache_read_input_tokens\|cache_creation_input_tokens\)":[0-9]*' | awk -F: '{s+=$2} END {print s+0}'
}
busy() { tmux capture-pane -p -t "$pane" | tail -8 | grep -qE '… \(|esc to interrupt'; }

before="$(transcript)"
[ -n "$before" ] || { echo "no transcript in $proj starts with $name's brief" >&2; exit 1; }
pre="$(tokens "$before")"; n0="$(grep -c compact_boundary "$before")"
end=$((SECONDS + maxwait))
while busy || { sleep "${RESET_POLL:-4}"; busy; }; do
  [ $SECONDS -ge $end ] && { echo "$name still busy after ${maxwait}s" >&2; exit 1; }
  sleep "${RESET_POLL:-5}"
done

tmux send-keys -t "$pane" "/$mode" Enter
ok=0
for _ in $(seq 1 120); do
  if [ "$mode" = compact ]; then
    [ "$(grep -c compact_boundary "$before")" -gt "$n0" ] && { ok=1; break; }
  else sleep "${RESET_POLL:-10}"; ok=1; break; fi
  sleep "${RESET_POLL:-5}"
done
[ "$ok" = 1 ] || { echo "$name: /$mode not confirmed" >&2; exit 1; }
[ -z "$log" ] || printf '%s\t%s\t%s\tpre=%s\ttranscript=%s\n' "$(date -u +%FT%TZ)" "$name" "$mode" "$pre" "$(basename "$before")" >>"$log"
echo "$name: /$mode done (context before: $pre tokens)"
