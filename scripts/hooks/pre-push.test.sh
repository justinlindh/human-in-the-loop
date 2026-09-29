#!/usr/bin/env bash
# Cases for scripts/hooks/pre-push in a scratch repo whose test:fast is a stand-in that counts its
# runs, with gh stubbed. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
unset CI
r="$tmp/repo"; mkdir -p "$r" "$tmp/bin"
printf '{ "scripts": { "test:fast": "bash fake.sh" } }\n' >"$r/package.json"
printf 'echo run >>"%s/runs"; echo "${GIT_DIR:-no GIT_DIR}" >"%s/gitdir"; echo "      Tests  3 passed (3)"; exit "${WANT:-0}"\n' "$tmp" "$tmp" >"$r/fake.sh"
git -C "$r" init -q -b main && git -C "$r" -c user.name=t -c user.email=t@t commit -qm base --allow-empty
# gh pr list answers with $tmp/prs (empty: no PR for the branch).
printf '#!/usr/bin/env bash\ncat "%s/prs" 2>/dev/null\n' "$tmp" >"$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
SHA=1111111111111111111111111111111111111111 ZERO=0000000000000000000000000000000000000000
push() { # <stdin line>...: sets rc and out
  out="$(cd "$r" && printf '%s\n' "$@" | PATH="$tmp/bin:$PATH" bash "$HERE/pre-push" origin url 2>&1)"; rc=$?
}
runs() { wc -l <"$tmp/runs" 2>/dev/null || echo 0; }

push "refs/heads/x $SHA refs/heads/tools/x $ZERO"
[ $rc -eq 0 ] && [ "$(runs)" -eq 1 ] && grep -q 'Tests  3 passed' <<<"$out" || fail "a passing push runs the tests: rc $rc runs $(runs): $out"
WANT=1 push "refs/heads/x $SHA refs/heads/tools/x $ZERO"
[ $rc -eq 1 ] && grep -q 'refusing the push: npm run test:fast failed' <<<"$out" || fail "a failing test refuses the push: rc $rc: $out"
n=$(runs); push "refs/heads/pr-media $SHA refs/heads/pr-media $ZERO"
[ $rc -eq 0 ] && [ "$(runs)" -eq "$n" ] || fail "a pr-media push skips the tests: rc $rc: $out"
push "(delete) $ZERO refs/heads/tools/x $SHA"
[ $rc -eq 0 ] && [ "$(runs)" -eq "$n" ] || fail "a branch deletion skips the tests: rc $rc: $out"
CI=true WANT=1 push "refs/heads/x $SHA refs/heads/tools/x $ZERO"
[ $rc -eq 0 ] && [ "$(runs)" -eq "$n" ] || fail "CI skips the tests: rc $rc: $out"
echo "5 MERGED" >"$tmp/prs"; push "refs/heads/x $SHA refs/heads/tools/x $ZERO"
[ $rc -eq 1 ] && grep -q 'PR #5 is MERGED' <<<"$out" && [ "$(runs)" -eq "$n" ] || fail "a merged PR's branch is refused before the tests: rc $rc: $out"
rm -f "$tmp/prs"
GIT_DIR="$r/.git" push "refs/heads/x $SHA refs/heads/tools/x $ZERO"
[ $rc -eq 0 ] && [ "$(cat "$tmp/gitdir")" = "no GIT_DIR" ] || fail "the tests run without git's hook variables (GIT_DIR): rc $rc, saw $(cat "$tmp/gitdir" 2>/dev/null)"

# Commit messages: a wip: commit beyond origin/main refuses the push before the tests run; a
# conventional one passes.
mkdir -p "$r/scripts/hooks"; cp "$HERE/../check-commits.sh" "$r/scripts/"; cp "$HERE/commit-msg" "$r/scripts/hooks/"
g() { git -C "$r" -c user.name=t -c user.email=t@t "$@"; }
g update-ref refs/remotes/origin/main HEAD
g checkout -q -b topic
g commit -q --allow-empty -m "wip: half done"; WIP="$(g rev-parse HEAD)"
n=$(runs); push "refs/heads/topic $WIP refs/heads/integ/topic $ZERO"
[ $rc -eq 1 ] && grep -q 'does not follow Conventional Commits' <<<"$out" && [ "$(runs)" -eq "$n" ] || fail "a wip: commit refuses the push before the tests: rc $rc runs $(runs): $out"
g commit -q --allow-empty --amend -m "ci(integ): a real message"; OK="$(g rev-parse HEAD)"
push "refs/heads/topic $OK refs/heads/integ/topic $ZERO"
[ $rc -eq 0 ] && [ "$(runs)" -gt "$n" ] || fail "a conventional commit passes: rc $rc: $out"

# A new worktree gets the main checkout's node_modules linked in (post-checkout).
chmod +x "$HERE/post-checkout"; cp "$HERE/post-checkout" "$r/scripts/hooks/"
g config core.hooksPath "$r/scripts/hooks"; mkdir -p "$r/node_modules"
g worktree add -q "$tmp/wt" -b wt-branch >/dev/null 2>&1
[ "$(readlink "$tmp/wt/node_modules" 2>/dev/null)" = "$r/node_modules" ] || fail "a new worktree gets node_modules linked from the main checkout"

[ $fails -eq 0 ] && echo "pre-push: all cases pass"
exit $fails
