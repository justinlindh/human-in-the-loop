#!/usr/bin/env bash
# Reads, clears and fills the input box of a Claude Code session in a tmux pane.
# Usage: pane-input.sh read <pane>          print the text in the input box (exit 3: no input line on screen)
#        pane-input.sh clear <pane>         empty the input box, checking it on screen (exit 1: it would not empty)
#        pane-input.sh put <pane> <text>    clear it, type <text>, and check the box holds exactly <text>
#                                           (retyped up to 3 times; exit 1 and nothing left typed when it never does)
# Lane panes are a few rows tall, so the input line is below what they show: reading zooms the pane for a
# moment (tmux's own zoom, which restores the layout exactly) so the session redraws at full size. Text left
# in the box by an earlier run is otherwise invisible and gets whatever is typed next appended to it.
# PANE_REDRAW is the seconds to wait for the redraw after a zoom (default 1.5); PANE_GAP the settle after keys (1).
set -uo pipefail
cmd="${1:-}"; pane="${2:-}"
[ -n "$cmd" ] && [ -n "$pane" ] || { sed -n '2,/^set -uo/p' "$0" | sed '$d;s/^# \{0,1\}//' >&2; exit 2; }
redraw="${PANE_REDRAW:-1.5}"; gap="${PANE_GAP:-1}"
# A run stopped while it has the pane zoomed puts it back.
ours=0; trap '[ "$ours" = 1 ] && tmux resize-pane -t "$pane" -Z 2>/dev/null' EXIT

read_box() {
  local zoomed did=0 cap
  zoomed="$(tmux display -p -t "$pane" '#{window_zoomed_flag}' 2>/dev/null)"
  if [ "$zoomed" != 1 ]; then tmux resize-pane -t "$pane" -Z 2>/dev/null; ours=1; sleep "$redraw"; did=1; fi
  cap="$(tmux capture-pane -p -t "$pane" | sed 's/\xc2\xa0/ /g')"
  if [ "$did" = 1 ]; then tmux resize-pane -t "$pane" -Z 2>/dev/null; ours=0; sleep "$gap"; fi
  # The box runs from the last line starting with the prompt mark to the next rule; an empty box shows
  # nothing or the session's placeholder hint.
  awk '
    /^❯/ { found = 1; n = 0; delete buf; inbox = 1; sub(/^❯ */, ""); buf[n++] = $0; next }
    inbox && /^─/ { inbox = 0; next }
    inbox { sub(/^  /, ""); buf[n++] = $0 }
    END { if (!found) exit 3
          out = ""; for (i = 0; i < n; i++) out = out (i ? "\n" : "") buf[i]
          gsub(/[ \n]+$/, "", out)
          if (out ~ /^Try "/) out = ""
          print out }' <<<"$cap"
}
flat() { tr -d '[:space:]' <<<"$1"; }

clear_box() {
  local i t
  for i in $(seq 1 40); do
    t="$(read_box)" || { echo "pane-input: no input line on screen in $pane" >&2; return 1; }
    [ -z "$(flat "$t")" ] && return 0
    tmux send-keys -t "$pane" C-u; sleep "$(awk -v g="$gap" 'BEGIN { print g / 5 }')"
  done
  echo "pane-input: the input box in $pane would not empty; it holds: $t" >&2; return 1
}

case "$cmd" in
  read) read_box ;;
  clear) clear_box ;;
  put)
    text="${3-}"; [ -n "$text" ] || { echo "pane-input: put needs the text" >&2; exit 2; }
    tried=""
    for attempt in 1 2 3; do
      clear_box || exit 1
      tmux send-keys -t "$pane" -l "$text"; sleep "$gap"
      got="$(read_box)"
      [ "$(flat "$got")" = "$(flat "$text")" ] && exit 0
      tried="$tried
attempt $attempt: the box held: ${got:-nothing}"
    done
    clear_box >/dev/null 2>&1
    echo "pane-input: the text never showed alone in the input box of $pane after 3 tries.$tried" >&2; exit 1 ;;
  *) echo "pane-input: unknown command $cmd" >&2; exit 2 ;;
esac
