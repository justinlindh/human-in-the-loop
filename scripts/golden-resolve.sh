#!/usr/bin/env bash
# Resolves conflicts in the golden images (blender/checks/golden/*.png) by regenerating them from the
# merged code, never by picking a side: two branches that each changed a scene can only be judged by
# rendering the merge. Run it in a checkout where `git merge` stopped on those conflicts.
#   1. It refuses while any other file still conflicts (resolve and add those first).
#   2. It keeps both sides of each conflicted image, renders just those scenes with
#      `golden.mjs --update --only=<scenes>` (on the software render lock, taken by the harness), and
#      stages the new references.
#   3. It writes a sheet per scene (this branch | merged in | regenerated) under shots/golden-resolve/:
#      post them with scripts/pr-media.sh for review as an image diff, then commit the merge.
# Usage: scripts/golden-resolve.sh [--no-sheets]
#   GOLDEN_CMD replaces the render command (tests); it gets the scene list as $1.
set -uo pipefail
sheets=1; [ "${1:-}" = --no-sheets ] && sheets=0
top="$(git rev-parse --show-toplevel)" || exit 2
cd "$top"
git rev-parse -q --verify MERGE_HEAD >/dev/null || { echo "golden-resolve: no merge in progress here" >&2; exit 2; }
mapfile -t unmerged < <(git diff --name-only --diff-filter=U)
[ ${#unmerged[@]} -gt 0 ] || { echo "golden-resolve: nothing conflicts"; exit 0; }
golden=(); other=()
for f in "${unmerged[@]}"; do
  case "$f" in blender/checks/golden/*.actual.png|blender/checks/golden/*.diff.png) other+=("$f") ;;
               blender/checks/golden/*.png) golden+=("$f") ;;
               *) other+=("$f") ;; esac
done
if [ ${#other[@]} -gt 0 ]; then
  echo "golden-resolve: resolve these first (the render needs the merged code), git add them, and run again:" >&2
  printf '  %s\n' "${other[@]}" >&2
  exit 1
fi
[ ${#golden[@]} -gt 0 ] || { echo "golden-resolve: no golden images conflict"; exit 0; }
scenes="$(for f in "${golden[@]}"; do basename "$f" .png; done | paste -sd, -)"
echo "golden-resolve: regenerating $scenes from the merged code"
keep="$top/shots/golden-resolve"; mkdir -p "$keep"
for f in "${golden[@]}"; do
  s="$(basename "$f" .png)"
  git show ":2:$f" >"$keep/$s.this-branch.png" 2>/dev/null
  git show ":3:$f" >"$keep/$s.merged-in.png" 2>/dev/null
  git checkout -q --theirs -- "$f"
done
if [ -n "${GOLDEN_CMD:-}" ]; then bash -c "$GOLDEN_CMD" _ "$scenes"
else HITL_NO_CHECK_CACHE=1 timeout 1200 nice -n 10 node blender/checks/golden.mjs --update "--only=$scenes"; fi
rc=$?
[ $rc -eq 0 ] || { echo "golden-resolve: the render failed (exit $rc); the images are left as the merged-in side, unstaged" >&2; exit 1; }
git add -- "${golden[@]}"
for f in "${golden[@]}"; do
  s="$(basename "$f" .png)"
  cp "$f" "$keep/$s.regenerated.png"
  [ $sheets = 1 ] && bash "$top/scripts/sheet.sh" grid "$keep/$s.sheet.png" --cols 3 \
    "$keep/$s.this-branch.png" "$keep/$s.merged-in.png" "$keep/$s.regenerated.png" >/dev/null
done
echo "golden-resolve: regenerated and staged ${#golden[@]} image(s)."
[ $sheets = 1 ] && echo "golden-resolve: review sheets in shots/golden-resolve/*.sheet.png; post them with scripts/pr-media.sh --comment <pr> shots/golden-resolve/*.sheet.png, then commit the merge."
exit 0
