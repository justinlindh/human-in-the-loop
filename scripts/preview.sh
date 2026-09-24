#!/usr/bin/env bash
# Local playtest preview of the newest lane work: rebuilds branch preview/latest (never pushed) in a
# worktree from origin/main plus each lane worktree's current branch, applies any *.patch in the patches folder
# (integration changes that land with a later merge), and keeps a dev server on :5174.
# Usage: scripts/preview.sh    (run it again any time to refresh)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PREVIEW_DIR:-$HOME/src/gamedev-preview}"
PATCHES="${PREVIEW_PATCHES:-$HOME/.cache/hitl-preview}"
PORT="${PREVIEW_PORT:-5174}"
BRANCH="${PREVIEW_BRANCH:-preview/latest}"

git -C "$REPO" fetch -q origin
if [ ! -d "$DIR" ]; then
  git -C "$REPO" worktree add -q -B "$BRANCH" "$DIR" origin/main
fi
cd "$DIR"
git checkout -q "$BRANCH"
git reset -q --hard origin/main
git clean -qfd -e node_modules
# Share this checkout's install when it is a real, complete one for the same lockfile; otherwise install here.
if [ ! -e node_modules ]; then
  if cmp -s "$REPO/package-lock.json" package-lock.json && [ -d "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ] \
    && (cd "$REPO" && npm ls --depth=0 >/dev/null 2>&1); then
    ln -s "$REPO/node_modules" node_modules
  else
    npm ci >/dev/null
  fi
fi

# The branch checked out in each lane worktree (sim, art, ui, audio), when there is one.
LANES=()
for w in sim art ui audio; do
  b="$(git -C "$REPO/../gamedev-$w" branch --show-current 2>/dev/null || true)"
  [ -n "$b" ] && LANES+=("$b")
done
for lane in "${LANES[@]}"; do
  if ! git merge -q --no-edit "$lane" >/dev/null 2>&1; then
    echo "preview: $lane conflicts with main; left unmerged" >&2
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
echo "  main $(git -C "$REPO" rev-parse --short origin/main)"
for lane in "${LANES[@]}"; do echo "  $lane $(git -C "$REPO" rev-parse --short "$lane")"; done
for p in "$PATCHES"/*.patch; do echo "  patch $(basename "$p")"; done
