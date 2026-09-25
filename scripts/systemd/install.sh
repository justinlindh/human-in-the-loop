#!/usr/bin/env bash
# Installs the main guard's systemd user units and its own clone, then starts the timer.
# Run it from the shared checkout: the guard keeps that checkout fast-forwarded when it's idle.
# Usage: scripts/systemd/install.sh            install (or update) and start
#        scripts/systemd/install.sh --remove   stop, disable and remove the units (the clone stays)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
UNITS="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
CLONE="$HOME/.cache/hitl-ci/main-guard/clone"
if [ "${1:-}" = --remove ]; then
  systemctl --user disable --now hitl-main-guard.timer 2>/dev/null || true
  rm -f "$UNITS/hitl-main-guard.service" "$UNITS/hitl-main-guard.timer"
  rm -rf "$UNITS/hitl-main-guard.service.d"
  systemctl --user daemon-reload
  echo "main guard units removed"
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
systemctl --user daemon-reload
systemctl --user enable --now hitl-main-guard.timer
systemctl --user list-timers 'hitl-main-guard*' --no-pager
