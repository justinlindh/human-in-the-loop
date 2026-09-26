import { open, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const activityCache = new Map();
const read = async path => readFile(path, 'utf8').catch(() => '');
const files = async path => readdir(path).catch(() => []);
export async function tail(path, limit = 96 * 1024) {
  const file = await open(path, 'r').catch(() => null);
  if (!file) return '';
  try {
    const { size } = await file.stat();
    const buffer = Buffer.alloc(Math.min(size, limit));
    await file.read(buffer, 0, buffer.length, Math.max(0, size - limit));
    return buffer.toString('utf8');
  } finally { await file.close(); }
}

export function publicActivity(jsonl) {
  let message = '', action = '', at = null;
  for (const line of jsonl.split('\n')) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.timestamp) at = entry.timestamp;
    const p = entry.payload;
    if (entry.type !== 'response_item' || !p) continue;
    if (p.type === 'message' && p.role === 'assistant' && ['commentary', 'final', 'final_answer'].includes(p.channel || p.phase)) {
      message = (p.content || []).filter(x => x.type === 'output_text').map(x => x.text).join(' ').slice(0, 700);
    }
    if (['function_call', 'custom_tool_call'].includes(p.type)) {
      // Show the kind of operation without exposing command arguments or private reasoning.
      const name = p.name || '';
      action = /exec|shell/.test(name) ? 'Running a command' : /patch|write/.test(name) ? 'Editing files' : /wait/.test(name) ? 'Waiting for a command' : 'Using a tool';
    }
  }
  return { message, action, at };
}

async function readActivity(path) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    const cached = activityCache.get(path);
    if (cached?.size === info.size && cached.mtime === info.mtimeMs) return cached.activity;
    let offset = info.size, remainder = Buffer.alloc(0), activity = {};
    // Read complete records backwards; a large tool result must not hide public progress.
    while (offset > 0 && (!activity.message || !activity.action)) {
      const count = Math.min(offset, 256 * 1024); offset -= count;
      const chunk = Buffer.alloc(count); await file.read(chunk, 0, count, offset);
      const bytes = Buffer.concat([chunk, remainder]);
      const boundary = offset === 0 ? 0 : bytes.indexOf(10) + 1;
      if (boundary === 0 && offset > 0) { remainder = bytes; continue; }
      const older = publicActivity(bytes.subarray(boundary).toString('utf8'));
      activity = { message: activity.message || older.message, action: activity.action || older.action, at: activity.at || older.at };
      remainder = bytes.subarray(0, boundary);
    }
    activityCache.set(path, { size: info.size, mtime: info.mtimeMs, activity });
    return activity;
  } finally { await file.close(); }
}

export function queueEvents(text) {
  const runs = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^(\S+) (start|end) (\S+\.md)(?: exit (\d+))?/);
    if (!match) continue;
    const [, at, kind, name, code] = match;
    const run = runs.get(name) || {};
    if (kind === 'start') { run.startedAt = at; delete run.endedAt; delete run.exitCode; }
    else { run.endedAt = at; run.exitCode = Number(code); }
    runs.set(name, run);
  }
  return runs;
}

export async function readQueue(root, sessionsRoot, activeUnits = []) {
  const [eventsText, logNames, running, pending, done, coordinator] = await Promise.all([
    read(join(root, 'queue.log')), files(join(root, 'logs')), files(join(root, 'running')),
    files(join(root, 'todo')), files(join(root, 'done')), read(join(root, 'control/status.md')),
  ]);
  const events = queueEvents(eventsText);
  const sessionCache = new Map();
  const tasks = async (names, folder) => Promise.all(names.filter(n => n.endsWith('.md')).map(async name => {
    const prompt = await read(join(root, folder, name));
    const title = prompt.match(/^#\s+(.+)$/m)?.[1] || name.replace(/\.md$/, '');
    const prefix = name.replace(/\.md$/, '') + '.';
    const log = logNames.filter(n => n.startsWith(prefix) && n.endsWith('.log')).sort().at(-1);
    let activity = {}, updatedAt = null;
    if (log && folder === 'running') {
      const path = join(root, 'logs', log);
      updatedAt = (await stat(path).catch(() => null))?.mtime.toISOString();
      const handle = await open(path, 'r');
      let header;
      try { const b = Buffer.alloc(4096); const r = await handle.read(b, 0, b.length, 0); header = b.subarray(0, r.bytesRead).toString(); }
      finally { await handle.close(); }
      const id = header.match(/^session id: (.+)$/m)?.[1];
      const date = log.match(/\.(\d{4})(\d{2})(\d{2})-/);
      if (id && date && sessionsRoot) {
        const dir = join(sessionsRoot, date[1], date[2], date[3]);
        if (!sessionCache.has(dir)) sessionCache.set(dir, await files(dir));
        const rollout = sessionCache.get(dir).find(n => n.endsWith(`${id}.jsonl`));
        if (rollout) {
          activity = await readActivity(join(dir, rollout));
        }
      }
    }
    const run = events.get(name) || {};
    const live = activeUnits.some(u => u.unit?.endsWith(`-${name.replace(/\.md$/, '')}.service`) && u.active === 'active');
    return { id: name, title, ...run, updatedAt, activity, status: folder === 'running' ? (live ? 'working' : 'interrupted') : folder === 'todo' ? 'queued' : 'ended' };
  }));
  const recent = done.filter(n => n.endsWith('.md')).sort((a, b) => (events.get(b)?.endedAt || '').localeCompare(events.get(a)?.endedAt || '')).slice(0, 12);
  return {
    paused: Boolean(await stat(join(root, 'PAUSED')).catch(() => null)),
    running: await tasks(running, 'running'), pending: await tasks(pending, 'todo'), recent: await tasks(recent, 'done'),
    coordinator: coordinator.slice(0, 10000),
  };
}

export function mediaFrom(text) {
  const out = [], seen = new Set();
  for (const match of text.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
    let url;
    try { url = new URL(match[0].replace(/&amp;/g, '&')); } catch { continue; }
    if (url.username || url.password) continue;
    if (!['github.com', 'raw.githubusercontent.com', 'user-images.githubusercontent.com', 'github-production-user-asset-6210df.s3.amazonaws.com'].includes(url.hostname)) continue;
    if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) {
      url.hostname = 'raw.githubusercontent.com'; url.pathname = url.pathname.replace('/blob/', '/'); url.search = '';
    }
    const ext = url.pathname.match(/\.(png|jpg|jpeg|webp|gif|mp4|webm)$/i)?.[1]?.toLowerCase();
    if (!ext || seen.has(url.href)) continue;
    seen.add(url.href);
    let label = url.pathname.split('/').at(-1);
    try { label = decodeURIComponent(label); } catch { /* Keep malformed escape sequences as literal text. */ }
    out.push({ url: url.href, type: ['mp4', 'webm'].includes(ext) ? 'video' : 'image', label });
  }
  return out.slice(0, 16);
}

export function decisionFrom(pr, repo) {
  const comments = (pr.comments || []).map(c => c.body || '');
  const waiting = pr.state === 'OPEN' && (pr.labels?.some(l => l.name === 'awaiting-user') || pr.isDraft);
  return {
    id: `${repo}#${pr.number}`, repo, number: pr.number, title: pr.title, url: pr.url, head: pr.headRefOid,
    status: waiting ? 'decision' : pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : 'checks',
    body: pr.body || '', media: mediaFrom([...comments.toReversed(), pr.body].join('\n')),
    comments: (pr.comments || []).slice(-4).map(c => ({ body: c.body, at: c.createdAt })),
    checks: (pr.statusCheckRollup || []).map(c => ({ name: c.name || c.context, state: c.conclusion || c.state || c.status })),
    updatedAt: pr.updatedAt,
  };
}

export function feedbackCommand(action, head, notes = '') {
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error('Invalid commit');
  if (action === 'ship') return `/ship ${head}${notes.trim() ? '\n\n' + notes.trim() : ''}`;
  if (action === 'revise' && notes.trim()) return `/revise [head:${head}] ${notes.trim()}`;
  if (action === 'hold' && notes.trim()) return `Owner decision: hold on ${head}\n\n${notes.trim()}`;
  throw new Error('Choose an action and include notes for a revision or hold');
}
