# Machine-wide capacity for local CI runs. Source it, then:
#   ci_slot_take <fd>        wait for one of HITL_CI_SLOTS (default 3) run slots and hold it on <fd>;
#                            says on stderr while it waits; exit status 75 when CI_RUN_WAIT (default
#                            7200) seconds pass without one
#   ci_runs_going            how many run slots are held right now (the caller's own included)
#   vitest_workers <cores> <load> <runs>
#                            vitest workers for one run: the cores the load leaves free, shared among
#                            the runs going, at least 2 and at most a third of the cores
#   infra_failure <log> <seconds>
#                            prints why a failed step looks like the machine's fault, not the code's
#                            (nothing, and exit 1, when it doesn't)
# Slot files live in HITL_LOCK_DIR, next to the render locks.
ci_slot_dir() { echo "${HITL_LOCK_DIR:-$HOME/.cache/hitl-ci}"; }
ci_slot_count() { echo "${HITL_CI_SLOTS:-3}"; }

ci_slot_take() {
  local fd="$1" dir n i waited=0 said=0 max="${CI_RUN_WAIT:-7200}"
  dir="$(ci_slot_dir)"; n="$(ci_slot_count)"; mkdir -p "$dir"
  while :; do
    for i in $(seq 1 "$n"); do
      eval "exec $fd>\"\$dir/ci-run-$i.lock\""
      if flock -n "$fd"; then
        [ $said = 1 ] && echo "ci-local: got CI run slot $i after ${waited}s" >&2
        CI_SLOT="$i"; CI_SLOT_WAITED="$waited"
        return 0
      fi
      eval "exec $fd>&-"
    done
    [ $said = 1 ] || { echo "ci-local: waiting for a CI run slot (all $n taken; at most $n runs at once on this machine)" >&2; said=1; }
    [ "$waited" -ge "$max" ] && { echo "ci-local: no CI run slot after ${waited}s" >&2; return 75; }
    sleep "${CI_SLOT_POLL:-5}"; waited=$(( waited + ${CI_SLOT_POLL:-5} ))
  done
}

ci_runs_going() {
  local dir n i held=0
  dir="$(ci_slot_dir)"; n="$(ci_slot_count)"
  for i in $(seq 1 "$n"); do
    [ -e "$dir/ci-run-$i.lock" ] || continue
    flock -n "$dir/ci-run-$i.lock" true 2>/dev/null || held=$(( held + 1 ))
  done
  echo "$held"
}

vitest_workers() {
  awk -v c="$1" -v l="$2" -v r="$3" 'BEGIN {
    if (r < 1) r = 1
    free = c - l; w = int(free / r); cap = int(c / 3)
    if (w > cap) w = cap
    if (w < 2) w = 2
    print w
  }'
}

# Signatures of a machine out of something (disk, memory, GPU), as the browsers, git and node report
# it. Only a log's last INFRA_TAIL lines (default 40) count, where a tool reports why it stopped, so
# the same words inside ordinary test output above an assertion don't turn a code failure into one.
INFRA_RE='ERR_INSUFFICIENT_RESOURCES|ENOSPC|No space left on device|unable to write file|Cannot allocate memory|ENOMEM|asked for the GPU but got no WebGL2|Error creating WebGL context|Could not create a WebGL context|WebGL context could not be created|GPU process (exited|crashed|isn.t usable)|signal=SIGTRAP|no (software render lock|CI run slot) after'
infra_failure() {
  local log="$1" secs="$2" hit
  hit="$(tail -n "${INFRA_TAIL:-40}" "$log" 2>/dev/null | grep -m1 -oE "$INFRA_RE")"
  if [ -n "$hit" ]; then echo "$hit"; return 0; fi
  if [ "$secs" -le 1 ] && ! grep -q '[^[:space:]]' "$log" 2>/dev/null; then echo "failed in ${secs}s with no output"; return 0; fi
  return 1
}
