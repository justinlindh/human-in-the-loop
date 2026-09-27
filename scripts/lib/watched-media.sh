#!/usr/bin/env bash
# Whether a pass verdict names the PR's media as watched (scripts/review-verdict.sh calls it before
# posting a pass). A PR is judged by its media when it changes what a player sees or hears
# (src/render/, src/ui/, src/audio/, public/models/) or its body has a Screenshots or Clips entry.
# Its media is every image, video and audio file linked from the pr-media branch in its body or in
# comments from a login in scripts/ci-trusted (a video's GIF preview comes with the video; scripts
# and text are not media). Each must be named by a --watched flag, or by --superseded when a later
# file replaced it: its URL or its file name. A PR
# judged by its media with none posted cannot pass until the author posts some. --code-only
# "<why>" lets the pass through without media; review-verdict.sh prints the reason in the verdict.
# Usage: scripts/lib/watched-media.sh <pr> [--watched <url or file>]... [--superseded <url or file>]...
#          [--code-only <why>] [--repo <owner/name>]
# Exit 0 when the verdict may pass, 1 with the reason when it may not, 2 on usage or lookup errors.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
usage="usage: watched-media.sh <pr> [--watched <url or file>]... [--superseded <url or file>]... [--code-only <why>] [--repo <owner/name>]"
pr="${1:?$usage}"; shift
R=(); watched=(); why=""
while [ $# -gt 0 ]; do
  case "$1" in
    --watched|--superseded) watched+=("${2:?$usage}"); shift 2 ;;
    --code-only) why="${2:?$usage}"; shift 2 ;;
    --repo) R=(-R "${2:?$usage}"); shift 2 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
[ -n "$why" ] && exit 0
VISIBLE='^(src/render/|src/ui/|src/audio/|public/models/)'
MEDIA='\.(png|jpe?g|gif|webp|mp4|webm|mov|mkv|wav|mp3|ogg|flac|m4a)$'
# A URL or a file name, reduced to the file name.
name() { sed -E 's/[?#].*//; s|.*/||' <<<"$1"; }

trusted="$(grep -Ev '^[[:space:]]*(#|$)' "$HERE/ci-trusted" | jq -Rnc '[inputs]')"
view="$(gh pr view "${R[@]}" "$pr" --json body,comments,files)" || { echo "watched-media: can't read #$pr" >&2; exit 2; }
body="$(jq -r '.body' <<<"$view")"
text="$(jq -r --argjson t "$trusted" '.body, (.comments[] | select(.author.login as $a | $t | index($a)) | .body)' <<<"$view")"
media="$(grep -oE 'pr-media/(site-)?((pr|issue)-)?[0-9]+/[^])?" [:space:]]+' <<<"$text" | sed 's|.*/||' \
  | grep -iE "$MEDIA" | sort -u)"
media="$(while read -r m; do
  [ -n "$m" ] || continue
  case "$m" in *-preview.gif) grep -qE "^${m%-preview.gif}\.[A-Za-z0-9]+$" <<<"$media" && continue ;; esac
  echo "$m"
done <<<"$media")"

visible="$(jq -r '.files[].path' <<<"$view" | grep -E "$VISIBLE" | head -3 | tr '\n' ' ' | sed 's/ $//')"
# A Screenshots or Clips entry: a heading of that name, or a labelled line with something after the
# label once the template's comment is gone, other than "none" or "not applicable".
entry="$(sed 's/<!--.*-->//g' <<<"$body" \
  | grep -iE '^#+[[:space:]]*(screenshots|clips)\b|^[-*[:space:]]*\**(screenshots|clips)[^:]*:[*_]*[[:space:]]*[^*_[:space:]]' \
  | grep -viE ':[*_]*[[:space:]]*(none|n/?a|not applicable)\b' | head -1)"
[ -n "$visible" ] || [ -n "$entry" ] || [ -n "$media" ] || exit 0
reason="${visible:+changes $visible}"; [ -n "$reason" ] || reason="has screenshots or clips"

if [ -z "$media" ]; then
  echo "watched-media: #$pr $reason and has no media on it: ask the author for a screenshot or clip (scripts/pr-media.sh), or pass with --code-only \"<why>\""
  exit 1
fi
named="$(for w in ${watched[@]+"${watched[@]}"}; do name "$w"; done | sort -u)"
unknown="$(comm -23 <(printf '%s\n' "$named" | grep -v '^$') <(printf '%s\n' "$media"))"
missing="$(comm -13 <(printf '%s\n' "$named" | grep -v '^$') <(printf '%s\n' "$media"))"
if [ -n "$unknown" ]; then
  echo "watched-media: #$pr has no media named:"; sed 's/^/  /' <<<"$unknown"
  echo "its media is:"; sed 's/^/  /' <<<"$media"
  exit 1
fi
if [ -n "$missing" ]; then
  echo "watched-media: #$pr $reason; watch these and name each with --watched <file> (or --superseded <file> when a later file replaced it), or pass with --code-only \"<why>\":"
  sed 's/^/  /' <<<"$missing"
  exit 1
fi
exit 0
