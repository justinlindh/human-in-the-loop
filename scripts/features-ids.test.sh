#!/usr/bin/env bash
# Cases for scripts/features-ids.mjs against a small stand-in checkout. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
r="$tmp/root"; mkdir -p "$r/src/data" "$r/src/render" "$r/src/audio" "$r/src/sim"
cat >"$r/src/data/events.js" <<'JS'
export const EVENTS = {
  printer_jam: { id: 'printer_jam', stage: { prop: 'printer' } },
  hackathon: { id: 'hackathon', choices: [{ leaves: { prop: 'pizza_boxes' } }] },
  gift: { id: 'gift', choices: [{ grant: { item: 'arcade' } }] },
  grumble: { id: 'grumble', choices: [{ effects: {} }] },
};
JS
echo "export const ITEMS = { arcade: { id: 'arcade' }, coffee: { id: 'coffee' } };" >"$r/src/data/items.js"
echo "export const POST_IDS = ['shipped'];" >"$r/src/data/posts.js"
echo "export const PROMPT_IDS = ['late_night'];" >"$r/src/data/prompts.js"
echo "export const ERA_IDS = ['classic'];" >"$r/src/data/eras.js"
echo "export const FUNDING = { bootstrapped: { name: 'Bootstrapped' } };" >"$r/src/data/funding.js"
echo "export const MUSIC_NIGHT = { sad_lofi: { bpm: 72 } };" >"$r/src/audio/manifest.js"
printf "import * as THREE from 'three';\nconst PERKS = {\n  coffee: { cap: 2 },\n  nap_pod: { cap: 1 },\n};\n" >"$r/src/render/perks.js"
printf "import * as THREE from 'three';\nconst KINDS = ['pizza', 'printer'];\n" >"$r/src/render/moments.js"
good='# F

## Office
- Printer jam `id: printer_jam` and hackathon `id: hackathon` `id: gift`
- Arcade `id: arcade`, coffee `id: coffee` (also a perk), nap pod `id: nap_pod`, pizza `id: pizza`
- Yak `id: shipped` `id: late_night`, music night `id: sad_lofi`, era `id: classic`
- Funding `id: bootstrapped`

## Ids left out on purpose

- `printer`: a moment kind shown through `printer_jam` above.
- Events with no `stage` (for example `grumble`): decision cards only.
- Caption keys other than `printer_jam`: not announced.
'
run() { printf '%s' "$2" >"$tmp/doc.md"; out="$(node "$HERE/features-ids.mjs" --root "$r" --doc "$tmp/doc.md" 2>&1)"; rc=$?; [ $rc -eq "$1" ] || fail "$3: exit $rc, expected $1 ($out)"; }
run 0 "$good" "a complete file"
[[ "$out" == *"ok:"* ]] || fail "a pass should say ok (got: $out)"
run 1 "${good/\`id: nap_pod\`/}" "a perk with no entry"
[[ "$out" == *"perk nap_pod"* ]] || fail "the missing perk should be named (got: $out)"
run 1 "${good/\`id: gift\`/}" "an event that grants an item, with no entry"
run 1 "${good/\`id: hackathon\`/}" "an event that leaves a prop, with no entry"
run 1 "${good/\`id: sad_lofi\`/}" "a music night genre with no entry"
run 1 "${good/\`id: classic\`/\`id: clasic\`}" "a typo"
[[ "$out" == *"clasic"* && "$out" == *"era classic"* ]] || fail "a typo is both unknown and a missing entry (got: $out)"
run 0 "${good/\`id: bootstrapped\`/\`id: bootstrapped\` \`id: coffee\`}" "an id shared by two kinds, named twice"
run 1 "${good/\`id: printer_jam\` and/and}" "an id named after other than is not an exception"
[[ "$out" == *"staged event printer_jam"* ]] || fail "printer_jam should still need an entry (got: $out)"
run 0 "$(printf '%s' "$good" | sed 's/, pizza `id: pizza`//; s/^- `printer`:/- `printer` and `pizza`:/')" "a kind named in the left-out section"
printf 'export const EVENTS = {' >"$r/src/data/events.js"
run 2 "$good" "data that doesn't load"
out="$(node "$HERE/features-ids.mjs" --root "$r" --doc "$tmp/none.md")"; [ $? -eq 0 ] || fail "no file to check is a pass"

[ $fails -eq 0 ] && echo "features-ids: all cases pass" || echo "features-ids: $fails failing"
[ $fails -eq 0 ]
