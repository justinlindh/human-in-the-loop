#!/usr/bin/env bash
# Cases for scripts/feature-media-auto.sh with a scratch origin and a stand-in feature-media command and gh.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export TMPDIR="$tmp"
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/seed" && cd "$tmp/seed" || exit 1
git init -q -b main .
cat >package.json <<'EOF'
{"name":"fm","version":"1.0.0","scripts":{"feature-media":"node fm.js"}}
EOF
cat >fm.js <<'EOF'
const fs = require('fs'), a = process.argv.slice(2);
fs.appendFileSync(process.env.FM_CALLS, a.join(' ') + '\n');
if (a.includes('--stale')) { process.stdout.write(fs.readFileSync(process.env.FM_STALE, 'utf8')); process.exit(Number(process.env.FM_STALE_RC || 0)); }
process.exit(Number(process.env.FM_RENDER_RC || 0));
EOF
g add -A && g commit -q -m base
git clone -q --bare . "$tmp/origin.git"
cd "$HERE" || exit 1
cat >"$tmp/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$FM_GH_CALLS"
case "$*" in
  "issue list"*) [ -f "$FM_OPEN" ] && echo 7 ;;
  "issue create"*) : >"$FM_OPEN" ;;
  "issue close"*) rm -f "$FM_OPEN" ;;
esac
exit 0
EOF
chmod +x "$tmp/gh"
export GH="$tmp/gh" FM_AUTO_ORIGIN="$tmp/origin.git" FM_AUTO_STATE="$tmp/state" FM_CALLS="$tmp/calls" FM_GH_CALLS="$tmp/ghcalls" FM_STALE="$tmp/stale" FM_OPEN="$tmp/open"
run() { rm -f "$FM_CALLS" "$FM_GH_CALLS"; bash "$HERE/feature-media-auto.sh" "$@" >"$tmp/out" 2>&1; rc=$?; }

printf '' >"$FM_STALE"
run; [ $rc -eq 0 ] && grep -q 'is not on .* yet; skipping' "$tmp/out" && [ ! -e "$FM_CALLS" ] && [ ! -e "$tmp/state/last" ] \
  || fail "a main without --stale is skipped and not recorded: $rc $(cat "$tmp/out")"
( cd "$tmp/seed" && mkdir -p scripts/feature-media && echo "// --stale" >scripts/feature-media/render.mjs && g add -A && g commit -q -m "add --stale" && g push -q "$tmp/origin.git" main )
run; [ $rc -eq 0 ] && grep -q 'nothing stale' "$tmp/out" && ! grep -q -- '--publish' "$FM_CALLS" || fail "nothing stale renders nothing: $rc $(cat "$tmp/out")"
run; [ $rc -eq 0 ] && [ ! -e "$FM_CALLS" ] || fail "an already handled main does nothing"
printf 'moment-a\nmoment-b\n' >"$FM_STALE"
run --force; [ $rc -eq 0 ] && grep -qx -- '--only moment-a,moment-b --publish' "$FM_CALLS" && ! grep -q 'issue create' "$FM_GH_CALLS" || fail "stale ids are re-rendered together: $rc $(cat "$tmp/out") $(cat "$FM_CALLS")"
FM_RENDER_RC=3 run --force; [ $rc -eq 1 ] && grep -q 'issue create' "$FM_GH_CALLS" && grep -q 'label create feature-media-red' "$FM_GH_CALLS" || fail "a failed render opens a feature-media-red issue: $rc $(cat "$tmp/out")"
FM_RENDER_RC=3 run --force; [ $rc -eq 1 ] && grep -q 'issue comment 7' "$FM_GH_CALLS" && ! grep -q 'issue create' "$FM_GH_CALLS" || fail "a repeat failure comments on the open issue: $(cat "$FM_GH_CALLS")"
run --force; [ $rc -eq 0 ] && grep -q 'issue close 7' "$FM_GH_CALLS" || fail "a passing run closes the issue: $(cat "$FM_GH_CALLS")"
FM_STALE_RC=2 run --force; [ $rc -eq 1 ] && grep -q 'issue create' "$FM_GH_CALLS" && ! grep -q -- '--publish' "$FM_CALLS" || fail "a failing --stale is reported and renders nothing: $rc $(cat "$tmp/out")"

[ $fails -eq 0 ] && echo "feature-media-auto: all cases pass"
exit $fails
