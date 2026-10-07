#!/usr/bin/env bash
# Compacts an idle teammate's context with /compact, from outside its session.
# Usage: scripts/team/reset-teammate.sh <name> compact [max-wait-seconds] [--log <file>] [--before-send <command>] [--confirm-wait <seconds>]
# Finds the teammate's tmux pane by the "@<name>" bar on its last lines, waits until it is idle at
# the prompt (default wait 1800 s), prints its context size, sends /compact, and confirms it from the
# transcript's compact_boundary record. --log appends a row (time, name, mode, context size,
# transcript) to that file. --before-send runs a command (bash -c) once the pane is idle, just before
# /compact is typed: a nonzero exit ends the run with that code and sends nothing. The idle wait is
# max-wait; the confirm wait is --confirm-wait (default 600 s, a compaction can take minutes), and ends
# at once when the pane sits idle for 30 s (RESET_IDLE_GRACE) without a boundary, printing its last lines.
# clear is refused: a /clear'ed teammate keeps working, but its end-of-turn reports stop reaching
# team-lead, so the lead loses it silently. Respawn the teammate instead when a compact isn't enough.
# The transcript directory is Claude Code's, for the main checkout's path (found from any worktree): ~/.claude/projects/<the path
# with every character outside A-Z a-z 0-9 turned into a dash>. CLAUDE_PROJECTS_DIR names another one.
# A teammate's transcript is, of those touched in the last day whose first lines hold its spawn brief
# ("You are `<name>`"), the one with the newest last record; a boundary in any of them confirms the compact. Run it from the team lead's session, never for the session you are in.
# Exit: 0 done, 1 not found, still busy or not confirmed, 2 usage.
set -uo pipefail
usage="usage: scripts/team/reset-teammate.sh <name> compact [max-wait-seconds] [--log <file>] [--before-send <command>] [--confirm-wait <seconds>]"
pos=(); log=""; before_send=""; confirm_wait=600
while [ $# -gt 0 ]; do
  case "$1" in
    --log) log="${2:?$usage}"; shift 2 ;;
    --before-send) before_send="${2:?$usage}"; shift 2 ;;
    --confirm-wait) confirm_wait="${2:?$usage}"; shift 2 ;;
    -*) echo "$usage" >&2; exit 2 ;;
    *) pos+=("$1"); shift ;;
  esac
done
name="${pos[0]:-}"; mode="${pos[1]:-}"; maxwait="${pos[2]:-1800}"
[ -n "$name" ] && [ "${#pos[@]}" -le 3 ] || { echo "$usage" >&2; exit 2; }
case "$mode" in
  compact) ;;
  clear) echo "clear is refused: a /clear'ed teammate's end-of-turn reports stop reaching team-lead. Use compact, or respawn the teammate." >&2; exit 2 ;;
  *) echo "mode must be compact" >&2; exit 2 ;;
esac
case "$maxwait" in ''|*[!0-9]*) echo "max-wait must be a number of seconds" >&2; exit 2 ;; esac
case "$name" in *[!A-Za-z0-9_-]*) echo "name must be letters, digits, dash or underscore" >&2; exit 2 ;; esac

# The main checkout (the parent of the shared .git), so running this from any worktree finds the
# transcripts of sessions started at the repository's root.
here="$(cd "$(dirname "$0")/../.." && pwd)"
# A copy of this script outside any repository uses the git repository of the directory it is run from.
if common="$(git -C "$here" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then repo="$(dirname "$common")"; else repo="$here"; fi
proj="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects/$(printf '%s' "$repo" | sed 's/[^A-Za-z0-9]/-/g')}"
[ -d "$proj" ] || { echo "no transcript directory at $proj" >&2; exit 1; }

pane=""
for p in $(tmux list-panes -a -F '#{pane_id}'); do
  tmux capture-pane -p -t "$p" | tail -3 | grep -q "@$name\b" && { pane="$p"; break; }
done
[ -n "$pane" ] || { echo "no pane shows @$name" >&2; exit 1; }

candidates() { # every recent transcript whose first lines hold the brief
  local f
  for f in $(find "$proj" -maxdepth 1 -name '*.jsonl' -mmin -1440 -printf '%p\n'); do
    # Not head | grep -q: grep stops at the match, head dies of SIGPIPE on the rest of these large
    # lines, and pipefail turns that into no match.
    grep -q "You are \`$name\`" < <(head -n 20 "$f") && echo "$f"
  done
}
# The time of a file's last record says which session is writing now (any process can touch an mtime);
# a file without timestamps falls back to its mtime.
last_at() {
  local t; t="$(tac "$1" | grep -m1 -o '"timestamp":"[^"]*"' | cut -d'"' -f4)"
  [ -n "$t" ] || t="$(date -u -d "@$(stat -c %Y "$1")" +%FT%T.000Z)"
  echo "$t"
}
transcript() { # the candidate written most recently
  local f
  for f in $(candidates); do echo "$(last_at "$f") $f"; done | sort -r | head -1 | cut -d' ' -f2-
}
tokens() { # context size of the newest assistant turn in a transcript
  # A record can carry the usage object more than once; count only the first.
  tac "$1" | grep -m1 '"cache_read_input_tokens"' | grep -o '"usage":{[^}]*}' | head -1 \
    | grep -o '"\(input_tokens\|cache_read_input_tokens\|cache_creation_input_tokens\)":[0-9]*' | awk -F: '{s+=$2} END {print s+0}'
}
busy() { tmux capture-pane -p -t "$pane" | tail -8 | grep -qE '… \(|esc to interrupt'; }

before="$(transcript)"
[ -n "$before" ] || { echo "no transcript in $proj starts with $name's brief" >&2; exit 1; }
case "$confirm_wait" in ''|*[!0-9]*) echo "confirm-wait must be a number of seconds" >&2; exit 2 ;; esac
# Only the transcript's own boundary records count, not a message that mentions the word.
boundaries() { # counted over every candidate, so the compact is seen whichever file the lane writes it to
  local f n=0; for f in $(candidates); do n=$((n + $(grep -c '"subtype":"compact_boundary"' "$f"))); done; echo "$n"
}
pre="$(tokens "$before")"; n0="$(boundaries)"
end=$((SECONDS + maxwait))
while busy || { sleep "${RESET_POLL:-4}"; busy; }; do
  [ $SECONDS -ge $end ] && { echo "$name still busy after ${maxwait}s" >&2; exit 1; }
  sleep "${RESET_POLL:-5}"
done

# The caller's last look, right before the command is typed: a nonzero exit stops here, sending nothing.
if [ -n "$before_send" ]; then
  bash -c "$before_send"; rc=$?
  [ $rc -eq 0 ] || exit "$rc"
fi

tmux send-keys -t "$pane" "/$mode" Enter
# Confirmed by the transcript's new boundary. A compaction can take minutes (the pane shows its spinner), so
# the wait is --confirm-wait (default 600 s), apart from max-wait; but a pane that sits idle for RESET_IDLE_GRACE
# seconds (default 30) with no boundary refused the command (nothing to compact, an error): that ends it now.
ok=0; idle=0; cend=$((SECONDS + confirm_wait))
while :; do
  [ "$(boundaries)" -gt "$n0" ] && { ok=1; break; }
  [ $SECONDS -ge $cend ] && { echo "$name: /$mode not confirmed after ${confirm_wait}s" >&2; break; }
  if busy; then idle=0; else
    [ "$idle" = 0 ] && idle=$SECONDS
    if [ $((SECONDS - idle)) -ge "${RESET_IDLE_GRACE:-30}" ]; then
      echo "$name: /$mode not confirmed: the pane went idle without compacting. Its last lines:" >&2
      tmux capture-pane -p -t "$pane" | grep -v '^[[:space:]]*$' | tail -4 >&2; break
    fi
  fi
  sleep "${RESET_POLL:-5}"
done
[ "$ok" = 1 ] || exit 1
[ -z "$log" ] || printf '%s\t%s\t%s\tpre=%s\ttranscript=%s\n' "$(date -u +%FT%TZ)" "$name" "$mode" "$pre" "$(basename "$before")" >>"$log"
echo "$name: /$mode done (context before: $pre tokens)"
