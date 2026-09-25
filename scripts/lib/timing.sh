# Shell side of the team's timing log (scripts/lib/timing.js has the format). Source it, then:
#   timing_log kind=step tool=ci-local step=build wall_s=12 exit=0
# Values are logged as numbers when they look like one, else as strings. Never fails the caller.
timing_file() {
  if [ -n "${HITL_TIMINGS:-}" ]; then [ "$HITL_TIMINGS" = off ] || echo "$HITL_TIMINGS"; return; fi
  echo "$HOME/.cache/hitl-ci/timings.jsonl"
}
timing_log() {
  {
    local file; file="$(timing_file)"; [ -n "$file" ] || return 0
    mkdir -p "$(dirname "$file")" || return 0
    local top; top="$(git rev-parse --show-toplevel 2>/dev/null)" || top="$PWD"
    local line kv k v
    line="{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"worktree\":\"$(basename "$top")\""
    line+=",\"branch\":\"$(git rev-parse --abbrev-ref HEAD 2>/dev/null)\",\"sha\":\"$(git rev-parse --short HEAD 2>/dev/null)\",\"pid\":$$"
    [[ "${HITL_PR:-}" =~ ^[0-9]+$ ]] && line+=",\"pr\":${HITL_PR}"
    for kv in "$@"; do
      k="${kv%%=*}"; v="${kv#*=}"
      v="${v//\\/\\\\}"; v="${v//\"/\\\"}"
      if [[ "$v" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then line+=",\"$k\":$v"; else line+=",\"$k\":\"$v\""; fi
    done
    printf '%s}\n' "$line" >>"$file"
  } 2>/dev/null || true
}
# CPU seconds (user + system) used so far by the finished, waited-for children of the calling shell
# (or subshell).
timing_child_cpu() {
  awk -v hz="$(getconf CLK_TCK 2>/dev/null || echo 100)" '{ sub(/^.*\) /, ""); printf "%.2f", ($14 + $15) / hz }' "/proc/${BASHPID:-$$}/stat" 2>/dev/null || echo 0
}
