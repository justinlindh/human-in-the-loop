#!/usr/bin/env bash
# A change to a render baseline (a golden image in blender/checks/golden/, or an entry in
# blender/checks/sweep-baseline.json) needs its own before/after media on the PR, so a reviewer
# judges the new picture instead of trusting that it was meant.
#   scripts/baseline-media.sh <pr> [--sweep-dir shots/sweep]   make the media and post it
#   scripts/baseline-media.sh --check [<pr>]                    exit 1 if the PR's media is missing or stale
#   scripts/baseline-media.sh --list                            print the changed baselines, one per line
#   scripts/baseline-media.sh --dry-run <dir>                   build the media and comment into <dir>, post nothing
# Run it in the PR's checkout. Posting builds, for each changed golden, the base image beside the new
# one; for the sweep baseline, the crops (from a sweep run on this head, in --sweep-dir) of each entry
# the PR adds or makes worse, with removed entries listed. It posts them through pr-media.sh in one
# comment carrying a hidden record of each changed file's blob. --check (local CI, with HITL_PR) passes
# when a comment from a login in scripts/ci-trusted records every changed file at its current blob,
# so a baseline changed again after its media needs new media.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MARK='<!-- hitl-baseline-media'
GOLDEN=blender/checks/golden
SWEEP=blender/checks/sweep-baseline.json
usage="usage: scripts/baseline-media.sh <pr> [--sweep-dir <dir>] | --dry-run <dir> | --check [<pr>] | --list"

mode=post; pr=''; sweep_dir=shots/sweep; dry=''
while [ $# -gt 0 ]; do
  case "$1" in
    --check) mode=check; shift ;;
    --list) mode=list; shift ;;
    --sweep-dir) sweep_dir="${2:?$usage}"; shift 2 ;;
    --dry-run) dry="${2:?$usage}"; shift 2 ;;
    -*) echo "$usage" >&2; exit 2 ;;
    *) pr="$1"; shift ;;
  esac
done

base="$(git merge-base "${BASE:-origin/main}" HEAD)"
# One line per changed baseline: "<path> <blob at HEAD, or deleted>".
changed() {
  git diff --name-only --no-renames "$base" HEAD -- "$GOLDEN" "$SWEEP" | while read -r f; do
    b="$(git rev-parse -q --verify "HEAD:$f" 2>/dev/null || echo deleted)"
    echo "$f $b"
  done
}
list="$(changed)"
if [ "$mode" = list ]; then [ -n "$list" ] && echo "$list"; exit 0; fi
if [ -z "$list" ]; then echo "baseline-media: no golden or sweep-baseline changes"; exit 0; fi
pr="${pr:-${HITL_PR:-}}"

if [ "$mode" = check ]; then
  if [ -z "$pr" ]; then
    echo "baseline-media: this change moves render baselines; its PR needs before/after media (scripts/baseline-media.sh <pr>):"
    echo "$list" | sed 's/^/  /'
    exit 0
  fi
  trusted="$(grep -Ev '^[[:space:]]*(#|$)' "$HERE/ci-trusted" | jq -Rnc '[inputs]')"
  recorded="$(gh api "repos/{owner}/{repo}/issues/$pr/comments" --paginate \
    --jq ".[] | select((.body | contains(\"$MARK\")) and (.user.login as \$a | $trusted | index(\$a))) | .body" \
    | sed -n 's/^file: //p' | sort -u)"
  missing="$(comm -23 <(echo "$list" | sort -u) <(echo "$recorded"))"
  if [ -n "$missing" ]; then
    echo "baseline-media: FAIL: PR #$pr changes render baselines without before/after media for their current contents:"
    echo "$missing" | sed 's/^/  /'
    echo "Post it from the PR's checkout: scripts/baseline-media.sh $pr (for the sweep baseline, run the sweep on this head first)."
    exit 1
  fi
  echo "baseline-media: PASS: media on PR #$pr covers every changed baseline ($(echo "$list" | wc -l) file(s))"
  exit 0
fi

[ -n "$pr" ] || [ -n "$dry" ] || { echo "$usage" >&2; exit 2; }
out="$(mktemp -d)"; trap 'rm -rf "$out"' EXIT
files=(); notes=''
label() { magick "$1" -background white -gravity north -splice 0x30 -pointsize 22 -annotate +0+4 "$2" "$3"; }
while read -r f b; do
  if [ "$f" = "$SWEEP" ]; then
    git show "$base:$SWEEP" >"$out/sweep-before.json" 2>/dev/null || echo '{"accepted":[]}' >"$out/sweep-before.json"
    [ "$b" = deleted ] && echo '{"accepted":[]}' >"$out/sweep-after.json" || git show "HEAD:$SWEEP" >"$out/sweep-after.json"
    # added|worse|removed <key> [worst before -> after]
    diff="$(node -e '
      const fs = require("fs");
      const read = (p) => new Map(JSON.parse(fs.readFileSync(p, "utf8")).accepted.map((e) => [e.key, e.worst]));
      const a = read(process.argv[1]), b = read(process.argv[2]);
      for (const [k, w] of b) if (!a.has(k)) console.log(`added\t${k}\t${w}`); else if (w > a.get(k)) console.log(`worse\t${k}\t${a.get(k)} -> ${w}`);
      for (const [k, w] of a) if (!b.has(k)) console.log(`removed\t${k}\t${w}`);
    ' "$out/sweep-before.json" "$out/sweep-after.json")"
    notes+=$'\n'"**Sweep baseline**"$'\n'
    while IFS=$'\t' read -r kind key worst; do
      [ -n "$kind" ] || continue
      notes+="- $kind \`$key\` ($worst)"$'\n'
      [ "$kind" = removed ] && continue
      crop="$sweep_dir/$(sed -E 's/[^A-Za-z0-9_-]+/_/g' <<<"$key").png"
      [ -f "$crop" ] || { echo "baseline-media: no crop for $key at $crop; run node blender/checks/sweep.mjs --out $sweep_dir on this head first" >&2; exit 1; }
      label "$crop" "sweep: $kind $key" "$out/sweep-$(basename "$crop")"
      files+=("$out/sweep-$(basename "$crop")")
    done <<<"$diff"
  else
    name="$(basename "$f" .png)"
    if [ "$b" = deleted ]; then notes+="- golden \`$name\` removed"$'\n'; continue; fi
    git show "HEAD:$f" >"$out/after.png"
    label "$out/after.png" "after" "$out/after-l.png"
    if git show "$base:$f" >"$out/before.png" 2>/dev/null; then
      label "$out/before.png" "before" "$out/before-l.png"
      magick "$out/before-l.png" "$out/after-l.png" -background white -gravity center +append "$out/golden-$name.png"
      notes+="- golden \`$name\`: before | after"$'\n'
    else
      cp "$out/after-l.png" "$out/golden-$name.png"
      notes+="- golden \`$name\`: new"$'\n'
    fi
    files+=("$out/golden-$name.png")
  fi
done <<<"$list"
md=''
if [ -n "$dry" ]; then
  mkdir -p "$dry"; [ ${#files[@]} -gt 0 ] && cp "${files[@]}" "$dry/"
  md="$(for f in "${files[@]}"; do echo "![$(basename "$f" .png)]($(basename "$f"))"; done)"
elif [ ${#files[@]} -gt 0 ]; then md="$("$HERE/pr-media.sh" --print-only "$pr" "${files[@]}")"; fi
body="$(printf '%s\n%s\n-->\n### Baseline changes at %s\n%s\n%s\n' "$MARK" "$(echo "$list" | sed 's/^/file: /')" "$(git rev-parse --short HEAD)" "$notes" "$md")"
if [ -n "$dry" ]; then printf '%s' "$body" >"$dry/comment.md"; echo "baseline-media: wrote $dry/comment.md and ${#files[@]} image(s)"; exit 0; fi
gh pr comment "$pr" --body "$body" >/dev/null
echo "baseline-media: posted media for $(echo "$list" | wc -l) changed baseline(s) on PR #$pr"
