import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readQueue, decisionFrom, feedbackCommand } from './model.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
export function command(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 45000);
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(stderr.slice(0, 500) || 'Command failed')); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
const fields = 'number,title,url,body,comments,headRefOid,isDraft,labels,state,statusCheckRollup,updatedAt';
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const identity = input => JSON.stringify([input.repo, input.number, input.head, input.action, String(input.notes || '').trim()]);
const delivered = record => ({ ok: true, url: record.url, message: record.action === 'hold' ? 'Hold recorded on GitHub.' : 'Sent to GitHub. The owner-command worker will pick it up shortly.' });
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON required'), { status: 415 });
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 12000) throw Object.assign(new Error('Request too large'), { status: 413 }); }
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

export function createDashboard(config, run = command) {
  if (!config.token || config.token.length < 24) throw new Error('DASHBOARD_TOKEN must contain at least 24 characters');
  const sessions = new Map(), streams = new Set(), submissions = new Map(), inFlight = new Set();
  const hosts = new Set(config.hosts || ['localhost', '127.0.0.1', '[::1]', ...Object.values(networkInterfaces()).flat().map(n => n.family === 'IPv6' ? `[${n.address}]` : n.address)]);
  let state = { queue: { running: [], pending: [], recent: [] }, prs: [], githubAt: null, githubError: null, feedback: [] };
  let queueBusy = false, githubBusy = false, closed = false;
  let journalError = null, journalWrites = Promise.resolve();
  const broadcast = () => { const event = `data: ${JSON.stringify(state)}\n\n`; for (const res of streams) res.write(event); };
  const gh = async (...args) => JSON.parse(await run(['gh', ...args]));
  function journal(record) {
    // Serialize durable appends. A failed write may leave a partial record, so stop until recovery.
    const write = journalWrites.then(async () => {
      if (journalError) throw journalError;
      await mkdir(join(config.queue, 'control'), { recursive: true });
      await appendFile(join(config.queue, 'control/dashboard-feedback.jsonl'), JSON.stringify(record) + '\n', { flush: true });
    }).catch(error => { journalError = error; throw error; });
    journalWrites = write.catch(() => {});
    return write;
  }
  async function refreshQueue() {
    if (queueBusy || closed) return;
    queueBusy = true;
    try {
      const units = JSON.parse(await run(['systemctl', '--user', 'list-units', 'codex-task-*', '--output=json', '--no-pager']).catch(() => '[]'));
      state.queue = await readQueue(config.queue, config.sessions, units); state.queueError = null;
    } catch { state.queueError = 'Queue update failed. Retrying shortly.'; }
    finally { queueBusy = false; state.updatedAt = new Date().toISOString(); broadcast(); }
  }
  async function refreshGithub() {
    if (githubBusy || closed) return;
    githubBusy = true;
    try {
      const sets = await Promise.all(config.repos.map(async repo => {
        const [open, merged] = await Promise.all([
          gh('pr', 'list', '-R', repo, '--state', 'open', '--limit', '100', '--json', fields),
          gh('pr', 'list', '-R', repo, '--state', 'merged', '--limit', '8', '--json', fields),
        ]);
        return [...open, ...merged].map(pr => decisionFrom(pr, repo));
      }));
      state.prs = sets.flat(); state.githubAt = new Date().toISOString(); state.githubError = null;
    } catch { state.githubError = 'GitHub is unavailable. Showing the last successful update.'; }
    finally { githubBusy = false; broadcast(); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://raw.githubusercontent.com https://github.com https://user-images.githubusercontent.com https://github-production-user-asset-6210df.s3.amazonaws.com; media-src 'self' https://raw.githubusercontent.com https://github.com https://user-images.githubusercontent.com https://github-production-user-asset-6210df.s3.amazonaws.com; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = new URL(`http://${req.headers.host || ''}`).hostname;
      if (!hosts.has(host)) return json(res, 403, { error: 'Unknown host' });
      if (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Request origin rejected' });
      const path = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (path === '/api/session' && req.method === 'POST') {
        const input = await body(req); const given = Buffer.from(String(input.token || '')); const expected = Buffer.from(config.token);
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json(res, 401, { error: 'Incorrect access key' });
        const id = randomBytes(32).toString('hex'); sessions.set(id, Date.now() + 7 * 86400000);
        res.setHeader('Set-Cookie', `dashboard=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);
        return json(res, 200, { ok: true });
      }
      if (path.startsWith('/api/')) {
        const cookie = req.headers.cookie?.match(/(?:^|;\s*)dashboard=([a-f0-9]+)/)?.[1];
        if (!cookie || (sessions.get(cookie) || 0) < Date.now()) return json(res, 401, { error: 'Open your dashboard access link or enter the access key' });
        if (path === '/api/state' && req.method === 'GET') return json(res, 200, state);
        if (path === '/api/events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write(`data: ${JSON.stringify(state)}\n\n`); streams.add(res);
          req.on('close', () => streams.delete(res)); return;
        }
        if (path === '/api/feedback' && req.method === 'POST') {
          const input = await body(req);
          if (!config.repos.includes(input.repo) || !Number.isInteger(input.number) || input.number < 1 || !/^[a-zA-Z0-9-]{8,100}$/.test(input.id || '')) return json(res, 400, { error: 'Invalid review request' });
          const key = `${input.repo}#${input.number}`;
          const fingerprint = identity(input);
          const prior = submissions.get(input.id);
          if (prior && prior.fingerprint !== fingerprint) return json(res, 409, { error: 'Request ID already used' });
          if (prior?.result) return json(res, 200, prior.result);
          if (inFlight.has(key) || inFlight.has(input.id)) return json(res, 409, { error: 'A decision is already being submitted for this PR or request' });
          inFlight.add(key); inFlight.add(input.id);
          try {
            let message;
            try { message = feedbackCommand(input.action, input.head, String(input.notes || '')); }
            catch (error) { return json(res, 400, { error: error.message }); }
            // A marker lets a retry find a submitted comment after a lost HTTP response or restart.
            const marker = `<!-- dashboard-feedback:${input.id} -->`;
            const commentBody = `${message}\n\n${marker}\n`;
            const comments = await gh('api', `repos/${input.repo}/issues/${input.number}/comments`, '--paginate', '--slurp');
            const existing = comments.flat().find(c => c.body?.includes(marker));
            if (existing && existing.body.trim() !== commentBody.trim()) return json(res, 409, { error: 'Request ID already used for a different decision' });
            const record = { id: input.id, repo: input.repo, number: input.number, head: input.head, action: input.action, notes: String(input.notes || '').trim(), at: new Date().toISOString() };
            let url = existing?.html_url;
            if (!url) {
              const pr = await gh('pr', 'view', String(input.number), '-R', input.repo, '--json', 'headRefOid,state,labels');
              if (pr.state !== 'OPEN' || pr.headRefOid !== input.head) return json(res, 409, { error: 'This PR changed. Refresh and review the new commit before submitting.' });
              if (!pr.labels.some(l => l.name === 'awaiting-user')) return json(res, 409, { error: 'This PR is no longer awaiting a decision.' });
              // Persist identity before the write so an uncertain response cannot change its meaning.
              if (!prior) { await journal(record); submissions.set(input.id, { fingerprint }); }
              url = (await run(['gh', 'pr', 'comment', String(input.number), '-R', input.repo, '--body-file', '-'], commentBody)).trim();
            }
            record.url = url;
            await journal(record);
            const result = delivered(record);
            submissions.set(input.id, { fingerprint, result });
            state.feedback.unshift(record); state.feedback = state.feedback.slice(0, 50);
            broadcast(); void refreshGithub(); return json(res, 200, result);
          } finally { inFlight.delete(key); inFlight.delete(input.id); }
        }
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      const asset = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }[path];
      if (!asset) return json(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' }); res.end(await readFile(join(ROOT, asset[0])));
    } catch (error) { if (!res.headersSent) json(res, error.status || 502, { error: error.status ? error.message : 'Unable to complete the request. Check the service and try again.' }); else res.end(); }
  });
  const timers = [];
  return {
    server, refreshQueue, refreshGithub,
    async start() {
      const journal = await readFile(join(config.queue, 'control/dashboard-feedback.jsonl'), 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      // Never discard unknown intent: even a terminal fragment may reserve a submitted request ID.
      if (journal && !journal.endsWith('\n')) throw new Error('Feedback journal has an incomplete terminal record; restore it before starting');
      const records = journal.split('\n').filter(Boolean).map(line => JSON.parse(line));
      const restored = new Map();
      for (const record of records) {
        if (!record || !/^[a-zA-Z0-9-]{8,100}$/.test(record.id || '') || typeof record.repo !== 'string' ||
            !Number.isInteger(record.number) || record.number < 1 || typeof record.notes !== 'string' ||
            (record.url !== undefined && (typeof record.url !== 'string' || !record.url))) throw new Error('Invalid feedback journal record');
        feedbackCommand(record.action, record.head, record.notes);
        const fingerprint = identity(record), prior = restored.get(record.id);
        if (prior && prior.fingerprint !== fingerprint) throw new Error('Conflicting request identity in feedback journal');
        restored.set(record.id, { fingerprint, ...(record.url ? { result: delivered(record) } : prior?.result ? { result: prior.result } : {}) });
      }
      for (const [id, entry] of restored) submissions.set(id, entry);
      state.feedback = records.filter(record => record.url).slice(-50).reverse();
      void refreshQueue(); void refreshGithub();
      timers.push(setInterval(refreshQueue, 2000), setInterval(refreshGithub, 30000), setInterval(() => { for (const res of streams) res.write(': heartbeat\n\n'); }, 15000));
    },
    close() { closed = true; timers.forEach(clearInterval); for (const res of streams) res.end(); server.close(); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
  const config = { token: process.env.DASHBOARD_TOKEN, queue: opt('queue', join(homedir(), 'codex-queue')), sessions: opt('sessions', join(homedir(), '.codex/sessions')), repos: opt('repos', 'justinlindh/human-in-the-loop').split(',') };
  const app = createDashboard(config); const port = Number(opt('port', '8787')); const host = opt('host', '127.0.0.1');
  await app.start();
  app.server.listen(port, host, () => { console.log(`Dashboard listening on ${host}:${port}`); });
  process.on('SIGTERM', () => app.close()); process.on('SIGINT', () => app.close());
}
