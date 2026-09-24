#!/usr/bin/env bash
# Local playtest preview of the newest lane work: rebuilds branch preview/latest (never pushed) in a
# worktree from feat/one-shot plus the local lane heads, applies any *.patch in the patches folder
# (integration changes that land with a later merge), and keeps a dev server on :5174.
# Usage: scripts/preview.sh    (run it again any time to refresh)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PREVIEW_DIR:-$HOME/src/gamedev-preview}"
PATCHES="${PREVIEW_PATCHES:-$HOME/.cache/hitl-preview}"
PORT="${PREVIEW_PORT:-5174}"

git -C "$REPO" fetch -q origin
if [ ! -d "$DIR" ]; then
  git -C "$REPO" worktree add -q -B preview/latest "$DIR" feat/one-shot
  ln -s "$REPO/node_modules" "$DIR/node_modules"
fi
cd "$DIR"
git checkout -q preview/latest
git reset -q --hard feat/one-shot
git clean -qfd -e node_modules

for lane in lane/sim lane/art lane/ui; do
  if ! git merge -q --no-edit "$lane" >/dev/null 2>&1; then
    echo "preview: $lane conflicts with feat/one-shot; left unmerged" >&2
    git merge --abort
  fi
done

shopt -s nullglob
for p in "$PATCHES"/*.patch; do
  git apply --3way "$p" 2>/dev/null || echo "preview: $(basename "$p") no longer applies; skipped" >&2
done

if ! ss -ltn "sport = :$PORT" | grep -q LISTEN; then
  nohup npx vite --port "$PORT" --strictPort --host >"$DIR/.preview.log" 2>&1 &
  sleep 3
fi

echo "preview: http://localhost:$PORT/ (also on the LAN via --host)"
echo "  feat/one-shot $(git -C "$REPO" rev-parse --short feat/one-shot)"
for lane in lane/sim lane/art lane/ui; do echo "  $lane $(git -C "$REPO" rev-parse --short "$lane")"; done
for p in "$PATCHES"/*.patch; do echo "  patch $(basename "$p")"; done
