#!/usr/bin/env bash
# Finds a lane's session transcript. Usage: lane-transcript.sh <projects-dir> <name> [--all]
# Candidates are the .jsonl files there, touched in the last day, whose first lines hold the lane's
# spawn brief ("You are `<name>`"). By default prints the one written last (newest last record
# timestamp; a file's mtime can be touched by anything, so it is only the fallback for a file with
# no timestamps). --all prints every candidate. Exit 1 and no output when there is none.
set -uo pipefail
proj="${1:?projects dir}"; name="${2:?name}"; all="${3:-}"
candidates() {
  local f
  for f in $(find "$proj" -maxdepth 1 -name '*.jsonl' -mmin -1440 -printf '%p\n' 2>/dev/null); do
    # Not head | grep -q: grep stops at the match, head dies of SIGPIPE on the rest of these large
    # lines, and pipefail turns that into no match.
    grep -q "You are \`$name\`" < <(head -n 20 "$f") && echo "$f"
  done
}
last_at() {
  local t; t="$(tac "$1" | grep -m1 -o '"timestamp":"[^"]*"' | cut -d'"' -f4)"
  [ -n "$t" ] || t="$(date -u -d "@$(stat -c %Y "$1")" +%FT%T.000Z)"
  echo "$t"
}
if [ "$all" = --all ]; then out="$(candidates)"
else
  out="$(for f in $(candidates); do echo "$(last_at "$f") $f"; done | sort -r | head -1 | cut -d' ' -f2-)"
fi
[ -n "$out" ] || exit 1
echo "$out"
