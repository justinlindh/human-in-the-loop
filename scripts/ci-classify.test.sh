#!/usr/bin/env bash
# Cases for scripts/ci-classify.sh with the repository's scripts/ci-skip-paths. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LIST="$HERE/ci-skip-paths"
fails=0
expect() { # <want> <paths separated by |>
  local want="$1" got
  for nl in '' $'\n'; do
    got="$(printf '%s%s' "$2" "$nl" | tr '|' '\n' | bash "$HERE/ci-classify.sh" "$LIST")"
    [ "$got" = "$want" ] || { echo "FAIL [$2]${nl:+ (trailing newline)}: want $want, got $got"; fails=$((fails + 1)); }
  done
}
expect light 'docs/a.md|CLAUDE.md|blender/logo/build.py'
expect light '.github/pull_request_template.md|README.md'
expect light '.github/ISSUE_TEMPLATE/bug.md'
expect full 'docs/a.md|src/sim/tick.js'
expect full 'docs/a.md|scripts/ci-skip-paths'
expect full 'docs/a.md|scripts/ci-classify.sh'
expect full 'src/ui/notes.md'
expect full 'public/audio/LICENSES.md'
expect full '.github/workflows/notes.md'
expect full '.github/workflows/ci.yml'
expect full '.github/CODEOWNERS.md'
expect full 'docs/package.json'
expect full 'package-lock.json'
expect full 'blender/characters/chibi.py'
expect full ''
[ "$(echo docs/a.md | bash "$HERE/ci-classify.sh" /nonexistent)" = full ] || { echo "FAIL missing list: want full"; fails=$((fails + 1)); }

# Moving game code into docs/ must not come out light: CI lists changes with --no-renames.
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
( cd "$tmp" && git init -q && mkdir -p src/sim docs && echo 'export function tick() {}' >src/sim/tick.js && echo x >docs/x.md \
  && git add -A && git -c user.name=t -c user.email=t@t commit -qm base \
  && git mv src/sim/tick.js docs/tick.js && git -c user.name=t -c user.email=t@t commit -qm move )
got="$(git -C "$tmp" diff --name-only --no-renames HEAD~1 HEAD | bash "$HERE/ci-classify.sh" "$LIST")"
[ "$got" = full ] || { echo "FAIL moving src/sim/tick.js into docs/: want full, got $got"; fails=$((fails + 1)); }

[ $fails -eq 0 ] && echo "ci-classify: all cases pass" || echo "ci-classify: $fails failing"
[ $fails -eq 0 ]
