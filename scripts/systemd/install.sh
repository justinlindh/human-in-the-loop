#!/usr/bin/env bash
# Installs the machine's systemd user units and starts their timers: the main guard (with its own
# clone) and auto CI (scripts/auto-ci.sh, with its own worktree of this repo, the one path to local CI).
# Run it from the shared checkout: the guard keeps that checkout fast-forwarded when it's idle.
# Usage: scripts/systemd/install.sh            install (or update) and start
#        scripts/systemd/install.sh --remove   stop, disable and remove the units (the clone and worktree stay)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
UNITS="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
CLONE="$HOME/.cache/hitl-ci/main-guard/clone"
if [ "${1:-}" = --remove ]; then
  systemctl --user disable --now hitl-main-guard.timer hitl-auto-ci.timer hitl-tmp-clean.timer hitl-dashboard.service 2>/dev/null || true
  rm -f "$UNITS/hitl-main-guard.service" "$UNITS/hitl-main-guard.timer" "$UNITS/hitl-auto-ci.service" "$UNITS/hitl-auto-ci.timer" "$UNITS/hitl-tmp-clean.service" "$UNITS/hitl-tmp-clean.timer" "$UNITS/hitl-dashboard.service"
  rm -rf "$UNITS/hitl-dashboard.service.d"
  rm -rf "$UNITS/hitl-main-guard.service.d"
  systemctl --user daemon-reload
  echo "main guard and auto CI units removed"
  exit 0
fi
url="$(git -C "$HERE/../.." remote get-url origin)"
if [ ! -d "$CLONE/.git" ]; then
  mkdir -p "$(dirname "$CLONE")"
  git clone -q "$url" "$CLONE"
fi
git -C "$CLONE" fetch -q origin main && git -C "$CLONE" checkout -q --detach origin/main
(cd "$CLONE" && { npm ls --depth=0 >/dev/null 2>&1 || npm ci --no-audit --no-fund; })
mkdir -p "$UNITS"
install -m 644 "$HERE/hitl-main-guard.service" "$HERE/hitl-main-guard.timer" "$UNITS/"
# The checkout this was run from is the shared one the guard keeps fast-forwarded.
shared="$(cd "$HERE/../.." && pwd)"
mkdir -p "$UNITS/hitl-main-guard.service.d"
printf '[Service]\nEnvironment=HITL_SHARED_CHECKOUT=%s\n' "$shared" >"$UNITS/hitl-main-guard.service.d/shared-checkout.conf"
# Auto CI's worktree of the shared checkout, detached at origin/main.
AUTO="$HOME/.cache/hitl-ci/auto/worktree"
if [ ! -d "$AUTO" ]; then
  mkdir -p "$(dirname "$AUTO")"
  git -C "$shared" fetch -q origin main
  git -C "$shared" worktree add -q --detach "$AUTO" origin/main
fi
(cd "$AUTO" && { npm ls --depth=0 >/dev/null 2>&1 || npm ci --no-audit --no-fund; })
install -m 644 "$HERE/hitl-auto-ci.service" "$HERE/hitl-auto-ci.timer" "$HERE/hitl-tmp-clean.service" "$HERE/hitl-tmp-clean.timer" "$UNITS/"
gh label create ci-rerun --color 0E8A16 --description "Asks auto CI for a fresh local CI run of the PR's current head" >/dev/null 2>&1 || true
# The owner dashboard binds this machine's private address on its default route (HITL_DASH_HOST
# overrides it), checked by the dashboard's own rule: one private address, never a wildcard.
install -m 644 "$HERE/hitl-dashboard.service" "$UNITS/"
dash_host="${HITL_DASH_HOST:-$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')}"
if ! node -e "import('$HERE/../dashboard/lib.mjs').then((m) => process.exit(m.bindAllowed(process.argv[1]) ? 0 : 1))" "$dash_host"; then
  echo "install: '$dash_host' isn't one private address; the dashboard binds 127.0.0.1 instead" >&2
  dash_host=127.0.0.1
fi
mkdir -p "$UNITS/hitl-dashboard.service.d"
printf '[Service]\nEnvironment=HITL_DASH_HOST=%s\n' "$dash_host" >"$UNITS/hitl-dashboard.service.d/host.conf"
systemctl --user daemon-reload
systemctl --user enable --now hitl-main-guard.timer hitl-auto-ci.timer hitl-tmp-clean.timer hitl-dashboard.service
systemctl --user restart hitl-dashboard.service
echo "owner dashboard: http://$dash_host:${HITL_DASH_PORT:-8790}/"
systemctl --user list-timers 'hitl-*' --no-pager
