#!/usr/bin/env node
// The pull requests waiting for a review verdict, all of them. A PR is waiting when it is open into main,
// not a draft, not held by `awaiting-user`, from the same repo by a login in scripts/ci-trusted, its local-ci
// is green on the current head, and no verdict is on that head yet. It leaves the queue only when a verdict
// is posted on its head (or it is held, closed or pushed to a head that has not passed local-ci): nothing is
// remembered between runs, so running this again returns whatever is still waiting.
//
//   node scripts/tools/review-queue.mjs                     print the queue, one PR per line; exit 0 with
//                                                           work waiting, 3 when the queue is empty
//   node scripts/tools/review-queue.mjs --wait              block until something is waiting, then print all of it
//   node scripts/tools/review-queue.mjs --drain             stay up, printing each PR the first time it is
//                                                           waiting, and exit 0 only when none is left
//   --interval <s>   seconds between looks when waiting (default 60)
//   --timeout <s>    give up waiting after this long (exit 4); default no limit
//   --json           the queue as JSON
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const FIELDS = 'number,title,isDraft,labels,headRefOid,headRefName,author,isCrossRepository,statusCheckRollup';

const ctx = (pr, name) => ((pr.statusCheckRollup ?? []).find((c) => c.__typename === 'StatusContext' && c.context === name)?.state ?? 'none').toLowerCase();

// The waiting PRs from `gh pr list --json` rows, oldest number first.
export function waiting(prs, trusted) {
  return prs
    .filter((pr) => !pr.isDraft && !pr.isCrossRepository && trusted.includes(pr.author?.login)
      && !(pr.labels ?? []).some((l) => l.name === 'awaiting-user')
      && ctx(pr, 'local-ci') === 'success' && !['success', 'failure', 'error'].includes(ctx(pr, 'review')))
    .sort((a, b) => a.number - b.number)
    .map((pr) => ({ number: pr.number, head: pr.headRefOid.slice(0, 8), branch: pr.headRefName, title: pr.title }));
}

export const line = (w) => `#${w.number} ${w.head} ${w.branch}: ${w.title}`;

export function trustedLogins(file) {
  return readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function look(trusted) {
  const r = spawnSync('gh', ['pr', 'list', '--base', 'main', '--state', 'open', '--limit', '100', '--json', FIELDS], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`gh pr list failed: ${(r.stderr || r.stdout).trim().split('\n').slice(-1)[0]}`);
  return waiting(JSON.parse(r.stdout), trusted);
}

const sleep = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function main() {
  const { values } = parseArgs({ options: { wait: { type: 'boolean' }, drain: { type: 'boolean' }, interval: { type: 'string' }, timeout: { type: 'string' }, json: { type: 'boolean' } } });
  const interval = Number(values.interval ?? 60), timeout = values.timeout == null ? Infinity : Number(values.timeout);
  if (!(interval > 0) || !(timeout > 0)) { console.error('review-queue: --interval and --timeout want a positive number'); return 2; }
  if (values.wait && values.drain) { console.error('review-queue: --wait and --drain are alternatives'); return 2; }
  let trusted;
  try { trusted = trustedLogins(fileURLToPath(new URL('../ci-trusted', import.meta.url))); } catch (e) { console.error(`review-queue: cannot read scripts/ci-trusted: ${e.message}`); return 2; }
  const out = (queue) => console.log(values.json ? JSON.stringify(queue) : queue.map(line).join('\n'));
  const started = Date.now();
  const expired = () => (Date.now() - started) / 1000 >= timeout;
  try {
    if (values.drain) {
      const shown = new Set();
      for (;;) {
        const queue = look(trusted);
        const fresh = queue.filter((w) => !shown.has(`${w.number}@${w.head}`));
        if (fresh.length) { out(fresh); for (const w of fresh) shown.add(`${w.number}@${w.head}`); }
        if (!queue.length && shown.size) return 0;
        if (expired()) return 4;
        await sleep(interval);
      }
    }
    for (;;) {
      const queue = look(trusted);
      if (queue.length) { out(queue); return 0; }
      if (!values.wait) { if (values.json) out(queue); return 3; }
      if (expired()) return 4;
      await sleep(interval);
    }
  } catch (e) { console.error(`review-queue: ${e.message}`); return 2; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(128 + { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[s]));
  process.exit(await main());
}
