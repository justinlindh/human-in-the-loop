#!/usr/bin/env bash
# Claude Code PostToolUse hook for Bash, after `gh pr create`: turns on auto-merge when the PR isn't a
# draft and the command didn't (in the background), and warns when the description lacks an Affects
# section, a Gates run line, or a Fixes #n line. It reads the body from the command's --body/--body-file
# when it can, else from GitHub. Never blocks; fails open on its own errors.
set -f
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
grep -qE 'gh[[:space:]]+pr[[:space:]]+create' <<<"$cmd" || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input")"
out="$(jq -r '[.tool_response, .tool_result] | map(select(. != null) | if type == "string" then . else (.stdout // tojson) end) | join("\n")' <<<"$input" 2>/dev/null)"
url="$(grep -oE 'https://github\.com/[^/[:space:]]+/[^/[:space:]]+/pull/[0-9]+' <<<"$out" | tail -1)"
[ -n "$url" ] || exit 0
pr="${url##*/}"; repo="$(sed -E 's|https://github.com/([^/]+/[^/]+)/pull/.*|\1|' <<<"$url")"
notes=()
if ! grep -qE -- '--draft|(^|[[:space:]])-d([[:space:]]|$)' <<<"$cmd" && ! grep -qE "gh[[:space:]]+pr[[:space:]]+merge[^;&|]*--auto" <<<"$cmd"; then
  (cd "${cwd:-.}" && gh pr merge "$pr" -R "$repo" --auto --merge >/dev/null 2>&1 &)
  notes+=("Auto-merge was not turned on in that command; the hook is turning it on (gh pr merge $pr --auto --merge). Check it with gh pr view $pr.")
fi
body=""
f="$(grep -oE -- "(--body-file|-F)[= ]+(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" <<<"$cmd" | head -1)"
if [ -n "$f" ]; then
  f="${f#*[= ]}"; f="${f//\"/}"; f="${f//\'/}"; f="${f/#\~/$HOME}"
  case "$f" in *'$'*) ;; /*) body="$(cat "$f" 2>/dev/null)" ;; *) body="$(cat "$cwd/$f" 2>/dev/null)" ;; esac
fi
[ -n "$body" ] || body="$(timeout 10 gh pr view "$pr" -R "$repo" --json body --jq .body 2>/dev/null)"
if [ -n "$body" ]; then
  plain="$(sed -E 's/<!--.*-->//g' <<<"$body")"
  affects="$(awk '/^## Affects/ { on = 1; next } /^## / { on = 0 } on' <<<"$plain" | grep -vE '^[[:space:]]*-?[[:space:]]*$' || true)"
  [ -n "$affects" ] || notes+=("The Affects section is empty: list the teammates whose tools, checks or conventions this changes, or write None.")
  grep -qE '\*\*Gates run:\*\*[[:space:]]*[^[:space:]]' <<<"$plain" || notes+=("There is no Gates run line with content: say which gates you ran for this change and their result.")
  grep -qiE '(fixes|closes|resolves)[[:space:]]+#[0-9]+' <<<"$plain" || notes+=("There is no Fixes #n line. Add one if this PR closes an issue.")
fi
[ ${#notes[@]} -gt 0 ] || exit 0
msg="PR #$pr check (scripts/hooks/claude/pr-create-check.sh):"; for n in "${notes[@]}"; do msg+=$'\n'"- $n"; done
jq -n --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
