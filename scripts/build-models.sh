#!/usr/bin/env bash
# Rebuild public/models/*.glb from the Blender scripts. Stops on the first failure.
# Item scripts (blender/items) write <item>_l1.glb to <item>_l3.glb from one --out path.
set -euo pipefail
cd "$(dirname "$0")/.."
# The run's wall and CPU time go to the team's timing log.
source scripts/lib/timing.sh
trap 'rc=$?; timing_log kind=run tool=build-models wall_s=$SECONDS cpu_s="$(timing_child_cpu)" exit=$rc' EXIT
BLENDER="${BLENDER:-blender}"
mkdir -p public/models
scripts=(blender/props/*.py blender/items/*.py)
[ -f blender/characters/chibi.py ] && scripts+=(blender/characters/chibi.py)
[ -f blender/characters/chibi_rig.py ] && scripts+=(blender/characters/chibi_rig.py)
[ -f blender/characters/pets.py ] && scripts+=(blender/characters/pets.py)
models=0
# Coplanar overlapping faces (z-fighting) found by common.zfight_report, collected for review.
zlog="$(mktemp)"
for s in "${scripts[@]}"; do
  name="$(basename "$s" .py)"
  out="public/models/${name}.glb"
  log="$("$BLENDER" -b --factory-startup -P "$s" -- --out "$out" 2>&1)" || { echo "$log" | tail -n 30; echo "FAILED: $s"; exit 1; }
  if ! grep -q "^MODEL " <<<"$log"; then echo "$log" | tail -n 30; echo "FAILED (no export): $s"; exit 1; fi
  grep "^MODEL " <<<"$log"
  grep "^ZFIGHT " <<<"$log" >>"$zlog" || true
  models=$((models + $(grep -c "^MODEL " <<<"$log")))
done
echo "built ${models} models from ${#scripts[@]} scripts"
if [ -s "$zlog" ]; then echo "z-fighting report ($(wc -l <"$zlog") pairs):"; sed 's/^/  /' "$zlog"; else echo "z-fighting report: clean"; fi
rm -f "$zlog"

# Contact sheets: every model from five views (front, 3/4, side, back, top) with level variants
# as rows, rendered on the GPU into shots/sheets/ for review before committing. SHEETS=0 skips them.
if [ "${SHEETS:-1}" != 0 ]; then
  log="$("$BLENDER" -b --factory-startup -P blender/sheets/contact_sheets.py -- --models public/models --out shots/sheets 2>&1)" || { echo "$log" | tail -n 30; echo "FAILED: contact sheets"; exit 1; }
  echo "contact sheets: $(grep -c '^SHEET ' <<<"$log") in shots/sheets"
fi

# Object icons are renders of the models above, so they rebuild after them.
log="$("$BLENDER" -b --factory-startup -P blender/icons/render_icons.py -- --out public/icons/objects 2>&1)" || { echo "$log" | tail -n 30; echo "FAILED: icons"; exit 1; }
grep "^rendered " <<<"$log"
