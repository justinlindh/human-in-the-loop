#!/usr/bin/env bash
# Rebuild public/models/*.glb from the Blender scripts. Stops on the first failure.
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-blender}"
mkdir -p public/models
scripts=(blender/props/*.py)
[ -f blender/characters/chibi.py ] && scripts+=(blender/characters/chibi.py)
for s in "${scripts[@]}"; do
  name="$(basename "$s" .py)"
  out="public/models/${name}.glb"
  log="$("$BLENDER" -b --factory-startup -P "$s" -- --out "$out" 2>&1)" || { echo "$log" | tail -n 30; echo "FAILED: $s"; exit 1; }
  if ! grep -q "^MODEL " <<<"$log"; then echo "$log" | tail -n 30; echo "FAILED (no export): $s"; exit 1; fi
  grep "^MODEL " <<<"$log"
done
echo "built ${#scripts[@]} models"
