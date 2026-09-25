#!/usr/bin/env bash
# Cases for scripts/review-carry.sh against stand-in gh and git. Exit 0 when all pass.
# Each case gives the PR's heads oldest first with their review states and own-change patches; the
# newest head is the PR head. The check is whether a "review" success gets posted on it.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
case "$*" in
  "pr view"*) echo "$(tail -1 "$FIX/heads" | cut -d' ' -f1) main" ;;
  *"/pulls/"*"/commits"*) cut -d' ' -f1 "$FIX/heads" ;;
  *"/commits/"*"/statuses"*) args="$*"; sha="${args#*commits/}"; sha="${sha%%/*}"; awk -v s="$sha" '$1 == s && $2 != "-" { print $2 }' "$FIX/heads" ;;
  *"/statuses/"*) echo "POST $*" >>"$FIX/posted" ;;
  *) echo "unexpected gh $*" >&2; exit 9 ;;
esac
GH
cat >"$tmp/bin/git" <<'GIT'
#!/usr/bin/env bash
[ "$1" = -C ] && shift 2
case "$1" in
  fetch) exit 0 ;;
  merge-base) echo base ;;
  diff) awk -v s="$3" '$1 == s { print $3 }' "$FIX/heads" ;;
  patch-id) printf '%s x\n' "$(cat | sha1sum | cut -c1-40)" ;;
  *) exec /usr/bin/git "$@" ;;
esac
GIT
chmod +x "$tmp/bin/gh" "$tmp/bin/git"
fails=0
check() { # <name> <want: carried|kept> <heads: "sha state patch" lines separated by |>
  local fix="$tmp/$RANDOM"; mkdir -p "$fix"; printf '%s' "$3" | tr '|' '\n' >"$fix/heads"; : >"$fix/posted"
  FIX="$fix" PATH="$tmp/bin:$PATH" bash "$HERE/review-carry.sh" 7 >/dev/null 2>&1
  local got=kept; grep -q 'state=success' "$fix/posted" && got=carried
  [ "$got" = "$2" ] || { echo "FAIL $1: want $2, got $got"; fails=$((fails + 1)); }
}
check 'a pass carries to a head that only merges main' carried 'a success p1|b - p1'
check 'changed code does not carry' kept 'a success p1|b - p2'
check 'a failure on the head is never overwritten' kept 'a success p1|b failure p1'
check 'a pending review on the head is left alone' kept 'a success p1|b pending p1'
check 'a newer changes-requested verdict is not skipped for an older pass' kept 'a success p1|b failure p1|c - p1'
check 'a pass after a failure carries' carried 'a failure p1|b success p1|c - p1'
check 'no earlier verdict, nothing to carry' kept 'a - p1|b - p1'
[ $fails -eq 0 ] && echo "review-carry: all cases pass" || echo "review-carry: $fails failing"
[ $fails -eq 0 ]
