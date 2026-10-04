#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash. Denies (exit 2, reason on stderr):
#   - pkill -f / pgrep -f: they match their own command line and kill or find the wrong process;
#   - git push to main, or a forced push;
#   - scripts/ci-pr.sh by hand: auto CI (scripts/auto-ci.sh) is the one path to local CI. The reviewer's
#     --allow-bot runs and an explicit HITL_MANUAL_CI=1 get through;
#   - scripts/review-verdict.sh from a worktree on a lane branch (<lane>/<topic> other than lead/): only
#     the reviewer (detached worktrees) and team-lead (main, lead/) post verdicts;
#   - a test run piped into grep, tail or head that gates a git commit or push: the gate then rides on
#     the pipe's last command, not the tests (unless pipefail or PIPESTATUS is used);
#   - a foreground loop that sleeps between checks of PR or CI state (gh pr, gh run, gh api,
#     pr-status): scripts/wait-for.sh in the background waits instead. A background command gets through;
#   - git stash, other than list and show: every worktree shares one stash stack, so a pop can take
#     another lane's work;
#   - gh pr create/comment/review/edit text (title, body, heredoc bodies, body files), and gh api posts
#     to comments or reviews (body fields, body=@file, --input), that contain a local path (/home/..., /tmp/...);
#   - sed -i, perl -i and redirecting writes (>, >>, tee) whose target is a file tracked in the repository:
#     lane-guard only sees the Edit and Write tools, so those are the way to change tracked files.
#     Scratchpads, /tmp, logs and other untracked outputs are allowed.
# It looks only at commands mentioning pkill, pgrep, push, commit, stash, ci-pr, sleep, gh pr, gh api, sed, perl, tee or a redirect, and fails open on its own errors.
# Only deny() exits 2; any other failure exits otherwise, which Claude Code treats as allow.
set -f
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
case "$cmd" in *pkill*|*pgrep*|*push*|*commit*|*stash*|*ci-pr*|*review-verdict*|*sleep*|*"gh pr"*|*"gh api"*|*sed*|*perl*|*tee*|*'>'*) ;; *) exit 0 ;; esac
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
deny() { echo "Blocked by the team's hook (scripts/hooks/claude/bash-guard.sh): $1" >&2; exit 2; }

if grep -qE '(^|[^[:alnum:]_./-])(pkill|pgrep)([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-[[:alnum:]]*f[[:alnum:]]*|--full)([[:space:]]|$)' <<<"$cmd"; then
  deny "pkill -f and pgrep -f match their own command line (and your shell's), so they find or kill the wrong process. For a long job use scripts/tools/job.sh (run <name> -- <command> as one background call; ls, tail, stop). Otherwise stop a process by PID, wait on a lock, or match /proc/<pid>/cmdline by exact prefix."
fi

# ci-pr.sh run on a PR (ci-pr.sh <number>), outside heredoc bodies and quoted text.
cipr_cmds="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
  | sed -E "s/'[^']*'/Q/g; s/\"([^\"\\\\]|\\\\.)*\"/Q/g" \
  | grep -E '(^|[[:space:]/;&|(])ci-pr\.sh[[:space:]]+[0-9]+([[:space:];&|)]|$)' || true)"
if [ -n "$cipr_cmds" ] && ! grep -qE -- '--allow-bot|HITL_MANUAL_CI=1' <<<"$cipr_cmds"; then
  deny "local CI has one path: auto CI runs scripts/ci-pr.sh on every PR head within a couple of minutes (scripts/auto-ci.sh). Watch the local-ci status instead, or add the ci-rerun label for a fresh run. If you really need a run by hand (the integrator debugging CI), prefix it with HITL_MANUAL_CI=1."
fi

# review-verdict.sh run from a lane's worktree (a branch <lane>/<topic> other than lead/ or main): only the
# reviewer (detached review worktrees) and team-lead (main, lead/) post verdicts.
verdict_cmds="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
  | sed -E "s/'[^']*'/Q/g; s/\"([^\"\\\\]|\\\\.)*\"/Q/g" \
  | grep -E '(^|[[:space:]/;&|(])review-verdict\.sh[[:space:]]+[0-9]+([[:space:];&|)]|$)' || true)"
if [ -n "$verdict_cmds" ] && [ -n "$cwd" ]; then
  vbranch="$(git -C "$cwd" symbolic-ref -q --short HEAD 2>/dev/null || true)"
  case "$vbranch" in
    ''|main|lead/*) ;;
    */*) deny "review verdicts are posted only by the reviewer and team-lead; this worktree is on $vbranch. Ask the reviewer (or team-lead for lead and integrator PRs) for the verdict." ;;
  esac
fi

# A loop sleeping between checks of PR or CI state, outside heredoc bodies and quoted text (lines are
# joined first, so a quoted message spanning lines counts as text), unless run in the background.
if [ "$(jq -r '.tool_input.run_in_background // false' <<<"$input" 2>/dev/null)" != true ]; then
  # Quotes are stripped left to right over the whole command, then each loop body (for, while or
  # until, to its done) must hold both a sleep and a PR or CI check.
  poll="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
    | perl -0777 -ne 's/"(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27/Q/gs; while (/(?:^|[^\w-])(?:for|while|until)\s(.*?)(?:^|[^\w-])done(?:[^\w-]|$)/gs) { my $b = $1; if ($b =~ /(?:^|[^\w-])sleep\s+\d/ && $b =~ /(?:^|[^\w-])(?:gh\s+(?:pr|run|api)|pr-status(?:\.sh)?)(?:\s|$)/) { print "poll"; last } }' 2>/dev/null)"
  if [ "$poll" = poll ]; then
    deny "this loop sleeps between checks of PR or CI state, holding the turn for as long as it polls. Run scripts/wait-for.sh <pr> (add --merged to wait for the merge) with run_in_background: it returns when the checks pass or fail, and you're notified. One look at the state now needs no sleep."
  fi
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

# A test run piped on, with a git commit or push after it, outside heredoc bodies and quoted text
# (redirects like 2>&1 become R so their & doesn't end a command).
gate="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
  | sed -E "s/'[^']*'/Q/g; s/\"([^\"\\\\]|\\\\.)*\"/Q/g" | sed -E 's/[0-9]*>&[0-9]+|&>/R/g' | tr '\n' ' ')"
# The last test run before the first commit or push is the gate; it may not be piped on.
pre="$(sed -E 's/git[[:space:]]+([^;&|]*[[:space:]])?(commit|push)([[:space:]].*|$)/COMMIT/' <<<"$gate")"
last="$(grep -oE '(^|[[:space:];&|(])(npm[[:space:]]+(run[[:space:]]+(-s[[:space:]]+)?)?test[^[:space:];&|]*|(npx[[:space:]]+)?vitest)([[:space:]][^;&|]*)?.{0,2}' <<<"${pre%%COMMIT*}" | tail -1)"
if [[ "$pre" == *COMMIT* ]] && [[ "$last" =~ \|([^|]|$) ]] && ! grep -qE 'pipefail|PIPESTATUS' <<<"$gate"; then
  deny "this test run is piped on, so the git commit or push after it gates on the pipe's last command (grep, tail, head), not on the tests. Gate on the test command's exit code: npm run test:fast >/dev/null 2>&1 && git commit ..., or set -o pipefail first."
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

# In-place edits (sed -i, perl -i) and redirecting writes (>, >>, tee) of a tracked file. Heredoc bodies
# are dropped, path-like quoted words are unquoted so a quoted target still counts, other quoted text
# becomes Q, and only words that name a file tracked in the working directory's repository are refused.
if grep -qE 'sed|perl|tee|>' <<<"$cmd"; then
  wtext="$(awk '/<<-?[[:space:]]*'"'"'?[A-Za-z_]+'"'"'?/ && !inside { match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_]+/); tag=substr($0, RSTART, RLENGTH); gsub(/<<-?[[:space:]]*'"'"'?/, "", tag); print; inside=1; next } inside && $0 == tag { inside=0; next } !inside { print }' <<<"$cmd" \
    | sed -zE "s/'([A-Za-z0-9_.\/@+-]+)'/\1/g; s/\"([A-Za-z0-9_.\/@+-]+)\"/\1/g" \
    | sed -zE "s/'[^']*'/Q/g; s/\"([^\"\\\\]|\\\\.)*\"/Q/g" | sed -E 's/[0-9]*>&[0-9-]+/R/g; s/&>>?/>/g')"
  wtargets="$({
    # Redirect targets: > file, >> file, 2> file, >| file (not >&N, not process substitution).
    grep -oE '[0-9]*>>?\|?[[:space:]]*[^[:space:];&|)<>(]+' <<<"$wtext" | sed -E 's/^[0-9]*>>?\|?[[:space:]]*//'
    # tee [-a] files.
    grep -oE '(^|[[:space:];&|(])tee([[:space:]]+[^[:space:];&|)<>(]+)+' <<<"$wtext" | tr -s '[:space:]' '\n' | grep -vE '^(tee|-.*|)$'
    # In-place sed or perl: every word of the command segment that could name a file.
    while IFS= read -r seg; do
      if grep -qE '(^|[[:space:]])(sed|perl)([[:space:]]|$)' <<<"$seg" \
        && grep -qE '(^|[[:space:]])(--in-place(=[^[:space:]]*)?|-[nEurzs]*i[^[:space:]]*|-[0-9lpnaswWcCtTuU]*i[^[:space:]]*)([[:space:]]|$)' <<<"$seg"; then
        tr -s '[:space:]' '\n' <<<"$seg" | grep -vE '^(-.*|sed|perl|Q|R|)$'
      fi
    done < <(tr ';&|' '\n\n\n' <<<"$wtext")
  } 2>/dev/null)"
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    case "$t" in '$'*|'~'*|/dev/*) continue ;; esac
    if git -C "${cwd:-.}" ls-files --error-unmatch -- "$t" >/dev/null 2>&1; then
      deny "$t is a tracked file, and sed -i, perl -i, > and tee would change it without lane-guard seeing it. Change tracked files with the Edit or Write tool (lane-guard checks those). To take a file from another ref or a merge side, use git checkout <ref> -- <file> (or git checkout --ours/--theirs -- <file> in a conflict). Write scratch output outside the repo or to an untracked file."
    fi
  done <<<"$wtargets"
fi

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
