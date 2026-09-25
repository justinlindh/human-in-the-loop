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
# Optional per case: $FIX/late (a verdict state the head gets after its first look),
# $FIX/after_post (a verdict "state|description" that appears once something was posted),
# $FIX/moved (the PR head moved to this sha).
args="$*"
head="$(tail -1 "$FIX/heads" | cut -d' ' -f1)"
case "$args" in
  "pr view"*baseRefName*) echo "$head main" ;;
  "pr view"*) cat "$FIX/moved" 2>/dev/null || echo "$head" ;;
  *"/pulls/"*"/commits"*) cut -d' ' -f1 "$FIX/heads" ;;
  *"/commits/"*"/statuses"*)
    sha="${args#*commits/}"; sha="${sha%%/*}"
    case "$args" in
      *'carried from'*) [ -s "$FIX/posted" ] && [ -f "$FIX/after_post" ] && tr '|' '\037' <"$FIX/after_post" ;;
      *)
        n=$(cat "$FIX/looks-$sha" 2>/dev/null || echo 0); echo $((n + 1)) >"$FIX/looks-$sha"
        if [ "$sha" = "$head" ] && [ -f "$FIX/late" ] && [ "$n" -ge 1 ]; then cat "$FIX/late"
        else awk -v s="$sha" '$1 == s && $2 != "-" { print $2 }' "$FIX/heads"; fi ;;
    esac ;;
  *"/statuses/"*) echo "POST $args" >>"$FIX/posted" ;;
  *) echo "unexpected gh $args" >&2; exit 9 ;;
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
check() { # <name> <want: carried|kept|restored> <heads: "sha state patch" lines separated by |> [file=content...]
  local fix="$tmp/$RANDOM"; mkdir -p "$fix"; printf '%s' "$3" | tr '|' '\n' >"$fix/heads"; : >"$fix/posted"
  local kv; for kv in "${@:4}"; do printf '%s\n' "${kv#*=}" >"$fix/${kv%%=*}"; done
  FIX="$fix" PATH="$tmp/bin:$PATH" bash "$HERE/review-carry.sh" 7 >/dev/null 2>&1
  local got=kept last; last="$(tail -1 "$fix/posted")"
  case "$last" in *state=success*) got=carried ;; *state=*) got=restored ;; esac
  [ "$got" = "$2" ] || { echo "FAIL $1: want $2, got $got"; fails=$((fails + 1)); }
}
check 'a pass carries to a head that only merges main' carried 'a success p1|b - p1'
check 'changed code does not carry' kept 'a success p1|b - p2'
check 'a failure on the head is never overwritten' kept 'a success p1|b failure p1'
check 'a pending review on the head is left alone' kept 'a success p1|b pending p1'
check 'a newer changes-requested verdict is not skipped for an older pass' kept 'a success p1|b failure p1|c - p1'
check 'a pass after a failure carries' carried 'a failure p1|b success p1|c - p1'
check 'no earlier verdict, nothing to carry' kept 'a - p1|b - p1'
check 'a verdict that lands before the post is not overwritten' kept 'a success p1|b - p1' late=failure
check 'a verdict that lands during the post is restored over the carry' restored 'a success p1|b - p1' 'after_post=failure|Changes requested'
check 'a head that moved while carrying is not carried' kept 'a success p1|b - p1' moved=c
[ $fails -eq 0 ] && echo "review-carry: all cases pass" || echo "review-carry: $fails failing"
[ $fails -eq 0 ]
