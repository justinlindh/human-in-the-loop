#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash. Denies (exit 2, reason on stderr):
#   - pkill -f / pgrep -f: they match their own command line and kill or find the wrong process;
#   - git push to main, or a forced push;
#   - gh pr create/comment/review/edit text (title, body, heredoc bodies, body files), and gh api posts
#     to comments or reviews (body fields, body=@file, --input), that contain a local path (/home/..., /tmp/...).
# It looks only at commands mentioning pkill, pgrep, push, gh pr or gh api, and fails open on its own errors.
# Only deny() exits 2; any other failure exits otherwise, which Claude Code treats as allow.
set -f
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
case "$cmd" in *pkill*|*pgrep*|*push*|*"gh pr"*|*"gh api"*) ;; *) exit 0 ;; esac
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
deny() { echo "Blocked by the team's hook (scripts/hooks/claude/bash-guard.sh): $1" >&2; exit 2; }

if grep -qE '(^|[^[:alnum:]_./-])(pkill|pgrep)([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-[[:alnum:]]*f[[:alnum:]]*|--full)([[:space:]]|$)' <<<"$cmd"; then
  deny "pkill -f and pgrep -f match their own command line (and your shell's), so they find or kill the wrong process. Stop a process by PID, wait on a lock, or match /proc/<pid>/cmdline by exact prefix."
fi

# Each "git ... push ..." segment, up to the next ; & | or newline.
while IFS= read -r seg; do
  [ -n "$seg" ] || continue
  for t in $seg; do
    case "$t" in
      --force|--force-with-lease|--force-with-lease=*|--force-if-includes|-f) deny "no forced pushes: pushed branches are never rewritten. Merge main into the branch instead." ;;
      +*) deny "no forced pushes (a +refspec forces). Merge main into the branch instead." ;;
      main|*:main|refs/heads/main|*:refs/heads/main) deny "never push to main: changes reach main only through a PR from a <lane>/<topic> branch." ;;
    esac
  done
  # A bare "git push" pushes the current branch: refuse it on main.
  rest="${seg#*push}"; rest="$(sed -E 's/(^|[[:space:]])-[^[:space:]]+//g' <<<"$rest" | tr -d '[:space:]')"
  if [ -z "$rest" ] || [ "$rest" = origin ]; then
    dir="$cwd"; [[ "$seg" =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]] && dir="${BASH_REMATCH[1]}"
    [ -n "$dir" ] && [ "$(git -C "$dir" branch --show-current 2>/dev/null)" = main ] && deny "this checkout is on main, and a bare git push would push to main. Push a <lane>/<topic> branch instead."
  fi
done < <(grep -oE 'git([[:space:]]+-C[[:space:]]+[^[:space:];&|]+)?[[:space:]]+push([^;&|]*)' <<<"$cmd")

# gh pr create/comment/review/edit, and gh api calls that post to PR or issue comments or reviews.
if grep -qE 'gh[[:space:]]+pr[[:space:]]+(create|comment|review|edit)' <<<"$cmd" \
  || grep -qE 'gh[[:space:]]+api[[:space:]][^;&|]*(/comments|/reviews)' <<<"$cmd"; then
  local_path='(/home/|/tmp/)'
  texts="$(grep -oE -- "(--title|-t|--body|-b)[= ]+(\"([^\"\\\\]|\\\\.)*\"|'[^']*')" <<<"$cmd" || true)"
  # gh api fields: -f/-F body=..., --field/--raw-field body=...
  texts+="$(grep -oE -- "(-f|-F|--field|--raw-field)[= ]+(\"?)body=(\"([^\"\\\\]|\\\\.)*\"|'[^']*'|[^[:space:]]+)" <<<"$cmd" || true)"
  heredocs="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); inside=1; next } inside && $0 == tag { inside=0; next } inside { print }' <<<"$cmd")"
  grep -qE "$local_path" <<<"$texts$heredocs" && deny "the PR text contains a local path (/home/... or /tmp/...). PR descriptions and comments never do: describe the file by its repo path, and put media on the PR with scripts/pr-media.sh."
  while IFS= read -r f; do
    f="${f#*[= ]}"; f="${f//\"/}"; f="${f//\'/}"; f="${f/#\~/$HOME}"
    case "$f" in *'$'*|'') continue ;; esac
    [ "${f#/}" = "$f" ] && [ -n "$cwd" ] && f="$cwd/$f"
    [ -r "$f" ] && grep -qE "$local_path" "$f" && deny "the PR body file contains a local path (/home/... or /tmp/...). PR text never does: use repo paths, and scripts/pr-media.sh for media."
  done < <({ grep -oE -- "(--body-file|-F|--input)[= ]+(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" <<<"$cmd"; grep -oE -- "(-F|--field)[= ]+body=@[^[:space:];&|]+" <<<"$cmd" | sed 's/body=@/ /'; } | grep -v 'body=' || true)
fi
exit 0
