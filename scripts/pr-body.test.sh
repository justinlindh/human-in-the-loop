#!/usr/bin/env bash
# Cases for scripts/pr-body.sh: the section helpers (sourced) and the command paths, with gh stubbed.
# Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
# shellcheck source=/dev/null
source "$HERE/pr-body.sh"
set +e

body=$'## What\n\nold\n\n## Evidence\n\n- a\n\n## Affects\n\n- x\n'
printf 'n1\nn2\n' >"$tmp/n"
[ "$(show_section evidence "$body")" = $'\n- a' ] || fail "show: [$(show_section evidence "$body")]"
want=$'## What\n\nold\n\n## Evidence\n\nn1\nn2\n\n## Affects\n\n- x'
[ "$(put_section Evidence "$tmp/n" 0 "$body")" = "$want" ] || fail "replace middle"
want=$'## What\n\nold\n\n## Evidence\n\n- a\n\n## Affects\n\n- x\nn1\nn2'
[ "$(put_section Affects "$tmp/n" 1 "$body")" = "$want" ] || fail "append last"
put_section Closes "$tmp/n" 0 "$body" | tail -4 | tr '\n' '|' | grep -qx '## Closes||n1|n2|' || fail "add a missing section"
[ "$(put_section Evidence "$tmp/n" 0 "$body" | grep -c '^## ')" -eq 3 ] || fail "a replace keeps the other headings"

fenced=$'## What\n\nx\n\n## Evidence\n\n```\n## not a heading\nlog\n```\n\n## Affects\n\n- y\n'
[ "$(show_section Evidence "$fenced" | grep -c 'log')" -eq 1 ] && [ "$(show_section Evidence "$fenced" | grep -c '^```')" -eq 2 ] || fail "show keeps a fenced ## line in its section"
got="$(put_section Evidence "$tmp/n" 0 "$fenced")"
[ "$got" = $'## What\n\nx\n\n## Evidence\n\nn1\nn2\n\n## Affects\n\n- y' ] || fail "replace drops the whole fenced section: [$got]"
got="$(put_section Evidence "$tmp/n" 1 "$fenced")"
[ "$(grep -c '^```' <<<"$got")" -eq 2 ] && [ "$(grep -c '^## ' <<<"$got")" -eq 4 ] && grep -q '^n2$' <<<"$got" || fail "append past a fenced ## line: [$got]"
[ "$(put_section evidence "$tmp/n" 0 "$body" | grep -c '^## Evidence$')" -eq 1 ] || fail "a replace keeps the heading as written"

# Command paths, with gh stubbed: view returns $tmp/body, edit records what it was given.
mkdir -p "$tmp/bin"
printf '%s' "$body" >"$tmp/body"
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$1 \$2" in
  "pr view") cat "$tmp/body" ;;
  "pr edit") cat >"$tmp/edited"; echo "\$*" >"$tmp/edit-args" ;;
  *) echo "unexpected gh \$*" >&2; exit 1 ;;
esac
F
chmod +x "$tmp/bin/gh"
run() { out="$(PATH="$tmp/bin:$PATH" bash "$HERE/pr-body.sh" "$@" 2>&1)"; rc=$?; }
rm -f "$tmp/edited"

run 9 --show Affects; [ $rc -eq 0 ] && grep -q -- '- x' <<<"$out" || fail "show: $rc $out"
run 9 --show Nope; [ $rc -eq 1 ] && grep -q 'no .## Nope. section' <<<"$out" || fail "show a missing section: $rc $out"
run 9 --section Evidence --from "$tmp/n"; [ $rc -eq 0 ] && grep -q 'n2' "$tmp/edited" && grep -q 'body-file' "$tmp/edit-args" || fail "replace: $rc $out"
printf 'from stdin\n' | { PATH="$tmp/bin:$PATH" bash "$HERE/pr-body.sh" 9 --section What --from - >/dev/null; }; grep -q 'from stdin' "$tmp/edited" || fail "stdin"
rm -f "$tmp/edited"
printf 'see /home/justin/shots/a.png\n' >"$tmp/bad"
run 9 --section Evidence --from "$tmp/bad"; [ $rc -eq 1 ] && grep -q 'local path' <<<"$out" && [ ! -e "$tmp/edited" ] || fail "local path refused before any edit: $rc $out"
printf 'logs at /tmp/x\n' >"$tmp/bad"
run 9 --section Evidence --from "$tmp/bad" --append; [ $rc -eq 1 ] && [ ! -e "$tmp/edited" ] || fail "/tmp refused: $rc $out"
: >"$tmp/empty"; run 9 --section Evidence --from "$tmp/empty"; [ $rc -eq 2 ] && [ ! -e "$tmp/edited" ] || fail "empty text: $rc $out"
run 9 --section Evidence --from "$tmp/nofile"; [ $rc -eq 2 ] || fail "missing file: $rc $out"
run 9 --section Evidence --from "$tmp/n" --dry-run; [ $rc -eq 0 ] && [ ! -e "$tmp/edited" ] && grep -q n1 <<<"$out" || fail "dry run: $rc $out"
run 9 --section Evidence; [ $rc -eq 2 ] || fail "no --from: $rc"
run 9 --bogus; [ $rc -eq 2 ] || fail "unknown option: $rc"

[ $fails -eq 0 ] && echo "pr-body: all cases pass"
exit $fails
