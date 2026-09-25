#!/usr/bin/env bash
# Quick gates for work in progress, on a snapshot of the working tree, so you can keep editing while
# they run. The snapshot is a throwaway worktree of HEAD with your uncommitted changes and untracked
# files applied; the gates run there side by side, then it is removed.
# Usage: npm run gates -- [--moment <name>] [--only test,clip,stage,sweep] [--keep]
#   --moment  narrows the render gates to one staged moment: a stage.mjs scenario (letter, fumes,
#             printer, visitor, hammer, ...) or a moment kind. clip runs --only=<name> when clip.mjs
#             supports it, stage runs --only=<name>, and the sweep checks only that moment's indexed
#             decision. Without it: all of clip and stage, and the sweep's fast pass over floor.
#   --only    run just these gates (default: all four)
#   --keep    keep the snapshot worktree (its path is printed)
# test is test:fast; clip, stage and sweep each take a GPU render slot (scripts/with-render-lock.sh).
# Logs go to ~/.cache/hitl-ci/gates/<time>/. Exit 0 only when every gate run passed.
set -uo pipefail
usage="usage: npm run gates -- [--moment <name>] [--only test,clip,stage,sweep] [--keep]"
moment=""; only="test,clip,stage,sweep"; keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --moment) moment="${2:?$usage}"; shift 2 ;;
    --moment=*) moment="${1#*=}"; shift ;;
    --only) only="${2:?$usage}"; shift 2 ;;
    --only=*) only="${1#*=}"; shift ;;
    --keep) keep=1; shift ;;
    -h|--help) echo "$usage"; exit 0 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
SELF="$(cd "$(dirname "$0")" && pwd)"
source "$SELF/lib/timing.sh"
source "$SELF/lib/ci-capacity.sh"
src="$(git rev-parse --show-toplevel)" || exit 2
ROOT="${HITL_GATES_ROOT:-$HOME/.cache/hitl-ci}"
stamp="$(date +%Y%m%d-%H%M%S)-$$"
snap="$ROOT/gates-$stamp"; LOGS="$ROOT/gates/$stamp"; mkdir -p "$LOGS"

# The snapshot: HEAD, plus staged and unstaged changes (deletions included), plus untracked files.
# Each gate runs in its own process group (setsid), so stopping gates (TERM from timeout or by PID,
# INT, or any exit) stops every gate and what it started, render locks released, before the snapshot goes.
pids=()
stop_gates() {
  local p left
  for p in "${pids[@]}"; do kill -TERM -- "-$p" 2>/dev/null; done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    left=0; for p in "${pids[@]}"; do kill -0 -- "-$p" 2>/dev/null && left=1; done
    [ $left = 0 ] && return; sleep 0.3
  done
  for p in "${pids[@]}"; do kill -KILL -- "-$p" 2>/dev/null; done
}
cleanup() { stop_gates; [ $keep = 1 ] || { git -C "$src" worktree remove --force "$snap" 2>/dev/null; rm -rf "$snap"; }; }
trap cleanup EXIT
trap 'exit 143' TERM INT HUP
git -C "$src" worktree add -q --detach "$snap" HEAD || { echo "gates: could not create the snapshot" >&2; exit 2; }
git -C "$src" diff --binary HEAD >"$LOGS/changes.patch"
if [ -s "$LOGS/changes.patch" ]; then
  git -C "$snap" apply --whitespace=nowarn "$LOGS/changes.patch" || { echo "gates: could not apply your uncommitted changes to the snapshot" >&2; exit 2; }
fi
(cd "$src" && git ls-files -z --others --exclude-standard | tar --null -T - -cf -) | tar -C "$snap" -xf - || { echo "gates: could not copy untracked files" >&2; exit 2; }
if [ -d "$src/node_modules" ] && cmp -s "$src/package-lock.json" "$snap/package-lock.json"; then
  ln -s "$(readlink -f "$src/node_modules")" "$snap/node_modules"
else
  (cd "$snap" && npm ci --no-audit --no-fund >"$LOGS/deps.log" 2>&1) || { echo "gates: npm ci failed (see $LOGS/deps.log)" >&2; exit 2; }
fi
changed=$(( $(grep -c '^diff --git' "$LOGS/changes.patch") + $(cd "$src" && git ls-files --others --exclude-standard | wc -l) ))
echo "gates: snapshot of $(git -C "$src" rev-parse --short HEAD) plus $changed changed file(s) at $snap"
cd "$snap"

# What each gate runs.
declare -A CMD
gpu() { echo "HITL_GL=gpu bash scripts/with-render-lock.sh --gpu timeout 900 $*"; }
workers="$(vitest_workers "$(nproc)" "$(cut -d' ' -f1 /proc/loadavg)" "$(ci_runs_going)")"
CMD[test]="npm run -s test:fast -- --maxWorkers=$workers"
if [ -n "$moment" ]; then
  # The stage scenario of that name, or one whose prop or event mentions it, gives the event to sweep.
  scen="$(node -e '
    const src = require("fs").readFileSync("blender/checks/stage.mjs", "utf8");
    const want = process.argv[1];
    const rows = [...src.matchAll(/^  ([a-z_]+): \{.*?eventId: \x27([a-z_0-9]+)\x27.*?prop: \x27([a-z_0-9]+)\x27/gm)].map((m) => ({ name: m[1], event: m[2], prop: m[3] }));
    const hit = rows.find((r) => r.name === want) ?? rows.find((r) => r.event === want || r.prop.includes(want));
    console.log(hit ? `${hit.name} ${hit.event}` : `- - ${rows.map((r) => r.name).join(",")}`);
  ' "$moment")"
  read -r sname sevent known <<<"$scen"
  if [ "$sname" = - ]; then
    echo "gates: no stage scenario matches --moment $moment (known: $known)" >&2; exit 2
  fi
  if grep -q -- '--only' blender/checks/clip.mjs; then CMD[clip]="$(gpu node blender/checks/clip.mjs --only="$moment")"
  else CMD[clip]="$(gpu node blender/checks/clip.mjs)"; echo "gates: clip.mjs has no --only here; running all of clip"; fi
  CMD[stage]="$(gpu node blender/checks/stage.mjs --only="$sname" --out "$LOGS/stage.json")"
  CMD[sweep]="$(gpu node blender/checks/sweep.mjs --gpu --mocks none --seeds none --moments "'$sevent'" --out "$LOGS/sweep")"
else
  CMD[clip]="$(gpu node blender/checks/clip.mjs)"
  CMD[stage]="$(gpu node blender/checks/stage.mjs --out "$LOGS/stage.json")"
  CMD[sweep]="$(gpu node blender/checks/sweep.mjs --gpu --mocks floor --seeds none --out "$LOGS/sweep")"
fi

# Side by side, each with its own vite cache; results in order.
names=(); t0=$SECONDS
IFS=',' read -ra want <<<"$only"
for n in "${want[@]}"; do
  [ -n "${CMD[$n]:-}" ] || { echo "gates: unknown gate $n (test, clip, stage, sweep)" >&2; exit 2; }
  names+=("$n")
  # setsid execs in place here (the child isn't a group leader), so $! is the new group's id.
  GATE_CMD="${CMD[$n]}" GATE_LOG="$LOGS/$n.log" GATE_RES="$LOGS/$n.result" HITL_VITE_CACHE=".vite/gates-$n" \
    setsid bash -c 's=$SECONDS; bash -c "$GATE_CMD" >"$GATE_LOG" 2>&1; r=$?; echo "$r $((SECONDS - s))" >"$GATE_RES"' &
  pids+=($!)
done
echo "gates: running ${names[*]}${moment:+ for $moment}; logs in $LOGS"
rc=0; table="| gate | result | seconds |"$'\n'"|---|---|---|"
for i in "${!pids[@]}"; do
  wait "${pids[$i]}"
  read -r r s <"$LOGS/${names[$i]}.result" 2>/dev/null || { r=1; s=0; }
  if [ "$r" = 0 ]; then res=pass; else res=FAIL; rc=1; echo "---- ${names[$i]} failed; last lines:"; tail -n 20 "$LOGS/${names[$i]}.log"; fi
  table+=$'\n'"| ${names[$i]} | $res | $s |"
  timing_log kind=step tool=gates step="${names[$i]}" wall_s="$s" exit="$r" ${moment:+moment=$moment}
done
echo; echo "$table"; echo
[ $keep = 1 ] && echo "gates: snapshot kept at $snap"
timing_log kind=run tool=gates wall_s=$((SECONDS - t0)) exit=$rc ${moment:+moment=$moment} changed="$changed"
exit $rc
