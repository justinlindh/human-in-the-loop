#!/usr/bin/env bash
# Cases for scripts/lib/watched-media.sh and review-verdict.sh's --watched and --code-only, with gh
# stubbed. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
# gh pr view prints the PR the case wrote to $tmp/pr.json (or its head for --jq .headRefOid); gh pr
# review saves the posted body; gh api answers with nothing.
cat >"$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
case "\$1 \$2" in
  "pr view") case "\$*" in *headRefOid*) echo abcdef0123456789 ;; *) cat "$tmp/pr.json" ;; esac ;;
  "pr review") while [ \$# -gt 0 ]; do [ "\$1" = --body-file ] && cp "\$2" "$tmp/posted"; shift; done ;;
esac
exit 0
EOF
chmod +x "$tmp/bin/gh"
pr() { # <files as a JSON array> <body> [<comment author> <comment body>]
  jq -n --argjson f "$1" --arg b "$2" --arg a "${3:-}" --arg c "${4:-}" \
    '{ body: $b, files: ($f | map({ path: . })), comments: (if $a == "" then [] else [{ author: { login: $a }, body: $c }] end) }' >"$tmp/pr.json"
}
check() { PATH="$tmp/bin:$PATH" bash "$HERE/lib/watched-media.sh" 9 "$@"; }
url() { echo "![x](https://github.com/o/r/blob/pr-media/pr-9/$1?raw=true)"; }
template='- **Screenshots or clips:** <!-- post them with `scripts/pr-media.sh --comment <pr> <files>` -->'

pr '["scripts/x.sh"]' "tooling only
$template"
out="$(check)"; [ $? -eq 0 ] || fail "no media, nothing visible, empty template line: should pass: $out"

pr '["src/render/a.js"]' 'a render change'
out="$(check)"; [ $? -eq 1 ] && grep -q 'has no media' <<<"$out" || fail "visible change without media: $out"
out="$(check --code-only 'lighting constant only')"; [ $? -eq 0 ] || fail "--code-only lets it through: $out"

pr '["scripts/x.sh"]' '- **Screenshots or clips:** None; tooling only.'
out="$(check)"; [ $? -eq 0 ] || fail "a Screenshots entry of none: $out"
pr '["scripts/x.sh"]' '- Screenshots or clips: not applicable to this change.'
out="$(check)"; [ $? -eq 0 ] || fail "a Screenshots entry of not applicable: $out"
pr '["scripts/x.sh"]' '- **Screenshots or clips:** see the comment below'
out="$(check)"; [ $? -eq 1 ] && grep -q 'has no media' <<<"$out" || fail "a Screenshots entry with no media posted: $out"

pr '["src/sim/a.js"]' "$(url clip.mp4)
$(url clip-preview.gif)
$(url still.png)
[notes](https://github.com/o/r/blob/pr-media/pr-9/notes.txt?raw=true)"
out="$(check)"; [ $? -eq 1 ] && grep -q 'clip.mp4' <<<"$out" && grep -q 'still.png' <<<"$out" || fail "media without --watched: $out"
grep -q 'preview.gif\|notes.txt' <<<"$out" && fail "a video's preview and a text file are not media to watch: $out"
out="$(check --watched clip.mp4)"; [ $? -eq 1 ] && grep -q 'still.png' <<<"$out" && ! grep -q 'clip.mp4' <<<"$out" || fail "partly watched: $out"
out="$(check --watched clip.mp4 --watched 'https://github.com/o/r/blob/pr-media/pr-9/still.png?raw=true')"
[ $? -eq 0 ] || fail "all watched, by name and by URL, should pass: $out"
out="$(check --watched clip.mp4 --watched still.png --watched stil.png)"
[ $? -eq 1 ] && grep -q 'no media named' <<<"$out" && grep -q 'stil.png' <<<"$out" || fail "a misspelt name is refused: $out"

pr '["src/ui/a.js"]' 'body' justinlindh "$(url after.png)"
out="$(check --watched other.png)"; [ $? -eq 1 ] && grep -q after.png <<<"$out" || fail "media in a trusted comment counts: $out"
pr '["scripts/x.sh"]' 'body' stranger "$(url bait.png)"
out="$(check)"; [ $? -eq 0 ] || fail "media from an outside commenter does not bind the verdict: $out"

# review-verdict.sh: refuses before posting, and prints what was watched or why not into the verdict.
verdict() { rm -f "$tmp/posted"; printf 'Looks right.\n' >"$tmp/body"; PATH="$tmp/bin:$PATH" bash "$HERE/review-verdict.sh" 9 "$@" 2>&1; }
pr '["src/ui/a.js"]' "$(url after.png)"
out="$(verdict pass "$tmp/body")"; [ $? -eq 1 ] && [ ! -f "$tmp/posted" ] || fail "review-verdict posts a pass that watched nothing: $out"
out="$(verdict pass "$tmp/body" --watched after.png)"
[ $? -eq 0 ] && grep -qx 'Watched: after.png' "$tmp/posted" || fail "review-verdict lists the watched media: $out"
out="$(verdict pass "$tmp/body" --code-only 'a comment typo')"
[ $? -eq 0 ] && grep -qx 'Judged from the code only: a comment typo' "$tmp/posted" || fail "review-verdict prints --code-only: $out"
out="$(verdict changes "$tmp/body")"; [ $? -eq 0 ] && [ -f "$tmp/posted" ] || fail "changes needs no media: $out"

[ $fails -eq 0 ] && echo "watched-media: all cases pass"
exit $fails
