#!/usr/bin/env bash
# Builds the installable app's icons in public/pwa/ from the square logo (docs/readme/logo-square.png):
# any-purpose 192 and 512, a maskable 512 (the logo inside the safe zone on the page colour) and the
# 180 px icon iOS uses for Add to Home Screen (opaque, so it gets the page colour too).
# Usage: scripts/pwa-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
src=docs/readme/logo-square.png; out=public/pwa; bg='#efe6d6'
mkdir -p "$out"
magick "$src" -resize 192x192 "$out/icon-192.png"
magick "$src" -resize 512x512 "$out/icon-512.png"
magick "$src" -resize 410x410 -background "$bg" -gravity center -extent 512x512 "$out/icon-maskable-512.png"
magick "$src" -resize 148x148 -background "$bg" -gravity center -extent 180x180 "$out/apple-touch-icon.png"
ls -l "$out"
