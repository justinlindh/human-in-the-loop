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
printf 'echo run >>"%s/runs"; echo "      Tests  3 passed (3)"; exit "${WANT:-0}"\n' "$tmp" >"$r/fake.sh"
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

[ $fails -eq 0 ] && echo "pre-push: all cases pass"
exit $fails
