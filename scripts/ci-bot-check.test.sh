#!/usr/bin/env bash
# Cases for scripts/ci-bot-check.sh and for ci-pr.sh --allow-bot refusing a person's PR before it
# fetches anything. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
BOT='49699333+dependabot[bot]@users.noreply.github.com'
fails=0
check() { # <want rc> <name> <login> <type> <cross> <head owner> <paths, |-separated> <authors, |-separated>
  local want="$1" name="$2"
  printf '%s' "$7" | tr '|' '\n' >"$tmp/paths"; printf '%s' "$8" | tr '|' '\n' >"$tmp/authors"
  bash "$HERE/ci-bot-check.sh" "$3" "$4" "$5" "$6" justinlindh "$tmp/paths" "$tmp/authors" 2>/dev/null
  local rc=$?
  [ $rc -eq "$want" ] || { echo "FAIL $name: want $want, got $rc"; fails=$((fails + 1)); }
}
check 0 'bot, manifests only' 'dependabot[bot]' Bot false justinlindh 'package.json|package-lock.json' "$BOT"
check 0 'bot, lockfile only' 'dependabot[bot]' Bot false justinlindh 'package-lock.json' "$BOT|$BOT"
check 0 'bot, workflows only' 'dependabot[bot]' Bot false justinlindh '.github/workflows/ci.yml|.github/workflows/pages.yml' "$BOT"
check 2 'bot touching src/' 'dependabot[bot]' Bot false justinlindh 'package.json|src/sim/tick.js' "$BOT"
check 2 'bot touching a script' 'dependabot[bot]' Bot false justinlindh 'package-lock.json|scripts/ci-pr.sh' "$BOT"
check 2 'bot touching a nested package.json' 'dependabot[bot]' Bot false justinlindh 'docs/package.json' "$BOT"
check 2 'bot touching .github outside workflows' 'dependabot[bot]' Bot false justinlindh '.github/dependabot.yml' "$BOT"
check 2 'bot with no changes' 'dependabot[bot]' Bot false justinlindh '' "$BOT"
check 2 'person with the flag' justinlindh User false justinlindh 'package.json' 'justinlindh@gmail.com'
check 2 'lookalike login' dependabot User false justinlindh 'package.json' "$BOT"
check 2 'bot login but not a Bot' 'dependabot[bot]' User false justinlindh 'package.json' "$BOT"
check 2 'bot PR from a fork' 'dependabot[bot]' Bot true someone 'package.json' "$BOT"
check 2 'bot PR with another head owner' 'dependabot[bot]' Bot false someone 'package.json' "$BOT"
check 2 'bot PR with a commit by a person' 'dependabot[bot]' Bot false justinlindh 'package.json' "$BOT|someone@example.com"
check 2 'bot PR with no commits' 'dependabot[bot]' Bot false justinlindh 'package.json' ''

# ci-pr.sh --allow-bot on a person's PR stops at the identity check: exit 2, nothing fetched or posted.
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$GH_LOG"
case "$*" in
  "pr view 7 --json isCrossRepository"*) printf 'false\037justinlindh\037justinlindh\037integ/x\n' ;;
  "repo view"*) echo justinlindh ;;
  "api repos/{owner}/{repo}/pulls/7 "*) printf 'justinlindh\037User\n' ;;
  *) echo "unexpected: gh $*" >&2; exit 9 ;;
esac
GH
chmod +x "$tmp/bin/gh"
GH_LOG="$tmp/gh.log" PATH="$tmp/bin:$PATH" CI_WORKTREE_ROOT="$tmp/ci" bash "$HERE/ci-pr.sh" 7 --allow-bot 2>"$tmp/err"; rc=$?
[ $rc -eq 2 ] && grep -q 'only for Dependabot' "$tmp/err" && ! grep -q 'statuses\|pr comment' "$tmp/gh.log" && [ ! -d "$tmp/ci" ] \
  || { echo "FAIL ci-pr --allow-bot on a person's PR: rc $rc, $(cat "$tmp/err")"; fails=$((fails + 1)); }

[ $fails -eq 0 ] && echo "ci-bot-check: all cases pass" || echo "ci-bot-check: $fails failing"
[ $fails -eq 0 ]
