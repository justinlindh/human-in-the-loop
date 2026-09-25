#!/usr/bin/env bash
# Runs shell commands side by side, each with its own vite dependency cache (HITL_VITE_CACHE), then
# prints each one's output in order under a header. Exits 0 only if every command did.
# Usage: scripts/lib/run-parallel.sh <name>=<command> ...
set -uo pipefail
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
names=(); pids=()
for arg in "$@"; do
  name="${arg%%=*}"; cmd="${arg#*=}"
  names+=("$name")
  HITL_VITE_CACHE=".vite/parallel-$name" bash -c "$cmd" >"$dir/$name.log" 2>&1 &
  pids+=($!)
done
rc=0
for i in "${!pids[@]}"; do
  wait "${pids[$i]}"; r=$?
  echo "==== ${names[$i]} (exit $r)"
  cat "$dir/${names[$i]}.log"
  [ $r -eq 0 ] || rc=$r
done
exit $rc
