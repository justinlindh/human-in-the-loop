#!/usr/bin/env bash
# Read or replace one "## " section of a PR description, leaving the rest as it is.
#   scripts/pr-body.sh <pr> --show <heading>                       print that section
#   scripts/pr-body.sh <pr> --section <heading> --from <file|->    replace it (appended when absent)
#   ... --append                                                   add to the section instead of replacing
#   ... --dry-run                                                  print the new description, change nothing
# The new text is refused up front when it holds a local path (/home/..., /tmp/...): the PR-text
# hook refuses those anyway, after the gh call has been assembled.
set -euo pipefail
LOCAL_PATH='(/home/|/tmp/)'

# Lines inside a code fence never start or end a section.
# The section under "## <heading>" (heading match ignores case), without its heading line.
show_section() { # <heading> <body>
  awk -v h="$1" 'BEGIN { h = tolower(h) } /^(```|~~~)/ { fence = !fence } !fence && /^## / { t = tolower(substr($0, 4)); sub(/[[:space:]]+$/, "", t); if (on) exit; if (t == h) { on = 1; next } } on' <<<"$2"
}
# The body with the section replaced by the text in <file>, or extended with it (--append).
# Absent, the section is added at the end.
put_section() { # <heading> <file> <append: 0|1> <body>
  awk -v h="$1" -v f="$2" -v app="$3" '
    function emit(   l, first) { while ((getline l < f) > 0) print l; close(f) }
    BEGIN { hl = tolower(h) }
    /^(```|~~~)/ { fence = !fence }
    !fence && /^## / {
      t = tolower(substr($0, 4)); sub(/[[:space:]]+$/, "", t)
      skip = 0
      if (t == hl && !done) {
        done = 1
        if (app) { print; inapp = 1; next }
        print; print ""; emit(); print ""; skip = 1; next
      }
      if (inapp) { flush() }
    }
    function flush() { while (nb > 0 && buf[nb] ~ /^[[:space:]]*$/) nb--; for (i = 1; i <= nb; i++) print buf[i]; emit(); print ""; nb = 0; inapp = 0 }
    skip { next }
    inapp { buf[++nb] = $0; next }
    { print }
    END {
      if (inapp) flush()
      if (!done) { print ""; print "## " h; print ""; emit() }
    }' <<<"$4"
}
[ "${BASH_SOURCE[0]}" = "$0" ] || return 0

usage() { echo "usage: scripts/pr-body.sh <pr> --show <heading> | --section <heading> --from <file|-> [--append] [--dry-run]" >&2; exit 2; }
pr="${1:-}"; [ -n "$pr" ] || usage; shift
heading=''; show=''; from=''; append=0; dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --show) show="${2:?--show needs a heading}"; shift 2 ;;
    --section) heading="${2:?--section needs a heading}"; shift 2 ;;
    --from) from="${2:?--from needs a file or -}"; shift 2 ;;
    --append) append=1; shift ;;
    --dry-run) dry=1; shift ;;
    *) echo "pr-body: unknown option $1" >&2; usage ;;
  esac
done
body="$(gh pr view "$pr" --json body -q .body)"

if [ -n "$show" ]; then
  grep -qiE "^## $(sed 's/[][\.*^$/]/\\&/g' <<<"$show")[[:space:]]*$" <<<"$body" || { echo "pr-body: #$pr has no '## $show' section" >&2; exit 1; }
  show_section "$show" "$body"; exit 0
fi
[ -n "$heading" ] && [ -n "$from" ] || usage
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
if [ "$from" = - ]; then cat >"$tmp"; else [ -r "$from" ] || { echo "pr-body: can't read $from" >&2; exit 2; }; cat "$from" >"$tmp"; fi
if grep -nE "$LOCAL_PATH" "$tmp" >&2; then
  echo "pr-body: the new text has a local path (above). PR text never does: use repo paths, and scripts/pr-media.sh for media." >&2; exit 1
fi
[ -s "$tmp" ] || { echo "pr-body: the new text is empty" >&2; exit 2; }
new="$(put_section "$heading" "$tmp" "$append" "$body")"
if [ "$dry" = 1 ]; then printf '%s\n' "$new"; exit 0; fi
printf '%s\n' "$new" | gh pr edit "$pr" --body-file - >/dev/null
echo "#$pr: '## $heading' ${append:+$([ "$append" = 1 ] && echo appended to || echo replaced)}"
