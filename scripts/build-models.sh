#!/usr/bin/env bash
# Rebuild public/models/*.glb from the Blender scripts. Stops on the first failure.
# Item scripts (blender/items) write <item>_l1.glb to <item>_l3.glb from one --out path.
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-blender}"
mkdir -p public/models
scripts=(blender/props/*.py blender/items/*.py)
[ -f blender/characters/chibi.py ] && scripts+=(blender/characters/chibi.py)
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

# Object icons are renders of the models above, so they rebuild after them.
log="$("$BLENDER" -b --factory-startup -P blender/icons/render_icons.py -- --out public/icons/objects 2>&1)" || { echo "$log" | tail -n 30; echo "FAILED: icons"; exit 1; }
grep "^rendered " <<<"$log"
