#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash. Denies (exit 2, reason on stderr):
#   - pkill -f / pgrep -f: they match their own command line and kill or find the wrong process;
#   - git push to main, or a forced push;
#   - git stash, other than list and show: every worktree shares one stash stack, so a pop can take
#     another lane's work;
#   - gh pr create/comment/review/edit text (title, body, heredoc bodies, body files), and gh api posts
#     to comments or reviews (body fields, body=@file, --input), that contain a local path (/home/..., /tmp/...).
# It looks only at commands mentioning pkill, pgrep, push, stash, gh pr or gh api, and fails open on its own errors.
# Only deny() exits 2; any other failure exits otherwise, which Claude Code treats as allow.
set -f
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
case "$cmd" in *pkill*|*pgrep*|*push*|*stash*|*"gh pr"*|*"gh api"*) ;; *) exit 0 ;; esac
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
deny() { echo "Blocked by the team's hook (scripts/hooks/claude/bash-guard.sh): $1" >&2; exit 2; }

if grep -qE '(^|[^[:alnum:]_./-])(pkill|pgrep)([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-[[:alnum:]]*f[[:alnum:]]*|--full)([[:space:]]|$)' <<<"$cmd"; then
  deny "pkill -f and pgrep -f match their own command line (and your shell's), so they find or kill the wrong process. Stop a process by PID, wait on a lock, or match /proc/<pid>/cmdline by exact prefix."
fi

# git stash as a command (not in heredoc bodies or quoted text, which become Q so a quoted -C path
# keeps its place), behind any wrapper (if, nice, timeout, sudo, $(...)): only the read-only list and show.
stash_cmds="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
  | sed -E "s/'[^']*'/Q/g; s/\"([^\"\\\\]|\\\\.)*\"/Q/g" \
  | grep -oE '(^|[^[:alnum:]_./-])git([[:space:]]+(-C|-c)[[:space:]]+[^[:space:];&|)]+|[[:space:]]+--[a-z-]+(=[^[:space:];&|)]+)?)*[[:space:]]+stash([[:space:]]+[^[:space:];&|)]+)?' || true)"
while IFS= read -r m; do
  [ -n "$m" ] || continue
  sub="${m##*stash}"; sub="${sub#"${sub%%[![:space:]]*}"}"
  case "$sub" in list|show) ;; *) deny "git stash is refused: commit to a scratch branch or copy to your scratchpad; all worktrees share one stash stack." ;; esac
done <<<"$stash_cmds"

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
# Heredoc bodies are data, not commands: the gh call and its flags are looked for outside them, and
# a heredoc is scanned only when it is the PR text (it feeds the gh command, or it is written to a
# file that the gh command then reads as its body).
outside="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd")"
if grep -qE 'gh[[:space:]]+pr[[:space:]]+(create|comment|review|edit)' <<<"$outside" \
  || grep -qE 'gh[[:space:]]+api[[:space:]][^;&|]*(/comments|/reviews)' <<<"$outside"; then
  local_path='(/home/|/tmp/)'
  texts="$(grep -oE -- "(--title|-t|--body|-b)[= ]+(\"([^\"\\\\]|\\\\.)*\"|'[^']*')" <<<"$outside" || true)"
  # gh api fields: -f/-F body=..., --field/--raw-field body=...
  # (body=@file names a file, read below, so its path is not text.)
  texts+="$(grep -oE -- "(-f|-F|--field|--raw-field)[= ]+(\"?)body=(\"([^\"\\\\]|\\\\.)*\"|'[^']*'|[^@[:space:]][^[:space:]]*)" <<<"$outside" || true)"
  # A body built from a file ("$(cat FILE)", "$(<FILE)", `cat FILE`) is checked by its contents,
  # like --body-file, not by where the file lives.
  subst_re='(\$\((cat[[:space:]]+|<[[:space:]]*)|`cat[[:space:]]+)("[^"]*"|'"'"'[^'"'"']*'"'"'|[^)`[:space:]]+)[[:space:]]*(\)|`)'
  subst_files=""
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    texts="${texts//"$m"/}"
    m="$(sed -E 's/^(\$\((cat[[:space:]]+|<[[:space:]]*)|`cat[[:space:]]+)//; s/[[:space:]]*(\)|`)$//' <<<"$m")"
    subst_files+="$m"$'\n'
  done < <(grep -oE "$subst_re" <<<"$texts" || true)
  # The files the gh command reads its body from, as written (a path or a $VAR).
  body_targets="$({ grep -oE -- "(--body-file|-F|--input)[= ]+(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" <<<"$outside"; grep -oE -- "(-F|--field)[= ]+body=@[^[:space:];&|]+" <<<"$outside" | sed -E 's/[= ]+body=@/ /'; } | grep -v 'body=' | sed -E "s/^[^= ]+[= ]+//; s/[\"']//g" || true)"
  heredocs="$(awk -v targets="$body_targets" '
    BEGIN { n = split(targets, t, "\n"); for (i = 1; i <= n; i++) if (t[i] != "") want[t[i]] = 1 }
    /<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside {
      match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag = substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag)
      keep = ($0 ~ /gh[[:space:]]+(pr|api)[[:space:]]/)
      # The file the heredoc is written to: a > redirect, or tee [-a] FILE.
      if (match($0, />[[:space:]]*[^[:space:]<;&|>]+/)) { f = substr($0, RSTART, RLENGTH); sub(/^>[[:space:]]*/, "", f); gsub(/["'"'"']/, "", f); if (f in want) keep = 1 }
      if (match($0, /tee[[:space:]]+(-a[[:space:]]+)?[^[:space:]<;&|>-][^[:space:]<;&|>]*/)) { f = substr($0, RSTART, RLENGTH); sub(/^tee[[:space:]]+(-a[[:space:]]+)?/, "", f); gsub(/["'"'"']/, "", f); if (f in want) keep = 1 }
      inside = 1; next }
    inside && $0 == tag { inside = 0; next }
    inside && keep { print }' <<<"$cmd")"
  grep -qE "$local_path" <<<"$texts$heredocs" && deny "the PR text contains a local path (/home/... or /tmp/...). PR descriptions and comments never do: describe the file by its repo path, and put media on the PR with scripts/pr-media.sh."
  while IFS= read -r f; do
    f="${f#*[= ]}"; f="${f//\"/}"; f="${f//\'/}"; f="${f/#\~/$HOME}"
    case "$f" in *'$'*|'') continue ;; esac
    [ "${f#/}" = "$f" ] && [ -n "$cwd" ] && f="$cwd/$f"
    [ -r "$f" ] && grep -qE "$local_path" "$f" && deny "the PR body file contains a local path (/home/... or /tmp/...). PR text never does: use repo paths, and scripts/pr-media.sh for media."
  done < <({ [ -n "$subst_files" ] && sed 's/^/--body-file /' <<<"$subst_files"; grep -oE -- "(--body-file|-F|--input)[= ]+(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" <<<"$outside"; grep -oE -- "(-F|--field)[= ]+body=@[^[:space:];&|]+" <<<"$outside" | sed -E 's/[= ]+body=@/ /'; } | grep -v 'body=' || true)
fi
exit 0
