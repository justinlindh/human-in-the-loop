#!/usr/bin/env bash
# Runs a command at nice 10 or lower priority: a process already niced that far (or more) keeps its
# level, so wrapping twice never stacks. The test and CI scripts in package.json go through it so a
# lane's run doesn't starve the others on a shared machine. While the command runs, a keeper loop holds
# its whole process tree at nice 10 against a process manager that renices by name (see keep_nice).
# It also moves the command's temp directory (TMPDIR) to disk, unless the caller already set one:
# vitest keeps a module cache of tens of megabytes per run in a fresh temp directory that a killed
# run never removes, and /tmp here is RAM. Directories left over there are cleared once they are two
# hours old. HITL_TMPDIR picks another place.
# Usage: scripts/nice10.sh <command...>
[ $# -gt 0 ] || { echo "usage: scripts/nice10.sh <command...>" >&2; exit 2; }
source "$(dirname "${BASH_SOURCE[0]}")/lib/tmpdir.sh"
cur="$(nice 2>/dev/null || echo 0)"
[ "$cur" -ge 10 ] 2>/dev/null || set -- nice -n $(( 10 - cur )) "$@"
[ "${HITL_NICE_KEEP:-2}" = 0 ] && exec "$@"

# A process manager that renices by process name (ananicy-cpp types bash and chrome at -4) moves the
# command's shells and browsers back above normal after they start, whatever nice they were given. While
# the command runs, this loop puts every process under it that sits below nice 10 back at 10. It only
# raises a nice value, which needs no privilege. HITL_NICE_KEEP=<s> sets the pass interval in seconds
# (default 2; 0 turns the loop off and execs the command directly).
# tree <root> <skip> [low]: the pids under root (root included), without the ones under skip; with `low`,
# only those whose nice value is below 10.
tree() {
  ps -eo pid=,ppid=,ni= 2>/dev/null | awk -v root="$1" -v skip="$2" -v low="${3:-}" '
    { ni[$1] = $3; kids[$2] = kids[$2] " " $1 }
    function mark(p, set,   n, a, i) { set[p] = 1; n = split(kids[p], a, " "); for (i = 1; i <= n; i++) if (!(a[i] in set)) mark(a[i], set) }
    END { mark(root, job); if (skip != "") mark(skip, out)
      for (p in job) if (!(p in out) && (low == "" || (ni[p] ~ /^-?[0-9]+$/ && ni[p] + 0 < 10))) print p }'
}
keep_nice() { # <root pid>
  local root="$1" pids nap f
  # The keeper holds none of the caller's descriptors (a slot or pass lock), so it can never keep one
  # open, and it ends with its root and takes its sleep with it.
  for f in /proc/$BASHPID/fd/*; do [ "${f##*/}" -gt 2 ] 2>/dev/null && eval "exec ${f##*/}>&-" 2>/dev/null; done
  trap '[ -z "${nap:-}" ] || kill "$nap" 2>/dev/null; exit 0' TERM
  while sleep "${HITL_NICE_KEEP:-2}" & nap=$!; wait "$nap"; do
    kill -0 "$root" 2>/dev/null || exit 0
    pids="$(tree "$root" "$BASHPID" low)"
    [ -n "$pids" ] && renice -n 10 -p $pids >/dev/null 2>&1
  done
}
# The command and its children may have SIGINT ignored (a background job of a non-interactive shell),
# so a stop signal goes to every process under the command, not only the first one.
stop() { kill -TERM $(tree "$$" "$keeper" | grep -vx "$$") 2>/dev/null; }
"$@" <&0 & child=$!
keeper=""
trap stop TERM INT HUP
keep_nice $$ >/dev/null 2>&1 </dev/null & keeper=$!
wait "$child"; rc=$?
while kill -0 "$child" 2>/dev/null; do wait "$child"; rc=$?; done
kill "$keeper" 2>/dev/null
exit "$rc"
