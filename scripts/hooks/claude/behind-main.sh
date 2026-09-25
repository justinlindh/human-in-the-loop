#!/usr/bin/env bash
# Claude Code SessionStart and UserPromptSubmit hook: tells the session when its checkout is behind
# origin/main, with the tooling and contract commits it is missing (scripts/, blender/checks/,
# docs/toolkit.md and docs/toolkit/, src/contract/). Silent when up to date, and each turn repeats it only when the
# count changed. It never waits on the network: it starts a quiet fetch in the background at most
# once every two minutes, so the next notice is current. Fails open on its own errors.
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"; event="$(jq -r '.hook_event_name // empty' <<<"$input" 2>/dev/null)"
[ -n "$cwd" ] || exit 0
top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -r "$top/scripts/hooks/claude/lanes.txt" ] || exit 0
gitdir="$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
common="$(git -C "$top" rev-parse --git-common-dir 2>/dev/null)"; case "$common" in /*) ;; *) common="$top/$common" ;; esac
stamp="$common/FETCH_HEAD"
if [ -z "$(find "$stamp" -mmin -2 2>/dev/null)" ]; then (git -C "$top" fetch -q origin main >/dev/null 2>&1 &) ; fi
behind="$(git -C "$top" rev-list --count HEAD..origin/main 2>/dev/null)" || exit 0
state="$gitdir/hitl-behind-notice"
if [ "$behind" = 0 ]; then rm -f "$state"; exit 0; fi
key="$behind $(git -C "$top" rev-parse --short origin/main)"
[ "$event" = UserPromptSubmit ] && [ "$(cat "$state" 2>/dev/null)" = "$key" ] && exit 0
echo "$key" >"$state" 2>/dev/null
branch="$(git -C "$top" branch --show-current)"; branch="${branch:-detached HEAD}"
msg="This checkout ($branch) is $behind commit(s) behind origin/main."
tools="$(git -C "$top" log --format='  %h %s' HEAD..origin/main -- scripts/ blender/checks/ docs/toolkit.md docs/toolkit/ src/contract/ 2>/dev/null)"
if [ -n "$tools" ]; then
  n="$(wc -l <<<"$tools")"
  msg+=$'\n'"Tooling or contract changes you don't have yet ($n):"$'\n'"$(head -n 6 <<<"$tools")"
  [ "$n" -gt 6 ] && msg+=$'\n'"  ...and $((n - 6)) more"
  msg+=$'\n'"Merge origin/main into your branch before relying on them."
fi
jq -n --arg e "$event" --arg m "$msg" '{hookSpecificOutput: {hookEventName: $e, additionalContext: $m}}'
