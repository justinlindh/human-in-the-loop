#!/usr/bin/env bash
# Source it: moves TMPDIR to a directory on disk when the caller has none or it is /tmp, which is
# RAM-backed and size-limited here, and ages out what earlier runs left behind. mktemp, Node's
# os.tmpdir(), vitest and Chromium all follow TMPDIR. A TMPDIR the caller chose is kept.
# HITL_TMPDIR picks the directory (default ~/.cache/hitl-ci/tmp); HITL_TMP_KEEP_HOURS (default 24) is
# how long an untouched entry stays.
if [ -z "${TMPDIR:-}" ] || [ "$TMPDIR" = /tmp ]; then
  _hitl_tmp="${HITL_TMPDIR:-$HOME/.cache/hitl-ci/tmp}"
  if mkdir -p "$_hitl_tmp" 2>/dev/null; then
    export TMPDIR="$_hitl_tmp"
    # vitest's run directories (21 random characters) are 30 MB each: two hours is plenty.
    find "$_hitl_tmp" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[A-Za-z0-9_-]{21}' -mmin +120 -exec rm -rf {} + 2>/dev/null
  fi
  unset _hitl_tmp
fi
# A TMPDIR that is set but missing (a systemd unit names the default before anything made it).
[ -n "${TMPDIR:-}" ] && [ ! -d "$TMPDIR" ] && mkdir -p "$TMPDIR" 2>/dev/null
true
