#!/usr/bin/env node
// The pull requests waiting for a review verdict, all of them, in the groups the reviewer acts on
// differently. A PR is in the queue when it is open into main, not a draft, not held by `awaiting-user`,
// and no verdict is on its current head. It leaves only when a verdict is posted on that head (or it is
// held, closed or pushed to a new head): nothing is remembered between runs, so running this again returns
// whatever is still waiting.
//
//   READY       same repo, author in scripts/ci-trusted, every check branch protection requires (less review) passing on the head: review it
//   DEPENDABOT  a Dependabot PR: read its diff and changelogs first (no install), CI comes after the verdict
//   OUTSIDE     a fork or an author outside scripts/ci-trusted: never fetch or run it, report to team-lead
//   CI          a trusted PR with a required check failing, pending or not reported (the reason is on the line); a
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
// A PR with a required check pending or missing is listed but does not end a --wait or hold a --drain open: its CI
// will finish and it will move to READY.
// --wait and --drain at an interval of 15 s or more read the current repository's PRs from the shared
// snapshot (pr-snapshot.mjs), so several queues and watchers cost one `gh pr list` per interval; a
// one-shot run always asks GitHub.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ensureFresh } from './pr-snapshot.mjs';

const FIELDS = 'number,title,isDraft,labels,headRefOid,headRefName,author,isCrossRepository,statusCheckRollup';
const DEPENDABOT = /^(app\/)?dependabot(\[bot\])?$/;

const ctx = (pr, name) => ((pr.statusCheckRollup ?? []).find((c) => c.__typename === 'StatusContext' && c.context === name)?.state ?? 'none').toLowerCase();

// One check's state on a PR's head, by name, whether it is a commit status or a check run:
// success (success, skipped, neutral), failure, pending (running, or a status still pending) or none (not reported).
const OK = new Set(['success', 'skipped', 'neutral']), BAD = new Set(['failure', 'error', 'cancelled', 'timed_out', 'action_required']);
export function checkState(pr, name) {
  const c = (pr.statusCheckRollup ?? []).find((x) => (x.__typename === 'StatusContext' ? x.context : x.name) === name);
  if (!c) return 'none';
  const s = String(c.__typename === 'StatusContext' ? c.state : c.status === 'COMPLETED' ? c.conclusion : 'pending').toLowerCase();
  return OK.has(s) ? 'success' : BAD.has(s) ? 'failure' : 'pending';
}

// The checks a PR must pass before it is worth a review: `required` (the names branch protection requires,
// less review); with no list (the rules could not be read) every reported check but review and local-ci.
const neededChecks = (pr, required) => required ?? (pr.statusCheckRollup ?? []).map((x) => (x.__typename === 'StatusContext' ? x.context : x.name)).filter((n) => n && n !== 'review' && n !== 'local-ci');

// The queue from `gh pr list --json` rows: [{ group, number, head, branch, title, ci, waiting, wake, repo? }], oldest number first.
// `ci` is success when every required check passed, failure when one failed, else pending; `waiting` lists the
// ones that have not passed, as `name state`.
export function queue(prs, trusted, repo, required = null) {
  const out = [];
  for (const pr of prs) {
    if (pr.isDraft || (pr.labels ?? []).some((l) => l.name === 'awaiting-user')) continue;
    if (['success', 'failure', 'error'].includes(ctx(pr, 'review'))) continue;
    const login = pr.author?.login ?? '';
    const states = neededChecks(pr, required).map((n) => [n, checkState(pr, n)]);
    const waiting = states.filter(([, s]) => s !== 'success').map(([n, s]) => `${n} ${s}`);
    // Rules unreadable and nothing reported on the head yet: not ready.
    if (!states.length && required === null) waiting.push('checks none');
    const ci = states.some(([, s]) => s === 'failure') ? 'failure' : waiting.length ? 'pending' : 'success';
    let group;
    if (DEPENDABOT.test(login) && !pr.isCrossRepository) group = 'DEPENDABOT';
    else if (pr.isCrossRepository || !trusted.includes(login)) group = 'OUTSIDE';
    else group = ci === 'success' ? 'READY' : 'CI';
    out.push({ group, number: pr.number, head: pr.headRefOid.slice(0, 8), branch: pr.headRefName, title: pr.title, ci, waiting,
      wake: group !== 'CI' || ci === 'failure', ...(repo ? { repo } : {}) });
  }
  const order = { READY: 0, DEPENDABOT: 1, OUTSIDE: 2, CI: 3 };
  return out.sort((a, b) => order[a.group] - order[b.group] || a.number - b.number);
}

export const line = (w) => `${w.group} ${w.repo ? `${w.repo}` : ''}#${w.number} ${w.head} ${w.branch}: ${w.title}${w.group === 'CI' ? ` (${w.waiting.join(', ')})` : ''}`;

// The checks branch protection requires on main, less review, read from the API (cached for a few minutes);
// null when they cannot be read, and queue() then falls back to every reported check.
const rulesCache = new Map();
export function requiredChecks(repo, now = Date.now()) {
  const hit = rulesCache.get(repo ?? '');
  if (hit && now - hit.at < 300000) return hit.names;
  const r = spawnSync('gh', ['api', `repos/${repo ?? '{owner}/{repo}'}/branches/main/protection`], { encoding: 'utf8' });
  let names = null;
  if (r.status === 0) { try { const c = JSON.parse(r.stdout).required_status_checks?.contexts; if (Array.isArray(c)) names = c.filter((n) => typeof n === 'string' && n !== 'review'); } catch { /* unreadable */ } }
  rulesCache.set(repo ?? '', { at: now, names });
  return names;
}

export function trustedLogins(file) {
  return readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

// While waiting at a normal pace (an interval of 15 s or more) the current repository's PRs come from
// the shared snapshot (pr-snapshot.mjs), refreshed when older than maxAgeMs. A one-shot run, a faster
// interval and another repository ask GitHub directly.
const MIN_SNAPSHOT_AGE_MS = 15000;
async function look(trusted, repos, maxAgeMs) {
  const out = [];
  for (const repo of repos) {
    let prs;
    if (!repo && maxAgeMs >= MIN_SNAPSHOT_AGE_MS) {
      const snap = await ensureFresh({ maxAgeMs });
      if (!snap) throw new Error('gh pr list failed: no PR snapshot and GitHub could not be read');
      if (snap.isStale) console.error(`review-queue: GitHub could not be read (${snap.error ?? 'unknown'}); using the snapshot from ${Math.round((Date.now() - snap.fetchedAt) / 1000)} s ago`);
      prs = snap.prs.filter((p) => (p.baseRefName ?? 'main') === 'main');
    } else {
      const r = spawnSync('gh', ['pr', 'list', ...(repo ? ['--repo', repo] : []), '--base', 'main', '--state', 'open', '--limit', '100', '--json', FIELDS], { encoding: 'utf8', maxBuffer: 1 << 26 });
      if (r.status !== 0) throw new Error(`gh pr list failed${repo ? ` for ${repo}` : ''}: ${(r.stderr || r.stdout).trim().split('\n').slice(-1)[0]}`);
      prs = JSON.parse(r.stdout);
    }
    out.push(...queue(prs, trusted, repo, requiredChecks(repo)));
  }
  return out;
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
      let woke = false;
      for (;;) {
        const all = await look(trusted, repos, interval * 1000);
        const fresh = all.filter((w) => !shown.has(key(w)));
        if (fresh.length) { out(fresh); for (const w of fresh) shown.add(key(w)); }
        // Done once something that needed a look has been shown and nothing does now; a queue that so far holds
        // only pending CI keeps waiting for it to finish.
        if (all.some((w) => w.wake)) woke = true;
        else if (woke) return 0;
        if (expired()) return 4;
        await sleep(interval);
      }
    }
    for (;;) {
      const all = await look(trusted, repos, values.wait ? interval * 1000 : 0);
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
