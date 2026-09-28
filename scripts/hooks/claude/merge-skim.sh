#!/usr/bin/env bash
# Claude Code PostToolUse hook for Bash: after a command merges origin/main into a checkout (git merge
# origin/main, git pull origin main), lists the tooling and contract commits the merge brought in
# (scripts/, blender/checks/, docs/toolkit.md, docs/toolkit/, src/contract/) and any new toolkit page,
# so the session needn't skim the log by hand. Silent for every other command, for a merge that brought
# none of those, and for a merge it already reported. Never blocks; fails open on its own errors.
set -f
input="$(cat)" || exit 0
case "$input" in *origin/main*|*"origin main"*) ;; *) exit 0 ;; esac
command -v jq >/dev/null 2>&1 || exit 0
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
# Commands outside heredoc bodies, one per line.
lines="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
  | sed -E 's/&&|\|\||;|\|/\n/g')"
MERGE='git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?(merge[[:space:]].*origin/main|pull[[:space:]].*origin[[:space:]]+main)'
dir="$cwd"; found=""
while IFS= read -r l; do
  l="${l#"${l%%[![:space:]]*}"}"
  if [[ "$l" =~ ^cd[[:space:]]+([^[:space:]]+) ]]; then d="${BASH_REMATCH[1]}"; d="${d//\"/}"; d="${d//\'/}"; d="${d/#\~/$HOME}"
    case "$d" in /*) dir="$d" ;; *) dir="$dir/$d" ;; esac
  elif grep -qE "(^|[[:space:]])$MERGE" <<<"$l"; then
    [[ "$l" =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]] && { d="${BASH_REMATCH[1]//\"/}"; d="${d/#\~/$HOME}"; case "$d" in /*) found="$d" ;; *) found="$dir/$d" ;; esac; } || found="$dir"
  fi
done <<<"$lines"
[ -n "$found" ] || exit 0
top="$(git -C "$found" rev-parse --show-toplevel 2>/dev/null)" || exit 0
grep -qE '^(merge origin/main|pull)' <<<"$(git -C "$top" reflog -1 --format=%gs 2>/dev/null)" || exit 0
head="$(git -C "$top" rev-parse HEAD 2>/dev/null)" && orig="$(git -C "$top" rev-parse -q --verify ORIG_HEAD 2>/dev/null)" || exit 0
state="$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)/hitl-merge-skim"
[ "$(cat "$state" 2>/dev/null)" = "$head" ] && exit 0
echo "$head" >"$state" 2>/dev/null
paths=(scripts blender/checks docs/toolkit.md docs/toolkit src/contract)
log="$(git -C "$top" log --no-merges --format='  %h %s' "$orig..$head" -- "${paths[@]}" 2>/dev/null)"
pages="$(git -C "$top" diff --diff-filter=A --name-only "$orig" "$head" -- docs/toolkit/ 2>/dev/null | sed 's|^docs/toolkit/||; s|\.md$||' | paste -sd' ' -)"
[ -n "$log" ] || exit 0
n="$(wc -l <<<"$log")"
msg="That merge of origin/main brought in $n tooling or contract commit(s):"$'\n'"$(head -10 <<<"$log")"
[ "$n" -gt 10 ] && msg+=$'\n'"  ... and $((n - 10)) more (git log --no-merges ORIG_HEAD..HEAD -- ${paths[*]})"
[ -n "$pages" ] && msg+=$'\n'"New toolkit pages: $pages (npm run toolkit -- --grep <name>)."
msg+=$'\n'"Reach for these before hand-rolled ones."
jq -n --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
exit 0
