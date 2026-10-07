#!/usr/bin/env bash
# Cases for scripts/team/reset-teammate.sh with a stand-in tmux and scratch transcripts. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
# The stand-in tmux: one pane whose last lines come from $PANE_TEXT; send-keys appends a
# compact_boundary line to $TRANSCRIPT when the command is /compact and $STICK is unset.
cat >"$tmp/bin/tmux" <<'TMUX'
#!/usr/bin/env bash
case "$1" in
  list-panes) echo "%1" ;;
  # BUSY_AFTER: what the pane shows once a command was typed (a compaction still running).
  # The typed command shows in the input line once it has been sent more than DROP times (the prompt dropping
  # the first DROP sends); a pane showing BUSY_AFTER after a command shows only that.
  capture-pane) if [ -n "${BUSY_AFTER:-}" ] && grep -q 'send-keys -t %1 Enter' "$SENT" 2>/dev/null; then printf '%b\n' "$BUSY_AFTER"; else printf '%b\n' "${PANE_TEXT:-}"
    [ "$(grep -c -x 'send-keys -t %1 /compact' "$SENT" 2>/dev/null)" -gt "${DROP:-0}" ] && echo '❯ /compact'; fi; true ;;
  # MENTION: the transcript only gains a message that talks about the record, not the record.
  send-keys) echo "$*" >>"$SENT"; [ "$4" = /compact ] && [ -n "${MENTION:-}" ] && echo '{"type":"user","message":"the compact_boundary record is written when it ends"}' >>"$TRANSCRIPT"
    [ "$4" = /compact ] && [ -z "${STICK:-}" ] && echo '{"type":"system","subtype":"compact_boundary"}' >>"$TRANSCRIPT" ;;
esac
TMUX
chmod +x "$tmp/bin/tmux"
proj="$tmp/proj"; mkdir -p "$proj"
usage='"usage":{"input_tokens":3,"cache_read_input_tokens":90000,"cache_creation_input_tokens":7}'
mk() { # <file> <brief-name>: a teammate transcript
  printf '{"type":"user","message":"You are `%s`, on the team."}\n{"type":"assistant","message":{%s}}\n' "$2" "$usage" >"$proj/$1.jsonl"
}
mk sim1 sim
# A lead-style transcript mentions the brief only after many other lines, and is newer.
{ for i in $(seq 1 30); do echo '{"type":"user","message":"filler"}'; done; echo '{"type":"user","message":"You are `sim`, on the team."}'; } >"$proj/lead.jsonl"
export SENT="$tmp/sent" TRANSCRIPT="$proj/sim1.jsonl" CLAUDE_PROJECTS_DIR="$proj" RESET_POLL=0 RESET_IDLE_GRACE=0 RESET_KEY_GAP=0 RESET_SETTLE=0 PATH="$tmp/bin:$PATH" PANE_TEXT='ready\n  @sim'
run() { out="$(bash "$HERE/reset-teammate.sh" "$@" 2>&1)"; rc=$?; }

: >"$SENT"; run sim compact 5 --log "$tmp/log"
[ $rc -eq 0 ] && grep -q 'context before: 90010 tokens' <<<"$out" && grep -qx -- 'send-keys -t %1 /compact' "$SENT" && [ "$(tail -1 "$SENT")" = 'send-keys -t %1 Enter' ] || fail "a compact is sent, confirmed and sized: rc $rc: $out"
grep -q "sim	compact	pre=90010	transcript=sim1.jsonl" "$tmp/log" || fail "--log appends a row: $(cat "$tmp/log" 2>/dev/null)"

# Two transcripts hold the brief: the stale one has the newer mtime, the live one the newer last record.
# The live one is the one sized and logged, and a boundary written to either file confirms the compact.
mkt() { # <file> <brief-name> <last-record-time>
  printf '{"type":"user","message":"You are `%s`, on the team."}\n{"type":"assistant","timestamp":"%s","message":{%s}}\n' "$2" "$3" "$usage" >"$proj/$1.jsonl"
}
mkt live2 two 2026-10-07T09:00:00.000Z; mkt stale2 two 2026-10-04T09:00:00.000Z
touch -d '2026-10-07 01:00' "$proj/live2.jsonl"; touch "$proj/stale2.jsonl"
: >"$SENT"; TRANSCRIPT="$proj/live2.jsonl" PANE_TEXT='ready\n  @two' run two compact 5 --log "$tmp/log2"
[ $rc -eq 0 ] && grep -q 'transcript=live2.jsonl' "$tmp/log2" || fail "the transcript written last is picked, not the newest mtime: rc $rc: $out $(cat "$tmp/log2" 2>/dev/null)"
: >"$SENT"; TRANSCRIPT="$proj/stale2.jsonl" PANE_TEXT='ready\n  @two' run two compact 5
[ $rc -eq 0 ] || fail "a boundary in another candidate file confirms the compact: rc $rc: $out"
rm -f "$proj"/live2.jsonl "$proj"/stale2.jsonl

# A prompt that drops the first typed command: it is cleared and typed again, and Enter goes only after it shows.
: >"$SENT"; DROP=1 run sim compact 5
[ $rc -eq 0 ] && [ "$(grep -c -x 'send-keys -t %1 /compact' "$SENT")" = 2 ] && grep -q 'send-keys -t %1 C-u' "$SENT" && [ "$(grep -c 'send-keys -t %1 Enter' "$SENT")" = 1 ] || fail "a dropped command is retyped, Enter once: rc $rc: $out $(cat "$SENT")"
# One that never shows it: three tries, no Enter, a clear failure with what the pane showed.
: >"$SENT"; DROP=9 run sim compact 5
[ $rc -eq 1 ] && grep -q '/compact not typed' <<<"$out" && grep -q 'attempt 3' <<<"$out" && ! grep -q 'Enter' "$SENT" || fail "a command that never shows is not sent: rc $rc: $out $(cat "$SENT")"

: >"$SENT"; run sim clear 5
[ $rc -eq 2 ] && grep -q 'reports stop reaching team-lead' <<<"$out" && [ ! -s "$SENT" ] || fail "a clear is refused and nothing is sent: rc $rc: $out"

STICK=1 run sim compact 1
[ $rc -eq 1 ] && grep -q 'not confirmed: the pane went idle without compacting' <<<"$out" && grep -q '@sim' <<<"$out" && grep -q 'The pane right after /compact was typed' <<<"$out" || fail "a compact the pane refused ends at once with the pane text: rc $rc: $out"
# A compaction still running keeps the wait up to --confirm-wait, whatever max-wait is; one that ends without a
# boundary is not confirmed, and a message that only mentions the record is not the record.
: >"$SENT"; STICK=1 BUSY_AFTER='compacting… (8m 23s)\n  @sim' run sim compact 60 --confirm-wait 1
[ $rc -eq 1 ] && grep -q 'not confirmed after 1s' <<<"$out" || fail "--confirm-wait bounds the wait for a compaction that never ends: rc $rc: $out"
STICK=1 MENTION=1 run sim compact 1
[ $rc -eq 1 ] && grep -q 'not confirmed' <<<"$out" || fail "a message mentioning compact_boundary is not a boundary: rc $rc: $out"
run sim compact 5 --confirm-wait soon
[ $rc -eq 2 ] || fail "a bad --confirm-wait is a usage error: rc $rc: $out"
# --before-send runs once the pane is idle, just before /compact is typed: nonzero stops it, sending nothing.
: >"$SENT"; run sim compact 5 --before-send 'exit 3'
[ $rc -eq 3 ] && [ ! -s "$SENT" ] || fail "a failing --before-send ends the run with its code and sends nothing: rc $rc: $(cat "$SENT")"
: >"$SENT"; run sim compact 5 --before-send 'echo checked >"$SENT.check"'
[ $rc -eq 0 ] && [ -f "$SENT.check" ] && grep -q /compact "$SENT" || fail "a passing --before-send lets /compact go: rc $rc: $out"
: >"$SENT"; PANE_TEXT='working… (3s)\n  @sim' run sim compact 1 --before-send 'touch "$SENT.ran"'
[ ! -e "$SENT.ran" ] || fail "--before-send does not run while the pane is busy"; rm -f "$SENT.ran" "$SENT.check"

: >"$SENT"; PANE_TEXT='working… (3s)\n  @sim' run sim compact 1
[ $rc -eq 1 ] && grep -q 'still busy' <<<"$out" && [ ! -s "$SENT" ] || fail "a busy pane is not sent to: rc $rc: $out"

PANE_TEXT='ready\n  @other' run sim compact 1
[ $rc -eq 1 ] && grep -q 'no pane shows @sim' <<<"$out" || fail "no pane for the name: rc $rc: $out"

# Real transcripts' first lines run past a pipe's buffer: the brief is still found every time.
{ echo '{"type":"user","message":"You are `big`, on the team."}'; head -c 300000 /dev/zero | tr '\0' x; echo; printf '{"type":"assistant","message":{%s}}\n' "$usage"; } >"$proj/big1.jsonl"
missed=0
for _ in $(seq 1 20); do
  : >"$SENT"; TRANSCRIPT="$proj/big1.jsonl" PANE_TEXT='ready\n  @big' run big compact 5
  [ $rc -eq 0 ] || missed=$((missed + 1))
done
[ $missed -eq 0 ] || fail "a brief before a large line is found every time: missed $missed of 20: $out"

run nobody compact 1
[ $rc -eq 1 ] || fail "a teammate with no brief in a transcript is refused: rc $rc: $out"

run sim reset 1
[ $rc -eq 2 ] && grep -q 'mode must be' <<<"$out" || fail "a bad mode is a usage error: rc $rc: $out"
run
[ $rc -eq 2 ] || fail "no arguments is a usage error: rc $rc"

# Without CLAUDE_PROJECTS_DIR the directory comes from the main checkout's path.
home="$tmp/home"; enc="$(printf '%s' "$(dirname "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)")" | sed 's/[^A-Za-z0-9]/-/g')"; mkdir -p "$home/.claude/projects/$enc"
cp "$proj/sim1.jsonl" "$home/.claude/projects/$enc/"
: >"$SENT"; out="$(env -u CLAUDE_PROJECTS_DIR HOME="$home" TRANSCRIPT="$home/.claude/projects/$enc/sim1.jsonl" bash "$HERE/reset-teammate.sh" sim compact 5 2>&1)"; rc=$?
[ $rc -eq 0 ] && grep -q 'context before' <<<"$out" || fail "the transcript directory comes from the main checkout's path: rc $rc: $out"

# A copy outside any repository takes the repository of the directory it is run from.
mkdir -p "$tmp/loose"; cp "$HERE/reset-teammate.sh" "$tmp/loose/copy.sh"
: >"$SENT"; out="$(cd "$REPO" && env -u CLAUDE_PROJECTS_DIR HOME="$home" TRANSCRIPT="$home/.claude/projects/$enc/sim1.jsonl" bash "$tmp/loose/copy.sh" sim compact 5 2>&1)"; rc=$?
[ $rc -eq 0 ] && grep -q 'context before' <<<"$out" || fail "a copied script uses the repository it is run from: rc $rc: $out"

[ $fails -eq 0 ] && echo "reset-teammate: all cases pass"
exit $fails
