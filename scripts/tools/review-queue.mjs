#!/usr/bin/env node
// The pull requests waiting for a review verdict, all of them, in the groups the reviewer acts on
// differently. A PR is in the queue when it is open into main, not a draft, not held by `awaiting-user`,
// and no verdict is on its current head. It leaves only when a verdict is posted on that head (or it is
// held, closed or pushed to a new head): nothing is remembered between runs, so running this again returns
// whatever is still waiting.
//
//   READY       same repo, author in scripts/ci-trusted, local-ci green on the head: review it
//   DEPENDABOT  a Dependabot PR: read its diff and changelogs first (no install), CI comes after the verdict
//   OUTSIDE     a fork or an author outside scripts/ci-trusted: never fetch or run it, report to team-lead
//   CI          a trusted PR whose local-ci is failing, pending or missing (the reason is on the line); a
//               failing one can still need a verdict, a pending one is only listed
//
//   node scripts/tools/review-queue.mjs                     print the queue, one PR per line; exit 0 with
//                                                           work waiting, 3 when the queue is empty
//   node scripts/tools/review-queue.mjs --wait              block until something is waiting, then print all of it
//   node scripts/tools/review-queue.mjs --drain             stay up, printing each PR the first time it is
//                                                           waiting, and exit 0 only when none is left
//   --repo <owner/name>  look in another repository (repeat for several); default the current one
//   --interval <s>       seconds between looks when waiting (default 60)
//   --timeout <s>        give up waiting after this long (exit 4); default no limit
//   --json               the queue as JSON
// A PR with local-ci pending or missing is listed but does not end a --wait or hold a --drain open: its CI
// will finish and it will move to READY.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const FIELDS = 'number,title,isDraft,labels,headRefOid,headRefName,author,isCrossRepository,statusCheckRollup';
const DEPENDABOT = /^(app\/)?dependabot(\[bot\])?$/;

const ctx = (pr, name) => ((pr.statusCheckRollup ?? []).find((c) => c.__typename === 'StatusContext' && c.context === name)?.state ?? 'none').toLowerCase();

// The queue from `gh pr list --json` rows: [{ group, number, head, branch, title, ci, wake, repo? }], oldest number first.
export function queue(prs, trusted, repo) {
  const out = [];
  for (const pr of prs) {
    if (pr.isDraft || (pr.labels ?? []).some((l) => l.name === 'awaiting-user')) continue;
    if (['success', 'failure', 'error'].includes(ctx(pr, 'review'))) continue;
    const login = pr.author?.login ?? '';
    const ci = ctx(pr, 'local-ci');
    let group;
    if (DEPENDABOT.test(login) && !pr.isCrossRepository) group = 'DEPENDABOT';
    else if (pr.isCrossRepository || !trusted.includes(login)) group = 'OUTSIDE';
    else group = ci === 'success' ? 'READY' : 'CI';
    out.push({ group, number: pr.number, head: pr.headRefOid.slice(0, 8), branch: pr.headRefName, title: pr.title, ci,
      wake: group !== 'CI' || ci === 'failure' || ci === 'error', ...(repo ? { repo } : {}) });
  }
  const order = { READY: 0, DEPENDABOT: 1, OUTSIDE: 2, CI: 3 };
  return out.sort((a, b) => order[a.group] - order[b.group] || a.number - b.number);
}

export const line = (w) => `${w.group} ${w.repo ? `${w.repo}` : ''}#${w.number} ${w.head} ${w.branch}: ${w.title}${w.group === 'CI' ? ` (local-ci ${w.ci})` : ''}`;

export function trustedLogins(file) {
  return readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function look(trusted, repos) {
  return repos.flatMap((repo) => {
    const r = spawnSync('gh', ['pr', 'list', ...(repo ? ['--repo', repo] : []), '--base', 'main', '--state', 'open', '--limit', '100', '--json', FIELDS], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`gh pr list failed${repo ? ` for ${repo}` : ''}: ${(r.stderr || r.stdout).trim().split('\n').slice(-1)[0]}`);
    return queue(JSON.parse(r.stdout), trusted, repo);
  });
}

const sleep = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));
const key = (w) => `${w.group} ${w.repo ?? ''}#${w.number}@${w.head}`;

async function main() {
  const { values } = parseArgs({ options: { wait: { type: 'boolean' }, drain: { type: 'boolean' }, interval: { type: 'string' }, timeout: { type: 'string' }, json: { type: 'boolean' }, repo: { type: 'string', multiple: true } } });
  const interval = Number(values.interval ?? 60), timeout = values.timeout == null ? Infinity : Number(values.timeout);
  if (!(interval > 0) || !(timeout > 0)) { console.error('review-queue: --interval and --timeout want a positive number'); return 2; }
  if (values.wait && values.drain) { console.error('review-queue: --wait and --drain are alternatives'); return 2; }
  const repos = values.repo?.length ? values.repo : [null];
  const bad = repos.filter((r) => r && !/^[\w.-]+\/[\w.-]+$/.test(r));
  if (bad.length) { console.error(`review-queue: --repo wants owner/name (got ${bad.join(', ')})`); return 2; }
  let trusted;
  try { trusted = trustedLogins(fileURLToPath(new URL('../ci-trusted', import.meta.url))); } catch (e) { console.error(`review-queue: cannot read scripts/ci-trusted: ${e.message}`); return 2; }
  const out = (items) => console.log(values.json ? JSON.stringify(items) : items.map(line).join('\n'));
  const started = Date.now();
  const expired = () => (Date.now() - started) / 1000 >= timeout;
  try {
    if (values.drain) {
      const shown = new Set();
      for (;;) {
        const all = look(trusted, repos);
        const fresh = all.filter((w) => !shown.has(key(w)));
        if (fresh.length) { out(fresh); for (const w of fresh) shown.add(key(w)); }
        if (!all.some((w) => w.wake) && shown.size) return 0;
        if (expired()) return 4;
        await sleep(interval);
      }
    }
    for (;;) {
      const all = look(trusted, repos);
      if (values.wait ? all.some((w) => w.wake) : all.length) { out(all); return 0; }
      if (!values.wait) { if (values.json) out(all); return 3; }
      if (expired()) return 4;
      await sleep(interval);
    }
  } catch (e) { console.error(`review-queue: ${e.message}`); return 2; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(128 + { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[s]));
  process.exit(await main());
}
