#!/usr/bin/env bash
# Publishes feature-inventory media under stable names on the orphan branch feature-media (never merged),
# so docs/features entries can link <id>.webp or <id>.mp4 without binaries entering main.
# Usage: scripts/feature-media/publish.sh <file>...
#   .png         becomes <name>.webp (max 1280 px wide)
#   .mp4         is copied, and a <name>.gif preview (8 s, 480 px) is made next to it
#   .webp/.gif   are copied
# The file's basename (minus extension) is the stable name, so name each file after its inventory id.
# Prints the markdown url of each published file. Re-publishing a name replaces it.
set -euo pipefail
[ "$#" -gt 0 ] || { echo "usage: scripts/feature-media/publish.sh <file>..." >&2; exit 1; }
files=()
for f in "$@"; do [ -f "$f" ] || { echo "publish: not a file: $f" >&2; exit 1; }; files+=("$(realpath -- "$f")"); done

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SLUG="$(cd "$REPO" && gh repo view --json nameWithOwner --jq .nameWithOwner)"
WT="${FEATURE_MEDIA_WORKTREE:-$HOME/.cache/hitl-feature-media}"
if [ ! -e "$WT/.git" ]; then
  git -C "$REPO" fetch -q origin
  if git -C "$REPO" ls-remote --exit-code --heads origin feature-media >/dev/null; then
    git -C "$REPO" worktree add -q -B feature-media "$WT" origin/feature-media
  else
    git -C "$REPO" worktree add -q --orphan -b feature-media "$WT"
  fi
fi
cd "$WT"
if git ls-remote --exit-code --heads origin feature-media >/dev/null; then
  git fetch -q origin feature-media
  git reset -q --hard origin/feature-media
fi

url() { echo "https://github.com/$SLUG/blob/feature-media/$1?raw=true"; }
out=""
for f in "${files[@]}"; do
  base="$(basename "$f")"; name="${base%.*}"
  case "${base,,}" in
    *.png) magick "$f" -resize '1280x>' -quality 82 "$name.webp"; made=("$name.webp") ;;
    *.mp4)
      cp "$f" "$name.mp4"
      timeout 300 nice -n 10 ffmpeg -loglevel error -y -t 8 -i "$f" -vf 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse' "$name.gif"
      made=("$name.mp4" "$name.gif") ;;
    *.webp|*.gif) cp "$f" "$base"; made=("$base") ;;
    *) echo "publish: unsupported file type: $base" >&2; exit 1 ;;
  esac
  for m in "${made[@]}"; do out+="$m  $(url "$m")"$'\n'; done
done
git add -A .
if ! git diff --cached --quiet; then
  git commit -q -m "Feature media: ${files[*]##*/}"
  git push -q -u origin feature-media || { echo "publish: push failed" >&2; exit 1; }
fi
printf '%s' "$out"
