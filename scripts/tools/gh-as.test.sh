#!/usr/bin/env bash
# Cases for scripts/tools/gh-as.sh against a stubbed GitHub API and a throwaway key. The stub checks
# the JWT's RS256 signature, iss and lifetime. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GH="$HERE/gh-as.sh"
tmp="$(mktemp -d)"; spid=''
cleanup() { [ -n "$spid" ] && kill "$spid" 2>/dev/null; rm -rf "$tmp"; }
trap cleanup EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }

apps="$tmp/apps"; mkdir -p "$apps"
openssl genrsa -out "$apps/lane1.pem" 2048 2>/dev/null; chmod 600 "$apps/lane1.pem"
openssl rsa -in "$apps/lane1.pem" -pubout -out "$tmp/pub.pem" 2>/dev/null
cat >"$apps/apps.json" <<'EOF'
{ "lane1": { "appId": 1, "clientId": "Iv1.stubclient", "installationId": 77, "botLogin": "lane1-bot[bot]", "botEmail": "1+lane1-bot[bot]@users.noreply.github.com" },
  "nokey": { "appId": 2, "clientId": "Iv1.nokey", "installationId": 78, "botLogin": "nokey[bot]", "botEmail": "2+nokey[bot]@users.noreply.github.com" } }
EOF

cat >"$tmp/stub.mjs" <<'EOF'
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs';
const [pubFile, dir] = process.argv.slice(2);
const pub = fs.readFileSync(pubFile, 'utf8'); let n = 0;
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST' || req.url !== '/app/installations/77/access_tokens') return send(404, { message: 'Not Found' });
  const m = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(req.headers.authorization || '');
  if (!m) return send(401, { message: 'A JSON web token could not be decoded' });
  const ok = crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), pub, Buffer.from(m[3], 'base64url'));
  const p = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  const head = JSON.parse(Buffer.from(m[1], 'base64url').toString());
  if (!ok || head.alg !== 'RS256' || p.iss !== 'Iv1.stubclient' || p.exp - p.iat > 660 || p.exp < Date.now() / 1000) return send(401, { message: 'bad jwt' });
  n++; fs.writeFileSync(dir + '/mints', String(n));
  let ttl = 3600; try { ttl = +fs.readFileSync(dir + '/ttl', 'utf8'); } catch {}
  send(201, { token: 'ghs_stub' + n, expires_at: new Date(Date.now() + ttl * 1000).toISOString().replace(/\.\d+Z$/, 'Z') });
}).listen(0, '127.0.0.1', function () { fs.writeFileSync(dir + '/port', String(this.address().port)); });
EOF
node "$tmp/stub.mjs" "$tmp/pub.pem" "$tmp" & spid=$!
for _ in $(seq 100); do [ -s "$tmp/port" ] && break; sleep 0.1; done
[ -s "$tmp/port" ] || { echo "FAIL the stub did not start"; exit 1; }
export HITL_GH_API="http://127.0.0.1:$(cat "$tmp/port")" HITL_APPS_DIR="$apps"
mints() { cat "$tmp/mints" 2>/dev/null || echo 0; }

t="$("$GH" token lane1 2>"$tmp/err")"; rc=$?
[ $rc -eq 0 ] && [ "$t" = ghs_stub1 ] || fail "token mints against the API with a signed JWT: $rc $t $(cat "$tmp/err")"
t="$("$GH" token lane1)"; [ "$t" = ghs_stub1 ] && [ "$(mints)" = 1 ] || fail "a second token call reuses the cache: $t mints=$(mints)"
[ "$(stat -c %a "$apps/cache/lane1.token")" = 600 ] || fail "the cache file is mode 600"
# expiry inside 10 minutes refreshes
printf '%s ghs_old\n' "$(( $(date +%s) + 500 ))" >"$apps/cache/lane1.token"
t="$("$GH" token lane1)"; [ "$t" = ghs_stub2 ] || fail "a token with under 10 minutes left is refreshed: $t"
printf '%s ghs_old\n' "$(( $(date +%s) + 900 ))" >"$apps/cache/lane1.token"
t="$("$GH" token lane1)"; [ "$t" = ghs_old ] || fail "a token with over 10 minutes left is kept: $t"
# env
out="$("$GH" env lane1)"; [ "$out" = "export GH_TOKEN=ghs_old" ] || fail "env prints an export line: $out"
# credential helper
out="$(printf 'protocol=https\nhost=github.com\n\n' | "$GH" credential lane1 get)"
[ "$out" = $'username=x-access-token\npassword=ghs_old' ] || fail "credential serves the token for github.com: $out"
out="$(printf 'protocol=https\nhost=example.com\n\n' | "$GH" credential lane1 get)"; [ -z "$out" ] || fail "credential ignores other hosts: $out"
out="$(printf 'protocol=https\nhost=github.com\n\n' | "$GH" credential lane1 store)"; [ -z "$out" ] || fail "credential ignores store: $out"
# git-setup in a scratch repo with a second worktree
repo="$tmp/repo"; git init -q "$repo" && git -C "$repo" -c user.name=x -c user.email=x@x commit -q --allow-empty -m init
git -C "$repo" config user.email owner@example.com
git -C "$repo" worktree add -q "$tmp/wt" -b other 2>/dev/null
out="$(cd "$repo" && "$GH" git-setup lane1)"; rc=$?
[ $rc -eq 0 ] && grep -q 'lane1-bot\[bot\]' <<<"$out" || fail "git-setup says who it is now: $rc $out"
[ "$(git -C "$repo" config user.email)" = "1+lane1-bot[bot]@users.noreply.github.com" ] && [ "$(git -C "$repo" config user.name)" = "lane1-bot[bot]" ] || fail "git-setup sets the bot's name and email"
[ "$(git -C "$tmp/wt" config user.email)" = owner@example.com ] || fail "git-setup leaves other worktrees alone: $(git -C "$tmp/wt" config user.email)"
out="$(printf 'protocol=https\nhost=github.com\n\n' | git -C "$repo" credential fill 2>&1)"
[ "$out" = "$(printf 'protocol=https\nhost=github.com\nusername=x-access-token\npassword=ghs_old')" ] || fail "git asks the helper for github.com: $out"
git -C "$repo" remote add origin git@github.com:o/r.git
[ "$(git -C "$repo" ls-remote --get-url origin)" = "https://github.com/o/r.git" ] || fail "an ssh github remote is sent over https: $(git -C "$repo" ls-remote --get-url origin)"
[ "$(git -C "$tmp/wt" ls-remote --get-url origin 2>/dev/null)" != "https://github.com/o/r.git" ] || fail "the rewrite stays in its worktree"
(cd "$repo" && "$GH" git-setup lane1 >/dev/null); n="$(git -C "$repo" config --worktree --get-all credential.https://github.com.helper | wc -l)"
[ "$n" = 2 ] || fail "git-setup twice does not stack helpers: $n"
# no key
out="$("$GH" token nokey 2>&1)"; rc=$?; [ $rc -eq 3 ] && grep -q 'no GitHub App key for nokey' <<<"$out" || fail "token without a key exits 3 and says so: $rc $out"
out="$("$GH" env nokey 2>"$tmp/err")"; rc=$?; [ $rc -eq 0 ] && [ -z "$out" ] && grep -q 'no GitHub App key' "$tmp/err" || fail "env without a key prints nothing and exits 0: $rc $out"
before="$(git -C "$repo" config --worktree user.email)"
(cd "$tmp/wt" && "$GH" git-setup nokey 2>/dev/null); [ "$(git -C "$tmp/wt" config user.email)" = owner@example.com ] || fail "git-setup without a key changes nothing"
# errors
out="$("$GH" token 'Bad Lane' 2>&1)"; rc=$?; [ $rc -eq 2 ] || fail "a bad lane name exits 2: $rc"
out="$("$GH" bogus lane1 2>&1)"; rc=$?; [ $rc -eq 2 ] || fail "an unknown command exits 2: $rc"
out="$("$GH" 2>&1)"; rc=$?; [ $rc -eq 2 ] || fail "no arguments exits 2: $rc"
rm -f "$apps/cache/lane1.token"; cp "$apps/lane1.pem" "$tmp/good.pem"; printf 'not a key\n' >"$apps/lane1.pem"
out="$("$GH" token lane1 2>&1)"; rc=$?; [ $rc -eq 1 ] && grep -q 'could not sign' <<<"$out" || fail "an unusable key exits 1 with a message: $rc $out"
cp "$tmp/good.pem" "$apps/lane1.pem"
sed -i 's/"installationId": 77/"installationId": 99/' "$apps/apps.json"
out="$("$GH" token lane1 2>&1)"; rc=$?; [ $rc -eq 1 ] && grep -q 'GitHub answered 404' <<<"$out" || fail "an API error exits 1 and names the status: $rc $out"
grep -q 'ghs_' <<<"$out" && fail "an error never prints a token"
[ $fails -eq 0 ] && echo "gh-as: all cases pass"
exit $fails
