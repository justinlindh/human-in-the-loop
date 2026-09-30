#!/usr/bin/env bash
set -euo pipefail
for era in preinternet dotcom dotcom-bust web2 classic chatgbt agents consolidation plateau; do
  for time in day night; do
    timeout 180 nice -n 10 npm run snap -- --scenario floor --quality low --time "$time" \
      --query "eras&eraArt=$era&chars=3" --eval "document.getElementById('ui').style.display='none'" \
      --out "shots/attire/lineup-$era-$time-low.png"
  done
done
for era in preinternet dotcom web2; do
  for time in day night; do
    timeout 180 nice -n 10 npm run snap -- --scenario floor --quality low --time "$time" \
      --query "eras&eraArt=$era" --out "shots/attire/office-$era-$time-low.png"
  done
done
for build in 0 1 2; do
  timeout 180 nice -n 10 npm run snap -- --scenario floor --quality low --time day --width 3840 --height 2160 \
    --query "eras&eraArt=web2&chars=4&build=$build&zoom=1.25" --eval "document.getElementById('ui').style.display='none'" \
    --out "shots/attire/tees-build$build-detail.png"
done
timeout 180 nice -n 10 npm run snap -- --scenario floor --quality low --time night --width 3840 --height 2160 \
  --query 'eras&eraArt=web2&chars=4&zoom=1.25' --eval "document.getElementById('ui').style.display='none'" \
  --out shots/attire/tees-night-detail.png
