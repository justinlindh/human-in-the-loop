#!/usr/bin/env bash
# Whether a pass verdict records that the PR's media was watched (scripts/review-verdict.sh calls it
# before posting a pass). A PR is judged by its media when it has any (pr-media links in its body, or
# in comments from a login in scripts/ci-trusted) or when it changes what a player sees or hears
# (src/render/, src/ui/, src/audio/, public/models/, the golden images). Its pass must then carry a
# "Watched:" line naming every media file: image, video or audio (a video's GIF preview is covered
# by the video; attached scripts and text are not media). A visible change with no media at all
# cannot pass: the author posts media first.
# Usage: scripts/lib/watched-media.sh <pr> <body-file> [--repo <owner/name>]
# Exit 0 when the verdict may pass, 1 with the reason when it may not, 2 on lookup errors.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
pr="${1:?usage: watched-media.sh <pr> <body-file> [--repo <owner/name>]}"; body="${2:?body file}"; shift 2
R=()
[ "${1:-}" = --repo ] && R=(-R "${2:?--repo needs a name}")
VISIBLE='^(src/render/|src/ui/|src/audio/|public/models/|blender/checks/golden/)'

trusted="$(grep -Ev '^[[:space:]]*(#|$)' "$HERE/ci-trusted" | jq -Rnc '[inputs]')"
view="$(gh pr view "${R[@]}" "$pr" --json body,comments,files)" || { echo "watched-media: can't read #$pr" >&2; exit 2; }
text="$(jq -r --argjson t "$trusted" '.body, (.comments[] | select(.author.login as $a | $t | index($a)) | .body)' <<<"$view")"
media="$(grep -oE 'pr-media/(pr|issue)-[0-9]+/[^])?" [:space:]]+' <<<"$text" | sed 's|.*/||' \
  | grep -iE '\.(png|jpe?g|gif|webp|mp4|webm|mov|mkv|wav|mp3|ogg|flac|m4a)$' | sort -u)"
# A video's GIF preview comes with the video.
media="$(while read -r m; do
  [ -n "$m" ] || continue
  case "$m" in *-preview.gif) grep -qE "^${m%-preview.gif}\.[A-Za-z0-9]+$" <<<"$media" && continue ;; esac
  echo "$m"
done <<<"$media")"
visible="$(jq -r '.files[].path' <<<"$view" | grep -E "$VISIBLE" | head -3)"
[ -n "$media" ] || [ -n "$visible" ] || exit 0

if [ -z "$media" ]; then
  echo "watched-media: #$pr changes what a player sees or hears ($(tr '\n' ' ' <<<"$visible" | sed 's/ $//')) and has no media: ask the author for a screenshot or clip (scripts/pr-media.sh), then judge from it"
  exit 1
fi
watched="$(grep -iE '^[*_ ]*watched[*_ ]*:' "$body" || true)"
if [ -z "$watched" ]; then
  echo "watched-media: #$pr has media; a pass needs a 'Watched:' line naming each file you watched:"
  sed 's/^/  /' <<<"$media"
  exit 1
fi
missing="$(while read -r m; do grep -qF -- "$m" <<<"$watched" || echo "$m"; done <<<"$media")"
if [ -n "$missing" ]; then
  echo "watched-media: #$pr: the 'Watched:' line doesn't name these media files; watch them and name them:"
  sed 's/^/  /' <<<"$missing"
  exit 1
fi
exit 0
