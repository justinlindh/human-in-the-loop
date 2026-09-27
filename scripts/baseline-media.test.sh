#!/usr/bin/env bash
# Cases for scripts/baseline-media.sh in a scratch repo, with gh stubbed. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
r="$tmp/repo"; mkdir -p "$r/blender/checks/golden" "$r/scripts" "$tmp/bin" "$tmp/sweep"
cp "$HERE/baseline-media.sh" "$HERE/ci-trusted" "$r/scripts/"
# gh stands in for the PR's comment bodies (what the script's --jq would select).
printf '#!/usr/bin/env bash\ncat "$GH_BODIES"\n' >"$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
magick -size 40x30 xc:gray "$r/blender/checks/golden/a.png"
magick -size 40x30 xc:gray "$r/blender/checks/golden/keep.png"
echo '{"accepted":[{"key":"old|x","worst":0.02},{"key":"gone|y","worst":0.03}]}' >"$r/blender/checks/sweep-baseline.json"
g -C "$r" init -q -b main && g -C "$r" add -A && g -C "$r" commit -qm base
g -C "$r" checkout -q -b feat
run() { (cd "$r" && BASE=main PATH="$tmp/bin:$PATH" bash scripts/baseline-media.sh "$@"); }

out="$(run --check 2>&1)"; rc=$?
[ $rc -eq 0 ] && grep -q 'no golden or sweep-baseline changes' <<<"$out" || fail "no changes: rc $rc: $out"

magick -size 40x30 xc:teal "$r/blender/checks/golden/a.png"
echo '{"accepted":[{"key":"old|x","worst":0.05},{"key":"new|z","worst":0.01}]}' >"$r/blender/checks/sweep-baseline.json"
g -C "$r" commit -qam change
a_blob="$(g -C "$r" rev-parse HEAD:blender/checks/golden/a.png)"
s_blob="$(g -C "$r" rev-parse HEAD:blender/checks/sweep-baseline.json)"

out="$(run --list)"
[ "$(wc -l <<<"$out")" -eq 2 ] && grep -q "golden/a.png $a_blob" <<<"$out" && grep -q "sweep-baseline.json $s_blob" <<<"$out" || fail "list: $out"

out="$(run --check 2>&1)"; rc=$?
[ $rc -eq 0 ] && grep -q 'needs before/after media' <<<"$out" || fail "check without a PR should advise and pass: rc $rc"

out="$(run --dry-run "$tmp/d1" --sweep-dir "$tmp/sweep" 2>&1)"; rc=$?
[ $rc -eq 1 ] && grep -q 'no crop for' <<<"$out" || fail "a worse sweep entry with no crop should refuse: rc $rc: $out"

magick -size 20x20 xc:red "$tmp/sweep/old_x.png"; magick -size 20x20 xc:blue "$tmp/sweep/new_z.png"
out="$(run --dry-run "$tmp/d2" --sweep-dir "$tmp/sweep" 2>&1)"; rc=$?
[ $rc -eq 0 ] || fail "dry run: rc $rc: $out"
[ "$(ls "$tmp/d2"/*.png 2>/dev/null | wc -l)" -eq 3 ] || fail "dry run: want golden-a plus two sweep crops, got $(ls "$tmp/d2")"
[ "$(magick identify -format %w "$tmp/d2/golden-a.png" 2>/dev/null)" = 80 ] || fail "golden media should be before and after side by side"
c="$tmp/d2/comment.md"
grep -qx -- '-->' "$c" && grep -qx "file: blender/checks/golden/a.png $a_blob" "$c" || fail "comment record malformed: $(head -4 "$c")"
grep -q 'worse `old|x` (0.02 -> 0.05)' "$c" && grep -q 'added `new|z`' "$c" && grep -q 'removed `gone|y`' "$c" || fail "sweep notes: $(cat "$c")"

cp "$c" "$tmp/bodies"
out="$(GH_BODIES="$tmp/bodies" run --check 7 2>&1)"; rc=$?
[ $rc -eq 0 ] && grep -q PASS <<<"$out" || fail "check with current media should pass: rc $rc: $out"

magick -size 40x30 xc:orange "$r/blender/checks/golden/a.png"; g -C "$r" commit -qam again
out="$(GH_BODIES="$tmp/bodies" run --check 7 2>&1)"; rc=$?
[ $rc -eq 1 ] && grep -q 'golden/a.png' <<<"$out" && ! grep -q 'sweep-baseline' <<<"$(sed -n '2,$p' <<<"$out" | grep '^  ')" || fail "a golden changed after its media should fail, naming only it: rc $rc: $out"

[ $fails -eq 0 ] && echo "baseline-media: all cases pass"
exit $fails
