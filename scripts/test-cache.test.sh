#!/usr/bin/env bash
# Cases for scripts/test-cache.sh in a scratch repo, with a stand-in test command that counts its
# runs. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
unset CI HITL_NO_TEST_CACHE
g() { git -c user.name=t -c user.email=t@t "$@"; }
r="$tmp/repo"; mkdir -p "$r/src"; echo a >"$r/src/a.js"; echo 'ignored/' >"$r/.gitignore"
g -C "$r" init -q -b main && g -C "$r" add -A && g -C "$r" commit -qm base
# The stand-in test: counts runs, prints a vitest-like summary, exits with $WANT.
cat >"$tmp/fake" <<'F'
#!/usr/bin/env bash
echo run >>"$COUNT"; echo " Test Files  1 passed (1)"; echo "      Tests  3 passed (3)"; exit "${WANT:-0}"
F
chmod +x "$tmp/fake"; export COUNT="$tmp/count"
# Every call logs the cache's debug lines; a failing run prints them, so the log shows which input moved.
t() { echo "-- t $*" >>"$tmp/debug"; (cd "$r" && HITL_TEST_CACHE_DEBUG=1 bash "$HERE/test-cache.sh" "$tmp/fake" "$@" 2>>"$tmp/debug"); }
runs() { wc -l <"$COUNT" 2>/dev/null || echo 0; }

t >/dev/null; [ "$(runs)" -eq 1 ] || fail "the first run runs"
out="$(t)"; rc=$?; [ $rc -eq 0 ] && [ "$(runs)" -eq 1 ] && grep -q 'skipped' <<<"$out" && grep -q 'Tests  3 passed' <<<"$out" || fail "the same tree skips and shows the earlier result: rc $rc: $out"
t --other >/dev/null; [ "$(runs)" -eq 2 ] || fail "other arguments run"
echo b >"$r/src/a.js"; t >/dev/null; [ "$(runs)" -eq 3 ] || fail "a modified file runs"
echo n >"$r/src/new.js"; t >/dev/null; [ "$(runs)" -eq 4 ] || fail "an untracked file runs"
t >/dev/null; [ "$(runs)" -eq 4 ] || fail "then the same tree skips again"
mkdir -p "$r/ignored"; echo x >"$r/ignored/x"; t >/dev/null; [ "$(runs)" -eq 4 ] || fail "an ignored file doesn't count"
mkdir -p "$r/node_modules"; echo '{}' >"$r/node_modules/.package-lock.json"; t >/dev/null; [ "$(runs)" -eq 5 ] || fail "a package install runs"
echo c >"$r/src/a.js"; WANT=1 t >/dev/null; rc=$?; [ $rc -eq 1 ] || fail "a failing run keeps its exit code: $rc"
WANT=1 t >/dev/null; rc=$?; [ $rc -eq 1 ] && [ "$(runs)" -eq 7 ] || fail "a failure is never cached: rc $rc, runs $(runs)"
t >/dev/null; n=$(runs); CI=true t >/dev/null; [ "$(runs)" -eq $((n + 1)) ] || fail "CI always runs"
HITL_NO_TEST_CACHE=1 t >/dev/null; [ "$(runs)" -eq $((n + 2)) ] || fail "HITL_NO_TEST_CACHE=1 always runs"
[ -z "$(g -C "$r" status --porcelain -- src/a.js | grep '^[AM]')" ] || fail "the real index is left alone"

# Paths no test reads don't count as part of the tree; docs/effects (a test reads it) does.
: >"$COUNT"; mkdir -p "$r/docs/effects" "$r/.claude"; t >/dev/null; n=$(runs)
echo d >"$r/docs/a.md"; echo d >"$r/.claude/b.md"; echo r >"$r/README.md"; t >/dev/null; [ "$(runs)" -eq "$n" ] || fail "docs, .claude and markdown don't count"
echo e >"$r/docs/effects/e.md"; t >/dev/null; [ "$(runs)" -eq $((n + 1)) ] || fail "docs/effects does count: runs $(runs) of $n"
HITL_TEST_CACHE_HASH_ALL=1 t >/dev/null; [ "$(runs)" -eq $((n + 2)) ] || fail "HASH_ALL sees docs"
# The ledger records each cached call.
[ "$(wc -l <"$tmp/repo/.git/hitl-test-cache.log")" -gt 5 ] && grep -q "$(printf '\thit\t')" "$tmp/repo/.git/hitl-test-cache.log" && grep -q "$(printf '\tpass\t')" "$tmp/repo/.git/hitl-test-cache.log" || fail "the ledger has hit and pass rows"

# An edit that keeps the file's size and mtime while the index entry is racily clean (its mtime is not
# older than the index's) must still change the tree.
r2="$tmp/racy"; mkdir -p "$r2"; echo a >"$r2/f"
g -C "$r2" init -q -b main && g -C "$r2" config core.trustctime false && g -C "$r2" add -A && g -C "$r2" commit -qm base
touch -d '2020-01-01' "$r2/f"; g -C "$r2" update-index --refresh -q; touch -d '2020-01-01' "$r2/.git/index"
t2() { (cd "$r2" && HITL_TEST_CACHE_DEBUG=1 bash "$HERE/test-cache.sh" "$tmp/fake" 2>>"$tmp/debug"); }
: >"$COUNT"; t2 >/dev/null; echo b >"$r2/f"; touch -d '2020-01-01' "$r2/f"; t2 >/dev/null
[ "$(runs)" -eq 2 ] || fail "a same-size edit with an unchanged mtime runs: runs $(runs)"
[ $fails -eq 0 ] && echo "test-cache: all cases pass"
[ $fails -eq 0 ] || { echo "test-cache debug log:"; sed 's/^/  /' "$tmp/debug"; }
exit $fails
