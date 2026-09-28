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
  systemctl --user disable --now hitl-main-guard.timer hitl-auto-ci.timer 2>/dev/null || true
  rm -f "$UNITS/hitl-main-guard.service" "$UNITS/hitl-main-guard.timer" "$UNITS/hitl-auto-ci.service" "$UNITS/hitl-auto-ci.timer"
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
install -m 644 "$HERE/hitl-auto-ci.service" "$HERE/hitl-auto-ci.timer" "$UNITS/"
gh label create ci-rerun --color 0E8A16 --description "Asks auto CI for a fresh local CI run of the PR's current head" >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable --now hitl-main-guard.timer hitl-auto-ci.timer
systemctl --user list-timers 'hitl-*' --no-pager
