#!/usr/bin/env bash
# Everything a review opens with, in one call: the trust gate, the PR's state, its files by owning
# lane, the sections of its description a verdict rests on, its media, and a checkout of its head.
# Usage: scripts/review-prep.sh <pr> [--dir <root>] [--no-checkout] [--base] [--diff [path...]]
#          [--since <sha>] [--head-at <sha>] [--merged] [--base-at <sha>] [--bot] [--json]
#        scripts/review-prep.sh <pr> --done [--dir <root>]   removes that PR's review worktrees
#   --dir          where checkouts go (default $HITL_REVIEW_DIR): one worktree per PR, <root>/review-<pr>,
#                  reset to the head on each run. node_modules comes from this checkout when the lockfiles
#                  match (hard-linked, or copied across filesystems), else from npm ci; the output says which.
#   --no-checkout  no worktree
#   --base         also check out the merge base with main at <root>/review-<pr>-base, for paired runs
#   --head-at <sha>  also check out an earlier head of this PR at <root>/review-<pr>-at-<sha7>, for before and
#                  after runs (the sha must be in the PR's history)
#   --merged       also check out the head merged with current origin/<base> at <root>/review-<pr>-merged,
#                  so a newer tool or check measures the PR as it would land (refuses on conflicts)
#   --base-at <sha>  the --base checkout at <sha> (say, the last passed head) instead of the merge base;
#                  implies --base
#   --diff         print the PR's diff (only these paths when given) after the stat
#   --since <sha>  print the diff from <sha> (say, the last reviewed head) to the head
#   --bot          a Dependabot PR: refuses unless the author is dependabot[bot] and only package.json,
#                  package-lock.json or .github/workflows/ change; never checks out
#   --json         the gathered facts as JSON instead of text
# The trust gate comes first: a PR from a fork, or by an author not in scripts/ci-trusted (dependabot[bot]
# only with --bot), exits 3 before anything is fetched. Exit 0 when prepared, 2 on usage or lookup errors.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LANES="$REPO/scripts/hooks/claude/lanes.txt"
MEDIA_RE='pr-media/(site-)?((pr|issue)-)?[0-9]+/[^])?" [:space:]]+'
MEDIA_EXT='\.(png|jpe?g|gif|webp|mp4|webm|mov|mkv|wav|mp3|ogg|flac|m4a)$'

# The lanes that own a path (lanes.txt; team-lead's "main" line is reported as "lead"), space separated.
owners() {
  awk -v p="$1" '!/^#/ && NF > 1 && $1 != "*" && $1 != "main" {
    for (i = 2; i <= NF; i++) { o = $i
      if ((o ~ /\/$/ && index(p, o) == 1) || p == o) { print $1; break } } }' "$LANES" | paste -sd' ' -
}
# Whether a lane may edit a path: its own line or the "*" line.
lane_may() { # <lane> <path>
  awk -v l="$1" -v p="$2" '!/^#/ && ($1 == l || $1 == "*") { for (i = 2; i <= NF; i++) { o = $i
    if ((o ~ /\/$/ && index(p, o) == 1) || p == o) { found = 1 } } } END { exit !found }' "$LANES"
}
# A "## <name>" section of a markdown body, without its heading and template comments.
section() { # <name> <body>
  awk -v h="$1" 'tolower($0) ~ "^## " tolower(h) { on = 1; next } on && /^## / { exit } on' <<<"$2" \
    | sed 's/<!--.*-->//g' | sed '/^[[:space:]]*$/d'
}
# The Gates run entry: the text after its label, and its sub-bullets.
gates() { # <body>
  awk '/\*\*Gates run:\*\*/ { rest = $0; sub(/.*\*\*Gates run:\*\*[[:space:]]*/, "", rest); if (rest != "") print rest; on = 1; next }
    on && /^[[:space:]]+[-*][[:space:]]/ { print; next } on { exit }' <<<"$1" | sed 's/<!--.*-->//g' | sed '/^[[:space:]]*$/d'
}
# Media files in text: "<file>" per line (a video's GIF preview comes with the video).
media_in() { # <text>
  local m; m="$(grep -oE "$MEDIA_RE" <<<"$1" | sed 's|.*/||' | grep -iE "$MEDIA_EXT" | sort -u)"
  while read -r f; do
    [ -n "$f" ] || continue
    case "$f" in *-preview.gif) grep -qE "^${f%-preview.gif}\.[A-Za-z0-9]+$" <<<"$m" && continue ;; esac
    echo "$f"
  done <<<"$m"
}

[ "${BASH_SOURCE[0]}" = "$0" ] || return 0

usage="usage: scripts/review-prep.sh <pr> [--dir <root>] [--no-checkout] [--base] [--diff [path...]] [--since <sha>] [--head-at <sha>] [--merged] [--base-at <sha>] [--bot] [--json]"
pr="${1:-}"; case "$pr" in ''|*[!0-9]*) echo "$usage" >&2; exit 2 ;; esac; shift
root="${HITL_REVIEW_DIR:-}"; checkout=1; want_base=0; diff=0; dpaths=(); since=""; bot=0; json=0; head_at=""; merged=0; base_at=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) root="${2:?$usage}"; shift 2 ;;
    --no-checkout) checkout=0; shift ;;
    --base) want_base=1; shift ;;
    --diff) diff=1; shift; while [ $# -gt 0 ] && [[ "$1" != --* ]]; do dpaths+=("$1"); shift; done ;;
    --since) since="${2:?$usage}"; shift 2 ;;
    --head-at) head_at="${2:?$usage}"; shift 2 ;;
    --merged) merged=1; shift ;;
    --base-at) base_at="${2:?$usage}"; want_base=1; shift 2 ;;
    --bot) bot=1; checkout=0; want_base=0; head_at=""; merged=0; base_at=""; shift ;;
    --json) json=1; shift ;;
    --done) done_=1; shift ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
if [ "${done_:-0}" = 1 ]; then
  [ -n "$root" ] || { echo "review-prep: --done needs --dir <root> or HITL_REVIEW_DIR" >&2; exit 2; }
  for wt in "$root/review-$pr" "$root/review-$pr-base" "$root/review-$pr-merged" "$root"/review-"$pr"-at-*; do
    [ -d "$wt" ] && git -C "$REPO" worktree remove --force "$wt" && echo "removed $wt"
  done
  git -C "$REPO" update-ref -d "refs/review/pr-$pr" 2>/dev/null
  exit 0
fi

# 1. Trust, before anything is fetched or run.
view="$(gh pr view "$pr" --json number,title,author,isCrossRepository,headRefName,headRefOid,baseRefName,isDraft,labels,body,createdAt,mergeable,statusCheckRollup,comments,reviews,files,url)" \
  || { echo "review-prep: can't read #$pr" >&2; exit 2; }
author="$(jq -r .author.login <<<"$view")"
[ "$(jq -r .isCrossRepository <<<"$view")" = false ] || { echo "review-prep: #$pr comes from a fork: don't fetch or run it; report it to team-lead"; exit 3; }
files="$(gh api "repos/{owner}/{repo}/pulls/$pr/files" --paginate --jq '.[] | "\(.filename)\t\(.additions)\t\(.deletions)"')" || { echo "review-prep: can't list #$pr's files" >&2; exit 2; }
if [ $bot = 1 ]; then
  [ "$author" = "dependabot[bot]" ] || { echo "review-prep: --bot is for Dependabot PRs; #$pr is by $author"; exit 3; }
  odd="$(cut -f1 <<<"$files" | grep -vE '^(package\.json|package-lock\.json|\.github/workflows/.*)$' || true)"
  [ -z "$odd" ] || { echo "review-prep: #$pr changes more than package.json, package-lock.json and .github/workflows/: don't run it; report it to team-lead:"; sed 's/^/  /' <<<"$odd"; exit 3; }
else
  grep -Ev '^[[:space:]]*(#|$)' "$REPO/scripts/ci-trusted" | grep -qxF -- "$author" \
    || { if [ "$author" = "dependabot[bot]" ]; then echo "review-prep: #$pr is a Dependabot PR: use --bot"
         else echo "review-prep: #$pr is by $author, who is not in scripts/ci-trusted: don't fetch or run it; report it to team-lead"; fi; exit 3; }
fi

head="$(jq -r .headRefOid <<<"$view")"; base="$(jq -r .baseRefName <<<"$view")"; branch="$(jq -r .headRefName <<<"$view")"
body="$(jq -r .body <<<"$view")"
git -C "$REPO" fetch -q origin "$base" "+refs/pull/$pr/head:refs/review/pr-$pr" 2>/dev/null || { echo "review-prep: can't fetch #$pr" >&2; exit 2; }
mb="$(git -C "$REPO" merge-base "origin/$base" "$head")"
behind="$(git -C "$REPO" rev-list --count "$head..origin/$base")"
parents="$(git -C "$REPO" rev-list --parents -n1 "$head" | wc -w)"

# The last verdict: its head and time.
last="$(jq -r '[.reviews[] | select(.body | startswith("**Verdict:"))] | last | if . then "\(.body | capture("head (?<h>[0-9a-f]{7,})").h // "")\t\(.submittedAt)\t\(.body | split("\n")[0])" else "" end' <<<"$view")"
IFS=$'\t' read -r last_head last_at last_line <<<"$last"
checks="$(jq -r '[.statusCheckRollup[] | "\(.context // .name)=\((.state // .conclusion // .status) | ascii_downcase)"] | unique | join(" ")' <<<"$view")"
state_of() { jq -r --arg c "$1" '[.statusCheckRollup[] | select((.context // .name) == $c) | (.state // .conclusion // .status) | ascii_downcase] | first // "none"' <<<"$view"; }

# A head that merges main: does it equal last reviewed head + that merge?
mergeonly=""
if [ "$parents" -gt 2 ] && [ -n "${last_head:-}" ] && [[ "$head" != "$last_head"* ]]; then
  git -C "$REPO" fetch -q origin "$last_head" 2>/dev/null
  full_last="$(git -C "$REPO" rev-parse -q --verify "$last_head^{commit}" 2>/dev/null)"
  p2="$(git -C "$REPO" rev-parse "$head^2")"
  if [ -n "$full_last" ]; then
    if mt="$(git -C "$REPO" merge-tree --write-tree --name-only "$full_last" "$p2" 2>/dev/null)"; then
      tree="$(head -1 <<<"$mt")"
      if [ "$tree" = "$(git -C "$REPO" rev-parse "$head^{tree}")" ]; then mergeonly="merge-only vs last reviewed head $last_head: clean, same tree as a plain merge"
      else mergeonly="merge vs last reviewed head $last_head: merges cleanly, but the head differs from a plain merge in: $(git -C "$REPO" diff --name-only "$tree" "$head" | paste -sd' ' -)"; fi
    else
      mergeonly="merge vs last reviewed head $last_head: conflicted in $(sed 1d <<<"$mt" | grep -v '^$' | grep -v '^Auto-merging\|^CONFLICT' | sort -u | paste -sd' ' -); check the resolution (--since $last_head)"
    fi
  fi
fi

# Media, with when each was posted and whether that was after the last verdict.
trusted="$(grep -Ev '^[[:space:]]*(#|$)' "$REPO/scripts/ci-trusted" | jq -Rnc '[inputs]')"
posts="$(jq -r --argjson t "$trusted" '([{at: "description", body: .body}] + [.comments[] | select(.author.login as $a | $t | index($a)) | {at: .createdAt, body: .body}]) | .[] | "\(.at)\t\(.body | @base64)"' <<<"$view")"
media=""
while IFS=$'\t' read -r at b64; do
  [ -n "$at" ] || continue
  for f in $(media_in "$(base64 -d <<<"$b64")"); do
    grep -q "^$f"$'\t' <<<"$media" || media+="$f"$'\t'"$at"$'\n'
  done
done <<<"$posts"
media="$(sed '/^$/d' <<<"$media")"

if [ $json = 1 ]; then
  jq -n --argjson v "$view" --arg mb "$mb" --arg behind "$behind" --arg mo "$mergeonly" --arg lh "${last_head:-}" --arg la "${last_at:-}" \
    --arg files "$files" --arg media "$media" --arg lanes "$(while IFS=$'\t' read -r f a d; do printf '%s\t%s\n' "$f" "$(owners "$f")"; done <<<"$files")" \
    '{number: $v.number, title: $v.title, author: $v.author.login, head: $v.headRefOid, branch: $v.headRefName, base: $v.baseRefName,
      mergeBase: $mb, behind: ($behind | tonumber), draft: $v.isDraft, labels: [$v.labels[].name], mergeable: $v.mergeable,
      checks: [$v.statusCheckRollup[] | {name: (.context // .name), state: ((.state // .conclusion // .status) | ascii_downcase)}],
      lastVerdict: {head: $lh, at: $la}, mergeOnly: $mo,
      files: [$files | split("\n")[] | select(. != "") | split("\t") | {path: .[0], add: (.[1] | tonumber), del: (.[2] | tonumber)}],
      owners: ([$lanes | split("\n")[] | select(. != "") | split("\t") | {(.[0]): .[1]}] | add),
      media: [$media | split("\n")[] | select(. != "") | split("\t") | {file: .[0], postedAt: .[1], new: ($la != "" and .[1] != "description" and .[1] > $la)}]}'
  exit 0
fi

# 2. Header.
echo "#$pr $(jq -r .title <<<"$view")"
echo "  $(jq -r .url <<<"$view")"
echo "  by $author on $branch, head ${head:0:10}; base $base, merge base ${mb:0:10}, $behind commit(s) behind"
labels="$(jq -r '[.labels[].name] | join(", ")' <<<"$view")"
echo "  $([ "$(jq -r .isDraft <<<"$view")" = true ] && echo "draft; ")labels: ${labels:-none}; mergeable: $(jq -r .mergeable <<<"$view" | tr A-Z a-z)"
echo "  review: $(state_of review), local-ci: $(state_of local-ci)"
echo "  checks: ${checks:-none}"
if [ -n "${last_head:-}" ]; then echo "  last verdict: $last_line (at $last_at)"; else echo "  last verdict: none"; fi
[ -n "$mergeonly" ] && echo "  $mergeonly"

# 3. Files by owning lane, and the parts of the description a verdict rests on.
lane="${branch%%/*}"; [ "$lane" = "$branch" ] && lane=""
echo; echo "Files ($(grep -c . <<<"$files")), by owning lane (branch lane: ${lane:-none}):"
while IFS=$'\t' read -r f a d; do
  [ -n "$f" ] || continue
  o="$(owners "$f")"; flag=""
  [ -n "$lane" ] && ! lane_may "$lane" "$f" && flag="  [outside $lane: lane exception]"
  printf '%s\t  %s +%s -%s%s\n' "${o:-unowned}" "$f" "$a" "$d" "$flag"
done <<<"$files" | sort -s -t$'\t' -k1,1 | awk -F'\t' '$1 != prev { print "  " $1 ":"; prev = $1 } { print "  " $2 }'
for s in "Affects" "Changes to how the game plays"; do
  t="$(section "$s" "$body")"; echo; echo "$s:"; if [ -n "$t" ]; then sed 's/^/  /' <<<"$t"; else echo "  (missing)"; fi
done
g="$(gates "$body")"; echo; echo "Gates run:"; if [ -n "$g" ]; then sed 's/^/  /' <<<"$g"; else echo "  (missing)"; fi

# 4. Media.
echo
if [ -n "$media" ]; then
  echo "Media ($(grep -c . <<<"$media")), * = posted after the last verdict:"
  while IFS=$'\t' read -r f at; do
    new=" "; [ -n "${last_at:-}" ] && [ "$at" != description ] && [[ "$at" > "$last_at" ]] && new="*"
    if [ "$at" = description ]; then echo "  $new $f  (in the description; its edits aren't dated)"; else echo "  $new $f  (posted $at)"; fi
  done <<<"$media"
  echo "  as flags: $(cut -f1 <<<"$media" | sed 's/^/--watched /' | paste -sd' ' -)"
else
  echo "Media: none on the PR"
fi

# 5. Checkouts.
nm() { # <worktree>: node_modules for it; prints what it did
  local wt="$1" lock; lock="$(git -C "$wt" hash-object package-lock.json 2>/dev/null)"
  if [ -f "$wt/node_modules/.hitl-lock" ] && [ "$(cat "$wt/node_modules/.hitl-lock")" = "$lock" ]; then echo "node_modules kept (same lockfile)"; return; fi
  rm -rf "$wt/node_modules"
  if [ -d "$REPO/node_modules" ] && [ "$lock" = "$(git -C "$REPO" hash-object package-lock.json 2>/dev/null)" ]; then
    if cp -al "$REPO/node_modules" "$wt/node_modules" 2>/dev/null; then how="hard-linked"
    else rm -rf "$wt/node_modules"; cp -a "$REPO/node_modules" "$wt/node_modules" 2>/dev/null && how="copied (another filesystem)"; fi
    [ -n "${how:-}" ] && echo "$lock" >"$wt/node_modules/.hitl-lock" && echo "node_modules $how from $REPO (same lockfile)" && return
    rm -rf "$wt/node_modules"
  fi
  (cd "$wt" && timeout 900 npm ci --silent >/dev/null 2>&1) && echo "$lock" >"$wt/node_modules/.hitl-lock" && echo "node_modules from npm ci (the lockfile differs)" || echo "npm ci FAILED in $wt"
}
put() { # <path> <sha>
  if [ -d "$1" ]; then git -C "$1" checkout -q --detach --force "$2" && git -C "$1" clean -fdq
  else git -C "$REPO" worktree add -q --detach "$1" "$2"; fi || { echo "review-prep: can't check out ${2:0:10} at $1" >&2; exit 2; }
  echo "  $1 at ${2:0:10}: $(nm "$1")"
}
echo
if [ $checkout = 1 ]; then
  [ -n "$root" ] || { echo "review-prep: pass --dir <root> (your scratchpad) or set HITL_REVIEW_DIR, or use --no-checkout" >&2; exit 2; }
  mkdir -p "$root" || exit 2
  echo "Checkout:"; put "$root/review-$pr" "$head"
  if [ $want_base = 1 ]; then
    bsha="$mb"
    if [ -n "$base_at" ]; then
      git -C "$REPO" fetch -q origin "$base_at" 2>/dev/null
      bsha="$(git -C "$REPO" rev-parse -q --verify "$base_at^{commit}")" || { echo "review-prep: --base-at $base_at is not a commit I can find" >&2; exit 2; }
    fi
    put "$root/review-$pr-base" "$bsha"
  fi
  if [ -n "$head_at" ]; then
    git -C "$REPO" fetch -q origin "$head_at" 2>/dev/null
    hsha="$(git -C "$REPO" rev-parse -q --verify "$head_at^{commit}")" || { echo "review-prep: --head-at $head_at is not a commit I can find" >&2; exit 2; }
    git -C "$REPO" merge-base --is-ancestor "$hsha" "$head" || { echo "review-prep: --head-at $head_at is not in #$pr's history" >&2; exit 2; }
    put "$root/review-$pr-at-${hsha:0:7}" "$hsha"
  fi
  if [ $merged = 1 ]; then
    # The head merged with the base branch as it is now, as a detached commit (no merge state in any checkout).
    if mt="$(git -C "$REPO" merge-tree --write-tree --name-only "$head" "origin/$base" 2>&1)"; then
      msha="$(git -C "$REPO" -c user.name=review -c user.email=review@localhost commit-tree "$(head -1 <<<"$mt")" -p "$head" -p "origin/$base" -m "review: #$pr merged with origin/$base")"
      put "$root/review-$pr-merged" "$msha"
    else
      echo "review-prep: #$pr does not merge cleanly into origin/$base (conflicts: $(sed 1d <<<"$mt" | grep -v '^$' | grep -v '^Auto-merging\|^CONFLICT' | sort -u | paste -sd' ' -)); no merged checkout" >&2; exit 2
    fi
  fi
elif [ $want_base = 1 ] || [ -n "$head_at" ] || [ $merged = 1 ]; then echo "(--base, --head-at, --merged and --base-at need a checkout)"
fi

# 6. Diff.
echo; echo "Diff stat (merge base to head):"; git -C "$REPO" diff --stat=100 "$mb" "$head" | sed 's/^/ /'
if [ $diff = 1 ]; then echo; git -C "$REPO" diff "$mb" "$head" -- ${dpaths[@]+"${dpaths[@]}"}; fi
if [ -n "$since" ]; then
  git -C "$REPO" fetch -q origin "$since" 2>/dev/null
  echo; echo "Diff since $since:"; git -C "$REPO" diff "$since" "$head" -- ${dpaths[@]+"${dpaths[@]}"} || exit 2
fi
exit 0
