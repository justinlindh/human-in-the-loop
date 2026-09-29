#!/usr/bin/env bash
# Act on GitHub as a lane's own GitHub App bot: mint and cache installation tokens, hand them to gh
# and git.
#   scripts/tools/gh-as.sh token <lane>       print a one-hour installation token (cached, refreshed at 10 minutes left)
#   scripts/tools/gh-as.sh env <lane>         print `export GH_TOKEN=...` for eval in a session
#   scripts/tools/gh-as.sh git-setup <lane>   this worktree pushes to github.com as the bot, commits as the bot
#   scripts/tools/gh-as.sh credential <lane> get   the git credential helper git-setup installs
#   scripts/tools/gh-as.sh shim-install [dir]   put a `gh` shim (default ~/.local/bin, ahead of the real gh on PATH)
# git-setup also writes the lane into <git dir>/hitl-lane. The shim, run in a worktree with that
# marker, runs the real gh with that lane's token, so a plain `gh` acts as the bot; with no marker, no
# key, or GH_TOKEN already set, it runs the real gh untouched.
# The lane's app is described in <apps dir>/apps.json (appId, clientId, installationId, botLogin,
# botEmail) and signed for with <apps dir>/<lane>.pem. The apps dir is HITL_APPS_DIR, default
# ~/.config/hitl/apps. A lane with no key gets a message and today's behaviour: `env` and `git-setup`
# change nothing and exit 0, `token` exits 3. HITL_GH_API overrides https://api.github.com (tests).
# A key or a token is never printed except by `token`, `env` and `credential`, which exist to hand one over.
set -uo pipefail
APPS="${HITL_APPS_DIR:-$HOME/.config/hitl/apps}"
API="${HITL_GH_API:-https://api.github.com}"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
die() { echo "gh-as: $*" >&2; exit 2; }
usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

cmd="${1:-}"; [ -n "$cmd" ] || usage; shift
lane=''
case "$cmd" in
  shim|shim-install) ;;
  *) lane="${1:-}"; [ -n "$lane" ] || usage; shift ;;
esac
[[ -z "$lane" || "$lane" =~ ^[a-z0-9_-]+$ ]] || die "a lane name is lower-case letters, digits, - _"
key="$APPS/$lane.pem"

# No key: say so and let the caller carry on as before.
has_key() { [ -r "$key" ] && [ -r "$APPS/apps.json" ] && jq -e --arg l "$lane" 'has($l)' "$APPS/apps.json" >/dev/null 2>&1; }
no_key_note() { echo "gh-as: no GitHub App key for $lane in $APPS (needs $lane.pem and a \"$lane\" entry in apps.json); acting as the default identity" >&2; }
field() { jq -r --arg l "$lane" --arg f "$1" '.[$l][$f] // empty' "$APPS/apps.json"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

mint() { # prints "<expiry epoch> <token>" on success
  local cid inst now jwt in sig body code resp exp
  cid="$(field clientId)"; inst="$(field installationId)"
  [ -n "$cid" ] && [ -n "$inst" ] || { echo "gh-as: apps.json has no clientId or installationId for $lane" >&2; return 1; }
  now="$(date +%s)"
  in="$(printf '{"alg":"RS256","typ":"JWT"}' | b64url).$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$cid" | b64url)"
  sig="$(printf '%s' "$in" | openssl dgst -sha256 -sign "$key" -binary 2>/dev/null | b64url)"
  [ -n "$sig" ] || { echo "gh-as: could not sign with $lane.pem (is it an RSA private key?)" >&2; return 1; }
  jwt="$in.$sig"
  resp="$(printf 'header = "Authorization: Bearer %s"\n' "$jwt" | curl -sS --max-time 30 --config - \
    -X POST -H 'Accept: application/vnd.github+json' -w '\n%{http_code}' \
    "$API/app/installations/$inst/access_tokens" 2>&1)" || { echo "gh-as: request failed: $(head -c 200 <<<"$resp")" >&2; return 1; }
  code="${resp##*$'\n'}"; body="${resp%$'\n'*}"
  if [ "$code" != 201 ]; then
    echo "gh-as: GitHub answered $code minting a token for $lane: $(jq -r '.message // empty' <<<"$body" 2>/dev/null | head -c 200)" >&2
    return 1
  fi
  exp="$(date -d "$(jq -r '.expires_at' <<<"$body")" +%s 2>/dev/null)" || exp=$((now + 3300))
  printf '%s %s\n' "$exp" "$(jq -r '.token' <<<"$body")"
}

token() {
  local f="$APPS/cache/$lane.token" exp tok now
  now="$(date +%s)"
  if [ -r "$f" ]; then
    read -r exp tok <"$f"
    if [ -n "${exp:-}" ] && [ -n "${tok:-}" ] && [ $((exp - now)) -gt 600 ]; then printf '%s\n' "$tok"; return 0; fi
  fi
  local out; out="$(mint)" || return 1
  ( umask 077; mkdir -p "$APPS/cache" && chmod 700 "$APPS/cache" && printf '%s\n' "$out" >"$f" ) || echo "gh-as: could not cache the token" >&2
  printf '%s\n' "${out#* }"
}

case "$cmd" in
  token)
    has_key || { no_key_note; exit 3; }
    token || exit 1 ;;
  env)
    has_key || { no_key_note; exit 0; }
    tok="$(token)" || exit 1
    printf 'export GH_TOKEN=%q\n' "$tok" ;;
  credential)
    op="${1:-get}"; [ "$op" = get ] || exit 0
    host=''; proto=''
    while IFS='=' read -r k v; do
      case "$k" in host) host="$v" ;; protocol) proto="$v" ;; esac
    done
    [ "$host" = github.com ] && [ "$proto" = https ] || exit 0
    has_key || { no_key_note; exit 0; }
    tok="$(token)" || exit 0
    printf 'username=x-access-token\npassword=%s\n' "$tok" ;;
  git-setup)
    has_key || { no_key_note; exit 0; }
    git rev-parse --git-dir >/dev/null 2>&1 || die "run git-setup inside a worktree"
    login="$(field botLogin)"; email="$(field botEmail)"
    [ -n "$login" ] && [ -n "$email" ] || die "apps.json has no botLogin or botEmail for $lane"
    # Per-worktree config keeps one lane's identity out of the others' worktrees.
    git config --local extensions.worktreeConfig true
    git config --worktree user.name "$login"
    git config --worktree user.email "$email"
    helper="!"
    [ -n "${HITL_APPS_DIR:-}" ] && helper+="HITL_APPS_DIR='$HITL_APPS_DIR' "
    bin="${HITL_SHIM_DIR:-$HOME/.local/bin}/hitl-gh-as"; [ -x "$bin" ] || bin="$SELF"
    helper+="'$bin' credential $lane"
    printf '%s\n' "$lane" >"$(git rev-parse --absolute-git-dir)/hitl-lane"
    # An ssh remote would use the machine's key, so send github.com over https for this worktree.
    git config --worktree --unset-all url.https://github.com/.insteadOf 2>/dev/null
    git config --worktree --add url.https://github.com/.insteadOf git@github.com:
    git config --worktree --add url.https://github.com/.insteadOf ssh://git@github.com/
    git config --worktree --unset-all credential.https://github.com.helper 2>/dev/null
    git config --worktree --add credential.https://github.com.helper ''
    git config --worktree --add credential.https://github.com.helper "$helper"
    echo "gh-as: this worktree now pushes and commits as $login"
    echo "gh-as: for gh in a shell: eval \"\$(scripts/tools/gh-as.sh env $lane)\" (the token lasts an hour)" ;;
  shim)
    # Runs as `gh`: find the real gh (skipping this shim's own directory), add the lane's token if any.
    shimdir="$(cd "$(dirname "$SELF")" && pwd)"; real="${HITL_REAL_GH:-}"
    if [ -z "$real" ]; then
      IFS=: read -ra dirs <<<"$PATH"
      for d in "${dirs[@]}"; do
        [ -x "$d/gh" ] && ! [ "$d/gh" -ef "$shimdir/gh" ] && { real="$d/gh"; break; }
      done
    fi
    [ -n "$real" ] || { echo "gh-as: no real gh on PATH" >&2; exit 127; }
    if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ] && gd="$(git rev-parse --absolute-git-dir 2>/dev/null)" && [ -r "$gd/hitl-lane" ]; then
      lane="$(head -n1 "$gd/hitl-lane")"; key="$APPS/$lane.pem"
      if [[ "$lane" =~ ^[a-z0-9_-]+$ ]] && has_key; then
        if tok="$(token)"; then export GH_TOKEN="$tok"; else echo "gh-as: no token for $lane; running gh as the default identity" >&2; fi
      fi
    fi
    exec "$real" "$@" ;;
  shim-install)
    dir="${1:-${HITL_SHIM_DIR:-$HOME/.local/bin}}"; mkdir -p "$dir" || die "cannot create $dir"
    if [ -e "$dir/gh" ] && ! grep -q '^# hitl gh shim' "$dir/gh" 2>/dev/null; then die "$dir/gh exists and is not this shim; not replacing it"; fi
    cp "$SELF" "$dir/hitl-gh-as" && chmod 755 "$dir/hitl-gh-as"
    printf '#!/usr/bin/env bash\n# hitl gh shim (scripts/tools/gh-as.sh shim-install)\nexec "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/hitl-gh-as" shim "$@"\n' >"$dir/gh"
    chmod 755 "$dir/gh"
    first="$(PATH="$PATH" command -v gh)"
    [ "$first" -ef "$dir/gh" ] && echo "gh-as: shim installed in $dir; plain gh there now follows the worktree's lane" \
      || echo "gh-as: shim installed in $dir but $first comes first on PATH; put $dir ahead of it" ;;
  *) usage ;;
esac
