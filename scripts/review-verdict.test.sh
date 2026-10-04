#!/usr/bin/env bash
# Cases for scripts/review-verdict.sh's --as with a stand-in gh and gh-as.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'SH'
#!/usr/bin/env bash
echo "${GH_TOKEN:-none}" >>"$T/tokens"
case "$1 $2" in
  "pr view") echo abc1234def5678 ;;
  "pr review") : ;;
  "api repos/{owner}/{repo}/pulls/9/reviews") echo https://example.test/review/1 ;;
  *) : ;;
esac
SH
chmod +x "$tmp/bin/gh"
cat >"$tmp/gh-as-key" <<'SH'
#!/usr/bin/env bash
[ "$1" = env ] && [ "$2" = reviewer ] && echo "export GH_TOKEN=bot-token"
exit 0
SH
cat >"$tmp/gh-as-nokey" <<'SH'
#!/usr/bin/env bash
echo "gh-as: no GitHub App key for $2; acting as the default identity" >&2
exit 0
SH
echo "Looks fine." >"$tmp/body"
run() { # <gh-as script or ->  [extra args]: sets rc, out and the tokens the gh calls saw
  local ghas="$1"; shift
  : >"$tmp/tokens"
  out="$(T="$tmp" GH_TOKEN= PATH="$tmp/bin:$PATH" HITL_GH_AS="$ghas" bash "$HERE/review-verdict.sh" 9 changes "$tmp/body" "$@" 2>&1)"; rc=$?
}
run "$tmp/gh-as-key" --as reviewer
[ $rc -eq 0 ] && [ "$(sort -u "$tmp/tokens")" = bot-token ] && [ "$(wc -l <"$tmp/tokens")" -ge 5 ] || fail "--as reviewer: every gh call carries the bot token (rc $rc, tokens: $(sort -u "$tmp/tokens" | tr '\n' ' '))"
run "$tmp/gh-as-key"
[ $rc -eq 0 ] && [ "$(sort -u "$tmp/tokens")" = bot-token ] && [ "$(wc -l <"$tmp/tokens")" -ge 5 ] || fail "without --as it posts as the reviewer app (rc $rc, tokens: $(sort -u "$tmp/tokens" | tr '\n' ' '))"
run "$tmp/gh-as-nokey"
[ $rc -eq 2 ] && [ ! -s "$tmp/tokens" ] && [[ "$out" == *"no GitHub App key for reviewer"*"nothing posted"* ]] || fail "with no key it refuses before any gh call (rc $rc, calls $(wc -l <"$tmp/tokens"): $out)"
run "$tmp/gh-as-nokey" --as lead
[ $rc -eq 2 ] && [ ! -s "$tmp/tokens" ] && [[ "$out" == *"no GitHub App key for lead"* ]] || fail "--as a lane with no key refuses (rc $rc: $out)"
run "$tmp/absent"
[ $rc -eq 2 ] && [ ! -s "$tmp/tokens" ] && [[ "$out" == *"no reviewer app token; nothing posted"* ]] || fail "with no gh-as.sh it refuses before any gh call (rc $rc: $out)"
[ $fails -eq 0 ] && echo "review-verdict: all cases pass" || echo "review-verdict: $fails failing"
[ $fails -eq 0 ]
