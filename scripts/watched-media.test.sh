#!/usr/bin/env bash
# Cases for scripts/lib/watched-media.sh, with gh stubbed. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
# gh pr view prints the PR the case wrote to $tmp/pr.json.
printf '#!/usr/bin/env bash\ncat "%s/pr.json"\n' "$tmp" >"$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
pr() { # <files as a JSON array> <body> [<comment author> <comment body>]
  jq -n --argjson f "$1" --arg b "$2" --arg a "${3:-}" --arg c "${4:-}" \
    '{ body: $b, files: ($f | map({ path: . })), comments: (if $a == "" then [] else [{ author: { login: $a }, body: $c }] end) }' >"$tmp/pr.json"
}
check() { printf '%s\n' "$1" >"$tmp/body"; PATH="$tmp/bin:$PATH" bash "$HERE/lib/watched-media.sh" 9 "$tmp/body"; }
url() { echo "![x](https://github.com/o/r/blob/pr-media/pr-9/$1?raw=true)"; }

pr '["scripts/x.sh"]' 'tooling only'
out="$(check 'looks right')"; [ $? -eq 0 ] || fail "no media, nothing visible: should pass: $out"

pr '["src/render/a.js"]' 'a render change'
out="$(check 'looks right')"; [ $? -eq 1 ] && grep -q 'has no media' <<<"$out" || fail "visible change without media: $out"

pr '["src/sim/a.js"]' "$(url clip.mp4)
$(url clip-preview.gif)
$(url still.png)
[notes](https://github.com/o/r/blob/pr-media/pr-9/notes.txt?raw=true)"
out="$(check 'looks right')"; [ $? -eq 1 ] && grep -q 'clip.mp4' <<<"$out" && grep -q 'still.png' <<<"$out" || fail "media without Watched: $out"
grep -q 'preview.gif\|notes.txt' <<<"$out" && fail "a video's preview and a text file are not media to watch: $out"
out="$(check '**Watched:** clip.mp4')"; [ $? -eq 1 ] && grep -q 'still.png' <<<"$out" && ! grep -q 'clip.mp4' <<<"$out" || fail "partly watched: $out"
out="$(check 'Summary.
**Watched:** clip.mp4 (all of it), still.png')"; [ $? -eq 0 ] || fail "all watched should pass: $out"

pr '["src/ui/a.js"]' 'body' justinlindh "$(url after.png)"
out="$(check 'Watched: none')"; [ $? -eq 1 ] && grep -q after.png <<<"$out" || fail "media in a trusted comment counts: $out"
pr '["scripts/x.sh"]' 'body' stranger "$(url bait.png)"
out="$(check 'fine')"; [ $? -eq 0 ] || fail "media from an outside commenter does not bind the verdict: $out"

[ $fails -eq 0 ] && echo "watched-media: all cases pass"
exit $fails
