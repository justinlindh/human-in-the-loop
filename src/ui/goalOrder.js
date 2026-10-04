// Orders goals for display: the chapter the company is in first, then goals that belong to no chapter or to
// one already behind it, then later chapters in timeline order. Within a group the data's order is kept.
function chapterOf(goal, chapters) {
  const ids = chapters.map((c) => c.id);
  const id = goal.requiredChapter ?? goal.startEras?.find((e) => ids.includes(e));
  return ids.indexOf(id);
}

export function orderGoals(goals, state) {
  const chapters = state.founding?.earlyChapters ?? [];
  if (!chapters.length) return goals;
  let left = state.week ?? 0;
  let current = chapters.length - 1;
  for (let i = 0; i < chapters.length; i++) {
    if (left < chapters[i].weeks) { current = i; break; }
    left -= chapters[i].weeks;
  }
  const rank = (g) => {
    const i = chapterOf(g, chapters);
    if (i === current) return 0;
    return i > current ? 2 + i : 1;
  };
  return goals.map((g, n) => ({ g, n, r: rank(g) })).sort((a, b) => a.r - b.r || a.n - b.n).map((x) => x.g);
}
