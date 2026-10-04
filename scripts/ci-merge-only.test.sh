#!/usr/bin/env bash
# Cases for scripts/ci-merge-only.sh with a scratch repository and a stand-in gh.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/bin"
git init -q --bare -b main "$tmp/origin.git"
git clone -q "$tmp/origin.git" "$tmp/w" 2>/dev/null
cd "$tmp/w" || exit 1
g checkout -q -b main && echo base >f && g add f && g commit -q -m base && g push -q -u origin main
g checkout -q -b topic && echo work >w && g add w && g commit -q -m work && A="$(git rev-parse HEAD)"
g checkout -q main && echo more >m && g add m && g commit -q -m "main moves" && g push -q origin main
g checkout -q topic && g merge -q --no-edit main && M="$(git rev-parse HEAD)"
echo again >w2 && g add w2 && g commit -q -m "more work" && N="$(git rev-parse HEAD)"
g fetch -q origin
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$*" in
  *pulls/*/commits*) cat "$tmp/commits" ;;
  *commits/*/statuses*) sha="\$(sed -E 's|.*commits/([0-9a-f]+)/statuses.*|\1|' <<<"\$*")"; grep -qx "\$sha" "$tmp/tested" && echo 1 || echo 0 ;;
  *) exit 1 ;;
esac
F
chmod +x "$tmp/bin/gh"
run() { PATH="$tmp/bin:$PATH" bash "$HERE/ci-merge-only.sh" 5 "$1" main --repo "$tmp/w"; }
printf '%s\n%s\n' "$A" "$M" >"$tmp/commits"; printf '%s\n' "$A" >"$tmp/tested"
[ "$(run "$M")" = 1 ] || fail "a head that only merged main is merge-only"
printf '%s\n%s\n%s\n' "$A" "$M" "$N" >"$tmp/commits"
[ "$(run "$N")" = 0 ] || fail "a head with new work is not"
printf '%s\n' "$A" >"$tmp/commits"
[ "$(run "$A")" = na ] || fail "a first head has no earlier head: na"
: >"$tmp/tested"; printf '%s\n%s\n' "$A" "$M" >"$tmp/commits"
[ "$(run "$M")" = na ] || fail "no earlier head with a local-ci status: na"
[ "$(PATH="$tmp/bin:$PATH" bash "$HERE/ci-merge-only.sh")" = na ] || fail "bad usage prints na"

[ $fails -eq 0 ] && echo "ci-merge-only: all cases pass"
exit $fails
