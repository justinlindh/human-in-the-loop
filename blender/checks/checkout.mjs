// Which code a report was made from: the checkout's head commit and whether it had uncommitted changes
// (untracked files don't count). sweep.mjs stamps its report.json with it; dump.mjs --sweep-row compares.
import { spawnSync } from 'node:child_process';

const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

// { commit, dirty }, or null outside a git checkout.
export function checkoutOf(root) {
  const head = git(root, ['rev-parse', 'HEAD']);
  if (head.status !== 0) return null;
  const st = git(root, ['status', '--porcelain', '--untracked-files=no']);
  return { commit: head.stdout.trim(), dirty: st.status === 0 ? st.stdout.trim() !== '' : null };
}

// One line saying why a report's rows may not match this checkout, or null when they should.
export function checkoutMismatch(report, now) {
  const was = report?.checkout;
  if (!was?.commit) return "report has no commit; can't check it was made from this checkout";
  if (!now) return "this is not a git checkout; can't check the report was made from it";
  const s = (c) => c.slice(0, 8);
  if (was.commit !== now.commit) return `report made at ${s(was.commit)}${was.dirty ? ' (with uncommitted changes)' : ''}, this checkout is at ${s(now.commit)}${now.dirty ? ' (with uncommitted changes)' : ''}: its scenes may differ`;
  if (was.dirty || now.dirty) return `report made at ${s(was.commit)}, as this checkout is, but ${was.dirty && now.dirty ? 'both had' : was.dirty ? 'the report run had' : 'this checkout has'} uncommitted changes: its scenes may differ`;
  return null;
}
