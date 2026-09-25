#!/usr/bin/env bash
# Puts evidence media on a pull request or an issue without local paths. Files are committed to the
# orphan branch pr-media of this repository (never merged; no history shared with the code) under
# pr-<n>/ or issue-<n>/ (site-<n>/ or site-issue-<n>/ for the site repository), and the script prints
# markdown that renders on GitHub.
# Usage: scripts/pr-media.sh [--comment] [--issue] [--repo <owner/name>] <number> <file>...
#   --comment   also posts the markdown as a comment on the PR or issue
#   --issue     the number is an issue, not a PR
#   --repo      the repository the PR or issue is in: justinlindh/human-in-the-loop (the default) or
#               justinlindh/humanintheloopgame-site. It must exist there.
# PNG/JPEG over 1 MB are downscaled to 1600 px wide; files over 25 MB are refused. Videos also get
# a small GIF preview that shows inline.
set -euo pipefail

usage="usage: scripts/pr-media.sh [--comment] [--issue] [--repo <owner/name>] <number> <file>..."
comment=0; repo=""; kind=pr
while [ $# -gt 0 ]; do
  case "$1" in
    --comment) comment=1; shift ;;
    --issue) kind=issue; shift ;;
    --repo) repo="${2:?$usage}"; shift 2 ;;
    -*) echo "$usage" >&2; exit 1 ;;
    *) break ;;
  esac
done
pr="${1:?$usage}"; shift
[ "$#" -gt 0 ] || { echo "pr-media: no files given" >&2; exit 1; }
case "$pr" in *[!0-9]*) echo "pr-media: the $kind number must be a number: $pr" >&2; exit 1 ;; esac
# The script works inside its own worktree, so file arguments are resolved against the caller's directory first.
files=()
for f in "$@"; do files+=("$(realpath -m -- "$f")"); done
set -- "${files[@]}"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="$(cd "$REPO" && gh repo view --json nameWithOwner --jq .nameWithOwner)"
# The media always lives on this repository's pr-media branch; --repo picks the PR it belongs to.
case "${repo:-justinlindh/human-in-the-loop}" in
  justinlindh/human-in-the-loop) target=justinlindh/human-in-the-loop; dir="$kind-$pr" ;;
  justinlindh/humanintheloopgame-site) target=justinlindh/humanintheloopgame-site; dir="site-$pr"; [ $kind = issue ] && dir="site-issue-$pr" ;;
  *) echo "pr-media: --repo must be justinlindh/human-in-the-loop or justinlindh/humanintheloopgame-site" >&2; exit 1 ;;
esac
gh "$kind" view -R "$target" "$pr" --json number >/dev/null 2>&1 || { echo "pr-media: no $kind #$pr in $target" >&2; exit 1; }
WT="${PR_MEDIA_WORKTREE:-$HOME/.cache/hitl-pr-media}"
MAX=$((25 * 1024 * 1024))
BIG=$((1024 * 1024))

# A dedicated worktree on pr-media, so the shared worktree is never touched.
if [ ! -d "$WT/.git" ] && [ ! -f "$WT/.git" ]; then
  git -C "$REPO" fetch -q origin
  if git -C "$REPO" ls-remote --exit-code --heads origin pr-media >/dev/null; then
    git -C "$REPO" worktree add -q -B pr-media "$WT" origin/pr-media
  else
    git -C "$REPO" worktree add -q --orphan -b pr-media "$WT"
  fi
fi
cd "$WT"
if git ls-remote --exit-code --heads origin pr-media >/dev/null; then
  git fetch -q origin pr-media
  git reset -q --hard origin/pr-media
fi

mkdir -p "$dir"
md=""
url() { echo "https://github.com/$SLUG/blob/pr-media/$dir/$1?raw=true"; }
for f in "$@"; do
  [ -f "$f" ] || { echo "pr-media: not a file: $f" >&2; exit 1; }
  name="$(basename "$f")"
  size=$(stat -c %s "$f")
  case "${name,,}" in
    *.png|*.jpg|*.jpeg)
      if [ "$size" -gt "$BIG" ]; then
        magick "$f" -resize '1600x>' "$dir/$name"
      else
        cp "$f" "$dir/$name"
      fi
      md+="![${name%.*}]($(url "$name"))"$'\n\n' ;;
    *.gif)
      [ "$size" -le "$MAX" ] || { echo "pr-media: $name is over 25 MB" >&2; exit 1; }
      cp "$f" "$dir/$name"
      md+="![${name%.*}]($(url "$name"))"$'\n\n' ;;
    *.mp4|*.webm|*.mov)
      [ "$size" -le "$MAX" ] || { echo "pr-media: $name is over 25 MB; trim or re-encode it" >&2; exit 1; }
      cp "$f" "$dir/$name"
      preview="${name%.*}-preview.gif"
      timeout 300 nice -n 10 ffmpeg -loglevel error -y -t 8 -i "$f" -vf 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse' "$dir/$preview"
      md+="![${name%.*} preview]($(url "$preview"))"$'\n'"[${name} (full video)]($(url "$name"))"$'\n\n' ;;
    *.mp3|*.ogg|*.wav|*.m4a|*.flac)
      [ "$size" -le "$MAX" ] || { echo "pr-media: $name is over 25 MB" >&2; exit 1; }
      cp "$f" "$dir/$name"
      md+="[${name} (audio)]($(url "$name"))"$'\n\n' ;;
    *)
      [ "$size" -le "$MAX" ] || { echo "pr-media: $name is over 25 MB" >&2; exit 1; }
      cp "$f" "$dir/$name"
      md+="[${name}]($(url "$name"))"$'\n\n' ;;
  esac
done

git add "$dir"
if ! git diff --cached --quiet; then
  git commit -q -m "Media for $target $kind $pr"
  git push -q -u origin pr-media 2>/dev/null || { echo "pr-media: push failed" >&2; exit 1; }
fi

printf '%s' "$md"
if [ "$comment" = 1 ]; then
  tmp="$(mktemp)"
  printf '%s' "$md" >"$tmp"
  gh "$kind" comment -R "$target" "$pr" --body-file "$tmp"
  rm -f "$tmp"
fi
