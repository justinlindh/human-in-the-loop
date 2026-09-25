#!/usr/bin/env bash
# Claude Code PreToolUse hook for Edit, Write and NotebookEdit: keeps each lane's edits to its own
# paths. The lane is the branch prefix (<lane>/<topic>); the shared checkout on main is team-lead's.
# The paths per lane are in lanes.txt next to this script, for any checkout of this repository. An edit outside them is denied (exit 2)
# unless the worktree's $(git rev-parse --git-dir)/hitl-lane-allow lists it (for an edit the owning
# lane agreed to). Files outside this repository, detached checkouts and unlisted prefixes are not
# checked, and it fails open on its own errors.
set -f
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$file" ] || exit 0
case "$file" in /*) ;; *) cwd="$(jq -r '.cwd // empty' <<<"$input")"; file="$cwd/$file" ;; esac
dir="$(dirname "$file")"; while [ ! -d "$dir" ] && [ "$dir" != / ]; do dir="$(dirname "$dir")"; done
top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || exit 0
# The lane map next to this script applies to every checkout of this repository (same git common dir).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lanes="$here/lanes.txt"
[ -r "$lanes" ] || exit 0
same() { local d; d="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && echo "$d"; }
[ "$(same "$top")" = "$(same "$here")" ] || exit 0
branch="$(git -C "$top" branch --show-current 2>/dev/null)"
[ -n "$branch" ] || exit 0
lane="${branch%%/*}"
line="$(awk -v l="$lane" '$1 == l { $1 = ""; print }' "$lanes")"
[ -n "$line" ] || exit 0
rel="$(realpath -m --relative-to="$top" "$file" 2>/dev/null)" || exit 0
case "$rel" in ../*) exit 0 ;; esac
allowed="$line $(awk '$1 == "*" { $1 = ""; print }' "$lanes") $(cat "$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)/hitl-lane-allow" 2>/dev/null | tr '\n' ' ')"
for p in $allowed; do
  case "$p" in
    */) case "$rel" in "$p"*) exit 0 ;; esac ;;
    *) [ "$rel" = "$p" ] && exit 0 ;;
  esac
done
owner="$(awk -v r="$rel" '$1 != "*" && $1 != "main" { for (i = 2; i <= NF; i++) { p = $i; if ((substr(p, length(p)) == "/" && index(r, p) == 1) || r == p) { print $1; exit } } }' "$lanes")"
echo "Blocked by the team's hook (scripts/hooks/claude/lane-guard.sh): $rel is outside the $lane lane (branch $branch)${owner:+; it belongs to $owner}. Message its owner instead. If the owner agreed to this edit, record it: echo '$rel' >> \"\$(git rev-parse --git-dir)/hitl-lane-allow\"" >&2
exit 2
