#!/usr/bin/env bash
# Claude Code PostToolUse hook for Bash, after `gh pr create`: turns on auto-merge when the PR isn't a
# draft and the command didn't (in the background), and warns when the description lacks an Affects
# section, a Gates run entry (inline or as sub-bullets), or a Fixes #n or Refs #n line. It reads the body from the command's --body/--body-file
# when it can, else from GitHub. Never blocks; fails open on its own errors.
set -f
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
# Only a real invocation counts: heredoc bodies and quoted strings are text, and `gh pr create` must
# sit in command position (line start, or after ; & | or a paren, optionally behind VAR=value).
outside="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd")"
bare="$(sed -E "s/'[^']*'//g; s/\"([^\"\\\\]|\\\\.)*\"//g" <<<"$outside")"
grep -qE '(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*[[:space:]]+)*gh[[:space:]]+pr[[:space:]]+create' <<<"$bare" || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input")"
out="$(jq -r '[.tool_response, .tool_result] | map(select(. != null) | if type == "string" then . else (.stdout // tojson) end) | join("\n")' <<<"$input" 2>/dev/null)"
# gh pr create prints the new PR's URL alone on a line; a URL inside other output is not it.
url="$(grep -xE '[[:space:]]*https://github\.com/[^/[:space:]]+/[^/[:space:]]+/pull/[0-9]+[[:space:]]*' <<<"$out" | head -1 | tr -d '[:space:]')"
[ -n "$url" ] || exit 0
pr="${url##*/}"; repo="$(sed -E 's|https://github.com/([^/]+/[^/]+)/pull/.*|\1|' <<<"$url")"
notes=()
if ! grep -qE -- '--draft|(^|[[:space:]])-d([[:space:]]|$)' <<<"$outside" && ! grep -qE "gh[[:space:]]+pr[[:space:]]+merge[^;&|]*--auto" <<<"$outside"; then
  (cd "${cwd:-.}" && gh pr merge "$pr" -R "$repo" --auto --merge >/dev/null 2>&1 &)
  notes+=("Auto-merge was not turned on in that command; the hook is turning it on (gh pr merge $pr --auto --merge). Check it with gh pr view $pr.")
fi
body=""
f="$(grep -oE -- "(--body-file|-F)[= ]+(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" <<<"$outside" | head -1)"
if [ -n "$f" ]; then
  f="${f#*[= ]}"; f="${f//\"/}"; f="${f//\'/}"; f="${f/#\~/$HOME}"
  case "$f" in *'$'*) ;; /*) body="$(cat "$f" 2>/dev/null)" ;; *) body="$(cat "$cwd/$f" 2>/dev/null)" ;; esac
fi
[ -n "$body" ] || body="$(timeout 10 gh pr view "$pr" -R "$repo" --json body --jq .body 2>/dev/null)"
if [ -n "$body" ]; then
  plain="$(sed -E 's/<!--.*-->//g' <<<"$body")"
  affects="$(awk '/^## Affects/ { on = 1; next } /^## / { on = 0 } on' <<<"$plain" | grep -vE '^[[:space:]]*-?[[:space:]]*$' || true)"
  [ -n "$affects" ] || notes+=("The Affects section is missing or empty: list the teammates whose tools, checks or conventions this changes, or write None.")
  # Gates run: text on the same line, or indented sub-bullets under it.
  gates="$(awk '/\*\*Gates run:\*\*/ { rest = $0; sub(/.*\*\*Gates run:\*\*/, "", rest); if (rest ~ /[^[:space:]]/) { print "ok"; exit } on = 1; next }
    on && /^[[:space:]]+[-*][[:space:]]+[^[:space:]]/ { print "ok"; exit }
    on && /^[[:space:]]*$/ { next }
    on { exit }' <<<"$plain")"
  [ "$gates" = ok ] || notes+=("There is no Gates run entry with content: say which gates you ran for this change and their result.")
  grep -qiE '(fixes|closes|resolves|refs)[[:space:]]+#[0-9]+' <<<"$plain" || notes+=("There is no Fixes #n or Refs #n line. Link the issue this PR closes or belongs to.")
fi
[ ${#notes[@]} -gt 0 ] || exit 0
msg="PR #$pr check (scripts/hooks/claude/pr-create-check.sh):"; for n in "${notes[@]}"; do msg+=$'\n'"- $n"; done
jq -n --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
