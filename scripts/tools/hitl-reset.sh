#!/usr/bin/env bash
# Resets an idle teammate's context (/compact or /clear in its tmux pane) and logs it for the
# clear-vs-compact trial.
# Usage: hitl-reset.sh [--memory <dir>] [--exclude <transcript-prefix>] <name> <clear|compact> [max-wait-seconds]
# Finds the teammate's tmux pane by its "@<name>" bar, waits for it to go idle, sends the slash command,
# confirms it took effect in the transcript, and appends a row to <memory>/reset-trial.log.
# After a clear, the lead must resend the teammate's brief.
#
# The project memory directory is --memory, else $HITL_MEMORY_DIR, else the Claude config directory's
# projects/<this checkout's path with / and . as ->/memory (CLAUDE_CONFIG_DIR, default ~/.claude).
# Transcripts are read from its parent. --exclude (or $HITL_RESET_EXCLUDE) skips transcript files whose
# name starts with the prefix, such as the caller's own session.
# Exit 0 done; 1 not found, still busy or not confirmed; 2 bad arguments.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hitl-lane-paths.sh
. "$HERE/hitl-lane-paths.sh"

usage() { sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }
exclude="${HITL_RESET_EXCLUDE:-}"
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --memory) [ $# -ge 2 ] || { echo "--memory needs a directory" >&2; exit 2; }; HITL_MEMORY_DIR="$2"; shift 2 ;;
    --exclude) [ $# -ge 2 ] || { echo "--exclude needs a prefix" >&2; exit 2; }; exclude="$2"; shift 2 ;;
    --*) echo "unknown option $1" >&2; exit 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
[ "${#args[@]}" -ge 2 ] && [ "${#args[@]}" -le 3 ] || { echo "usage: hitl-reset.sh [--memory <dir>] [--exclude <prefix>] <name> <clear|compact> [max-wait-seconds]" >&2; exit 2; }
name="${args[0]}"; mode="${args[1]}"; maxwait="${args[2]:-1800}"
case "$mode" in clear|compact) ;; *) echo "mode must be clear or compact" >&2; exit 2 ;; esac
case "$maxwait" in ''|*[!0-9]*) echo "max-wait-seconds must be a whole number" >&2; exit 2 ;; esac
export HITL_MEMORY_DIR
mem="$(lane_memory_dir)"; proj="$(dirname "$mem")"
log="$mem/reset-trial.log"

pane=""
for p in $(tmux list-panes -a -F '#{pane_id}'); do
  tmux capture-pane -p -t "$p" | tail -3 | grep -q "@$name\b" && { pane="$p"; break; }
done
[ -n "$pane" ] || { echo "no pane shows @$name" >&2; exit 1; }

transcript() { # the newest recent transcript that opens with the teammate's brief
  local f files=()
  while IFS= read -r f; do
    [ -n "$exclude" ] && case "$(basename "$f")" in "$exclude"*) continue ;; esac
    files+=("$f")
  done < <(find "$proj" -maxdepth 1 -name '*.jsonl' -mmin -1440 2>/dev/null)
  [ "${#files[@]}" -gt 0 ] || return 0
  ls -t $(grep -l "You are \`$name\`" "${files[@]}" 2>/dev/null) 2>/dev/null | head -1
}
tokens() { # context size of the newest assistant turn in a transcript
  # A record can carry the usage object more than once; count only the first.
  tac "$1" | grep -m1 '"cache_read_input_tokens"' | grep -o '"usage":{[^}]*}' | head -1 | grep -o '"\(input_tokens\|cache_read_input_tokens\|cache_creation_input_tokens\)":[0-9]*' | awk -F: '{s+=$2} END {print s+0}'
}
busy() { tmux capture-pane -p -t "$pane" | tail -8 | grep -qE '… \(|esc to interrupt'; }

before="$(transcript)"
[ -n "$before" ] || { echo "no recent transcript opens with \"You are \`$name\`\" under $proj" >&2; exit 1; }
pre="$(tokens "$before")"; n0="$(grep -c compact_boundary "$before")"
end=$((SECONDS + maxwait))
while busy || { sleep "${HITL_RESET_POLL:-4}"; busy; }; do [ $SECONDS -ge $end ] && { echo "$name still busy after ${maxwait}s" >&2; exit 1; }; sleep "${HITL_RESET_POLL:-5}"; done

tmux send-keys -t "$pane" "/$mode" Enter
ok=0
for _ in $(seq 1 120); do
  if [ "$mode" = compact ]; then [ "$(grep -c compact_boundary "$before")" -gt "$n0" ] && { ok=1; break; }
  # A clear writes nothing until the next message; the brief the lead sends confirms it.
  else sleep "${HITL_RESET_CLEAR_WAIT:-10}"; ok=1; break; fi
  sleep "${HITL_RESET_POLL:-5}"
done
[ "$ok" = 1 ] || { echo "$name: /$mode not confirmed" >&2; exit 1; }
mkdir -p "$mem"
printf '%s\t%s\t%s\tpre=%s\ttranscript=%s\n' "$(date -u +%FT%TZ)" "$name" "$mode" "$pre" "$(basename "$before")" >>"$log"
echo "$name: /$mode done (context before: $pre tokens)"
