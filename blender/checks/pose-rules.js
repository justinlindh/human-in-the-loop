// Judge each scene subject against the requested frames, including absent samples.
export function judgeScene(rows, frames, who, rules) {
  const ids = [...new Set([...(who ?? []), ...rows.map((r) => r.id), ...rules.flatMap((r) => r.id ? [r.id] : [])])];
  const cmp = { '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '>': (a, b) => a > b };
  const samples = new Map(ids.map((id) => [id, frames.map((frame) => rows.find((r) => r.id === id && r.frame === frame))]));
  const missing = ids.map((id) => ({ id, frames: frames.filter((_, i) => !samples.get(id)[i]) })).filter((r) => r.frames.length);
  const verdicts = rules.flatMap((rule) => (rule.id ? [rule.id] : ids).map((id) => {
    const mine = samples.get(id);
    const share = mine.filter((r) => r && Number.isFinite(r[rule.measure]) && cmp[rule.op](r[rule.measure], rule.value)).length / Math.max(1, frames.length);
    return { id, rule, share, pass: frames.length > 0 && mine.every(Boolean) && share >= rule.share };
  }));
  return { missing, verdicts, pass: ids.length > 0 && frames.length > 0 && missing.length === 0 && verdicts.every((r) => r.pass) };
}
