#!/usr/bin/env bash
# Cases for scripts/tools/test-related.sh: which changed files narrow the run and which force the full one.
# Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
lst() { out="$(bash "$HERE/test-related.sh" --list --files "$@" 2>&1)"; }
lst src/ui/advisor.js; grep -q '1 changed file' <<<"$out" && grep -q '^src/ui/advisor.js$' <<<"$out" || fail "a src file narrows: $out"
lst src/ui/advisor.js tests/effects.test.js; grep -q '2 changed file' <<<"$out" || fail "two files: $out"
lst docs/a.md .claude/agents/x.md README.md; grep -q 'nothing to run' <<<"$out" || fail "inert files run nothing: $out"
lst docs/a.md src/ui/advisor.js; grep -q '1 changed file' <<<"$out" && ! grep -q 'docs/a.md' <<<"$out" || fail "inert files drop out of a mixed change: $out"
lst src/contract/contract.md; grep -q 'running the full test:fast' <<<"$out" || fail "markdown under src forces the full run: $out"
lst docs/effects/x.md; grep -q 'running the full test:fast' <<<"$out" || fail "docs/effects forces the full run: $out"
lst package.json; grep -q 'running the full test:fast' <<<"$out" || fail "package.json forces the full run: $out"
lst public/models/chibi.glb; grep -q 'running the full test:fast' <<<"$out" || fail "a model forces the full run: $out"
lst src/ui/advisor.js scripts/ci-local.sh; grep -q 'scripts/ci-local.sh is not plain JS' <<<"$out" || fail "a shell script forces the full run: $out"
lst; grep -q 'no changes\|nothing to run' <<<"$out" || fail "no files: $out"
# The real run: one test file's related tests pass and exit 0.
bash "$HERE/test-related.sh" --files src/ui/advisor.js >/dev/null 2>&1; [ $? -eq 0 ] || fail "a related run exits 0"
[ $fails -eq 0 ] && echo "test-related: all cases pass"
exit $fails
