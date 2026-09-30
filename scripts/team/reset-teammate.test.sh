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
  capture-pane) printf '%b\n' "${PANE_TEXT:-}" ;;
  send-keys) echo "$*" >>"$SENT"; [ "$4" = /compact ] && [ -z "${STICK:-}" ] && echo '{"type":"system","subtype":"compact_boundary"}' >>"$TRANSCRIPT" ;;
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
export SENT="$tmp/sent" TRANSCRIPT="$proj/sim1.jsonl" CLAUDE_PROJECTS_DIR="$proj" RESET_POLL=0 PATH="$tmp/bin:$PATH" PANE_TEXT='ready\n  @sim'
run() { out="$(bash "$HERE/reset-teammate.sh" "$@" 2>&1)"; rc=$?; }

: >"$SENT"; run sim compact 5 --log "$tmp/log"
[ $rc -eq 0 ] && grep -q 'context before: 90010 tokens' <<<"$out" && grep -q -- '-t %1 /compact Enter' "$SENT" || fail "a compact is sent, confirmed and sized: rc $rc: $out"
grep -q "sim	compact	pre=90010	transcript=sim1.jsonl" "$tmp/log" || fail "--log appends a row: $(cat "$tmp/log" 2>/dev/null)"

: >"$SENT"; run sim clear 5
[ $rc -eq 0 ] && grep -q '/clear Enter' "$SENT" || fail "a clear is sent: rc $rc: $out"

STICK=1 run sim compact 1
[ $rc -eq 1 ] && grep -q 'not confirmed' <<<"$out" || fail "a compact the transcript never shows is not confirmed: rc $rc: $out"

: >"$SENT"; PANE_TEXT='working… (3s)\n  @sim' run sim compact 1
[ $rc -eq 1 ] && grep -q 'still busy' <<<"$out" && [ ! -s "$SENT" ] || fail "a busy pane is not sent to: rc $rc: $out"

PANE_TEXT='ready\n  @other' run sim compact 1
[ $rc -eq 1 ] && grep -q 'no pane shows @sim' <<<"$out" || fail "no pane for the name: rc $rc: $out"

run nobody compact 1
[ $rc -eq 1 ] || fail "a teammate with no brief in a transcript is refused: rc $rc: $out"

run sim reset 1
[ $rc -eq 2 ] && grep -q 'mode must be' <<<"$out" || fail "a bad mode is a usage error: rc $rc: $out"
run
[ $rc -eq 2 ] || fail "no arguments is a usage error: rc $rc"

# Without CLAUDE_PROJECTS_DIR the directory comes from the repo path.
home="$tmp/home"; enc="$(printf '%s' "$REPO" | sed 's/[^A-Za-z0-9]/-/g')"; mkdir -p "$home/.claude/projects/$enc"
cp "$proj/sim1.jsonl" "$home/.claude/projects/$enc/"
: >"$SENT"; out="$(env -u CLAUDE_PROJECTS_DIR HOME="$home" TRANSCRIPT="$home/.claude/projects/$enc/sim1.jsonl" bash "$HERE/reset-teammate.sh" sim compact 5 2>&1)"; rc=$?
[ $rc -eq 0 ] && grep -q 'context before' <<<"$out" || fail "the transcript directory comes from the repo path: rc $rc: $out"

[ $fails -eq 0 ] && echo "reset-teammate: all cases pass"
exit $fails
