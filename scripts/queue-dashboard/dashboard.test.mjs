import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, appendFile, chmod, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createDashboard } from './server.mjs';
import { publicActivity, queueEvents, readQueue, decisionFrom, feedbackCommand } from './model.mjs';
const head = 'a'.repeat(40), token = 'test-dashboard-token-with-enough-characters';

test('activity exposes commentary and operation type, never analysis or command arguments', () => {
  const entries = [
    { type: 'response_item', payload: { type: 'message', role: 'assistant', channel: 'analysis', content: [{ type: 'output_text', text: 'private reasoning' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Testing the queue.' }] } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', arguments: '{"cmd":"secret-token"}' } },
  ];
  const result = publicActivity(entries.map(JSON.stringify).join('\n'));
  assert.equal(result.message, 'Testing the queue.'); assert.equal(result.action, 'Running a command');
  assert.ok(!JSON.stringify(result).includes('private')); assert.ok(!JSON.stringify(result).includes('secret'));
});
test('queue retries reset completion and missing units are not called running', async () => {
  const events = queueEvents('2026-01-01T00:00:00Z start task.md\n2026-01-01T00:01:00Z end task.md exit 0\n2026-01-01T00:02:00Z start task.md');
  assert.equal(events.get('task.md').endedAt, undefined);
  const root = await mkdtemp(join(tmpdir(), 'dashboard-queue-')); await mkdir(join(root, 'running')); await writeFile(join(root, 'running/task.md'), '# Test the queue');
  let queue = await readQueue(root, '', []); assert.equal(queue.running[0].status, 'interrupted');
  queue = await readQueue(root, '', [{ unit: 'codex-task-1-task.service', active: 'active' }]); assert.equal(queue.running[0].status, 'working');
});
test('decision media accepts supported hosts and source paths, rejecting arbitrary URLs', () => {
  const pr = decisionFrom({ number: 1, state: 'OPEN', labels: [{ name: 'awaiting-user' }], body: '![x](https://github.com/a/b/blob/pr-media/x.png?raw=true) ![bad](https://evil.example/x.png)', comments: [] }, 'a/b');
  assert.equal(pr.status, 'decision'); assert.equal(pr.media.length, 1); assert.equal(pr.media[0].url, 'https://raw.githubusercontent.com/a/b/pr-media/x.png');
});
test('feedback is pinned and note text cannot switch a revision to approval', () => {
  assert.equal(feedbackCommand('ship', head), `/ship ${head}`);
  assert.throws(() => feedbackCommand('revise', head, ''));
  const script = fileURLToPath(new URL('./owner-command.sh', import.meta.url));
  const parse = input => execFileSync('bash', ['-c', 'source "$1"; owner_command_kind "$2"; owner_command_head "$2"', 'test', script, input], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(parse(feedbackCommand('revise', head, 'Do not /ship until the clip is fixed')), ['revise', head]);
  assert.deepEqual(parse(feedbackCommand('ship', head)), ['ship', head]);
  assert.deepEqual(parse('/ship'), ['ship']); assert.deepEqual(parse('/shipwreck'), ['none']);
});

async function fixture(t, { records = [], beforeView = async () => {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-http-')); let liveHead = head, comments = [], mutations = 0, eligible = true, prState = 'OPEN', loseResponse = false;
  if (records.length) {
    await mkdir(join(root, 'control'));
    await writeFile(join(root, 'control/dashboard-feedback.jsonl'), records.map(record => JSON.stringify(record) + '\n').join(''));
  }
  const run = async (args, input) => {
    if (args[0] === 'systemctl') return '[]';
    if (args[1] === 'api') return JSON.stringify([comments]);
    if (args[1] === 'pr' && args[2] === 'view') {
      await beforeView(Number(args[3]));
      return JSON.stringify({ headRefOid: liveHead, state: prState, labels: eligible ? [{ name: 'awaiting-user' }] : [] });
    }
    if (args[1] === 'pr' && args[2] === 'comment') {
      mutations++; comments.push({ body: input, html_url: 'https://github.com/a/b/pull/1#issuecomment-1' });
      if (loseResponse) { loseResponse = false; throw new Error('Response lost after GitHub committed the comment'); }
      return comments.at(-1).html_url;
    }
    if (args[1] === 'pr' && args[2] === 'list') return '[]';
    throw new Error('Unexpected command');
  };
  let app, base, cookie;
  const launch = async () => {
    app = createDashboard({ token, queue: root, repos: ['a/b'], hosts: ['127.0.0.1'] }, run);
    await app.start(); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
    const login = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    cookie = login.headers.get('set-cookie').split(';')[0];
  };
  await launch(); t.after(() => app.close());
  const send = (input, headers = {}) => fetch(base + '/api/feedback', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: JSON.stringify(input) });
  return { get app() { return app; }, root, get base() { return base; }, get cookie() { return cookie; }, send, run, mutations: () => mutations,
    setHead: value => { liveHead = value; }, setEligible: value => { eligible = value; }, setState: value => { prState = value; },
    loseResponse: () => { loseResponse = true; }, restart: async () => { app.close(); await launch(); }, setComments: value => { comments = value; } };
}
test('HTTP state needs authentication; writes reject foreign origins', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.base + '/api/state')).status, 401);
  assert.equal((await f.send({}, { Origin: 'http://evil.example' })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => { const req = request(f.base + '/api/state', { headers: { Host: 'evil.example', Cookie: f.cookie } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(hostStatus, 403);
  assert.equal(f.mutations(), 0);
});
test('feedback rejects a changed head and submits a stable request once', async t => {
  const f = await fixture(t); const input = { id: 'request-one', repo: 'a/b', number: 1, head, action: 'revise', notes: 'Move the label' };
  f.setHead('b'.repeat(40)); assert.equal((await f.send(input)).status, 409); assert.equal(f.mutations(), 0);
  f.setHead(head); assert.equal((await f.send(input)).status, 200); assert.equal((await f.send(input)).status, 200); assert.equal(f.mutations(), 1);
  assert.equal((await f.send({ ...input, notes: 'Different request' })).status, 409);
  assert.match(await readFile(join(f.root, 'control/dashboard-feedback.jsonl'), 'utf8'), /Move the label/);
});
test('SSE sends state and queue changes without a page reload', async t => {
  const f = await fixture(t); const controller = new AbortController();
  const response = await fetch(f.base + '/api/events', { headers: { Cookie: f.cookie }, signal: controller.signal });
  const reader = response.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /"running":\[\]/);
  await mkdir(join(f.root, 'todo')); await writeFile(join(f.root, 'todo/next.md'), '# New queued task'); await f.app.refreshQueue();
  assert.match(new TextDecoder().decode((await reader.read()).value), /New queued task/); controller.abort();
});

test('uncertain delivery reconciles after eligibility, head or merge state changes and restart', async t => {
  for (const change of [f => f.setEligible(false), f => f.setHead('b'.repeat(40)), f => f.setState('MERGED')]) {
    const f = await fixture(t), input = { id: 'uncertain-request', repo: 'a/b', number: 1, head, action: 'ship', notes: '' };
    f.loseResponse(); assert.equal((await f.send(input)).status, 502); assert.equal(f.mutations(), 1);
    change(f); await f.restart();
    const retry = await f.send(input); assert.equal(retry.status, 200); assert.match((await retry.json()).url, /issuecomment-1/);
    assert.equal(f.mutations(), 1);
    const journal = (await readFile(join(f.root, 'control/dashboard-feedback.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(journal.filter(record => record.url).length, 1); assert.equal(journal.at(-1).action, 'ship');
    assert.equal((await f.send({ ...input, id: 'new-request' })).status, 409); assert.equal(f.mutations(), 1);
  }
});

test('request identity survives restart for delivered and uncertain comments', async t => {
  for (const uncertain of [false, true]) {
    const f = await fixture(t), input = { id: 'durable-request', repo: 'a/b', number: 1, head, action: 'revise', notes: 'Keep the note' };
    if (uncertain) f.loseResponse();
    assert.equal((await f.send(input)).status, uncertain ? 502 : 200); await f.restart();
    for (const changes of [{ action: 'ship' }, { notes: 'Different note' }, { number: 2 }]) assert.equal((await f.send({ ...input, ...changes })).status, 409);
    assert.equal((await f.send(input)).status, 200); assert.equal(f.mutations(), 1);
    const journal = (await readFile(join(f.root, 'control/dashboard-feedback.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(journal.every(record => record.action === 'revise' && record.notes === 'Keep the note'));
  }
});

test('an external marker without a local journal cannot impersonate a different decision', async t => {
  const f = await fixture(t), input = { id: 'external-request', repo: 'a/b', number: 1, head, action: 'ship', notes: '' };
  f.setComments([{ body: `${feedbackCommand('revise', head, 'Fix this')}\n\n<!-- dashboard-feedback:${input.id} -->\n`, html_url: 'https://github.com/a/b/pull/1#issuecomment-1' }]);
  assert.equal((await f.send(input)).status, 409); assert.equal(f.mutations(), 0);
  assert.equal((await f.send({ ...input, action: 'revise', notes: 'Fix this' })).status, 200); assert.equal(f.mutations(), 0);
});

test('startup rejects unreadable, incomplete, malformed and conflicting journals without any external command', async t => {
  const record = { id: 'reserved-request', repo: 'a/b', number: 1, head, action: 'revise', notes: 'Keep this identity' };
  const line = JSON.stringify(record) + '\n';
  for (const [name, content, mode] of [
    ['unreadable', line, 0o200],
    ['partial tail', line + '{"id":"torn', 0o600],
    ['missing newline', JSON.stringify(record), 0o600],
    ['malformed line', line + 'broken\n', 0o600],
    ['invalid record', line + 'null\n', 0o600],
    ['missing identity', line + '{}\n', 0o600],
    ['numeric identity', JSON.stringify({ ...record, id: 12345678 }) + '\n', 0o600],
    ['array identity', JSON.stringify({ ...record, id: ['reserved-request'] }) + '\n', 0o600],
    ['conflicting identity', line + JSON.stringify({ ...record, number: 2, action: 'ship' }) + '\n', 0o600],
  ]) await t.test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-journal-'));
    const file = join(root, 'control/dashboard-feedback.jsonl');
    await mkdir(join(root, 'control')); await writeFile(file, content, { mode });
    let calls = 0;
    const app = createDashboard({ token, queue: root, repos: ['a/b'] }, async () => { calls++; return '[]'; });
    try {
      await assert.rejects(app.start());
      assert.equal(app.server.listening, false); assert.equal(calls, 0);
      await chmod(file, 0o600); assert.equal(await readFile(file, 'utf8'), content);
    } finally { app.close(); await chmod(file, 0o600); await rm(root, { recursive: true, force: true }); }
  });
});

test('a failed append blocks later external writes until a clean restart', async t => {
  const f = await fixture(t), file = join(f.root, 'control/dashboard-feedback.jsonl');
  const input = { id: 'append-failure-request', repo: 'a/b', number: 1, head, action: 'ship', notes: '' };
  await mkdir(join(f.root, 'control'), { recursive: true }); await writeFile(file, '', { mode: 0o400 });
  t.after(() => chmod(file, 0o600));
  assert.equal((await f.send(input)).status, 502); assert.equal(f.mutations(), 0);
  await chmod(file, 0o600);
  assert.equal((await f.send({ ...input, id: 'following-request' })).status, 502); assert.equal(f.mutations(), 0);
  assert.equal(await readFile(file, 'utf8'), '');
  await f.restart(); assert.equal((await f.send(input)).status, 200); assert.equal(f.mutations(), 1);
});

test('non-string API identities are rejected before delivery and cannot alias a string after restart', async t => {
  const f = await fixture(t);
  const input = { id: 'typed-request', repo: 'a/b', number: 1, head, action: 'revise', notes: 'Keep this identity' };
  for (const id of [[input.id], 12345678]) assert.equal((await f.send({ ...input, id })).status, 400);
  assert.equal(f.mutations(), 0);
  await assert.rejects(readFile(join(f.root, 'control/dashboard-feedback.jsonl')), { code: 'ENOENT' });
  await f.restart();
  const valid = { ...input, number: 2, action: 'ship' };
  assert.equal((await f.send(valid)).status, 200);
  await f.restart();
  assert.equal((await f.send(input)).status, 409);
  assert.equal((await f.send(valid)).status, 200);
  assert.equal(f.mutations(), 1);
});

for (const concurrent of [false, true]) test(`append failure blocks a pending retry ${concurrent ? 'already awaiting eligibility' : 'started after the failure'}`, async t => {
  const pending = { id: 'pending-request', repo: 'a/b', number: 1, head, action: 'revise', notes: 'Keep the label' };
  const cached = { ...pending, id: 'cached-request', number: 3, url: 'https://github.com/a/b/pull/3#issuecomment-1' };
  const entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const f = await fixture(t, { records: [pending, cached], beforeView: async number => {
    if (concurrent && number === 1) { entered.resolve(); await gate.promise; }
  } });
  const file = join(f.root, 'control/dashboard-feedback.jsonl'), original = await readFile(file, 'utf8');
  t.after(async () => { gate.resolve(); await chmod(file, 0o600); });
  const retry = concurrent ? f.send(pending) : null;
  if (concurrent) await entered.promise;
  await chmod(file, 0o400);
  assert.equal((await f.send({ ...pending, id: 'fresh-request', number: 2 })).status, 502);
  await chmod(file, 0o600);
  gate.resolve();
  assert.equal((await (retry || f.send(pending))).status, 502);
  assert.equal(f.mutations(), 0);
  assert.equal(await readFile(file, 'utf8'), original);
  assert.equal((await f.send(cached)).status, 200);
  assert.equal((await f.send({ ...cached, action: 'ship' })).status, 409);
  await f.restart();
  assert.equal((await f.send(pending)).status, 200);
  assert.equal(f.mutations(), 1);
});

test('pending retries wait for queued flush failure before any external write', async t => {
  const pending = { id: 'flush-pending', repo: 'a/b', number: 1, head, action: 'revise', notes: 'Keep the label' };
  const viewed = Promise.withResolvers(), entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const f = await fixture(t, { records: [pending], beforeView: async number => { if (number === 1) viewed.resolve(); } });
  const file = join(f.root, 'control/dashboard-feedback.jsonl');
  const handle = await open(file, 'r'), prototype = Object.getPrototypeOf(handle), sync = prototype.sync;
  await handle.close();
  let syncs = 0;
  prototype.sync = async function () {
    syncs++; entered.resolve(); await gate.promise;
    throw Object.assign(new Error('Injected flush failure'), { code: 'EIO' });
  };
  try {
    const fresh = f.send({ ...pending, id: 'flush-fresh', number: 2 });
    await entered.promise;
    const retry = f.send(pending);
    await viewed.promise;
    await new Promise(resolve => setTimeout(resolve, 30));
    const writesBeforeFlush = f.mutations();
    gate.resolve();
    assert.deepEqual((await Promise.all([fresh, retry])).map(response => response.status), [502, 502]);
    assert.equal(writesBeforeFlush, 0);
    assert.equal(f.mutations(), 0); assert.equal(syncs, 1);
    assert.equal((await f.send(pending)).status, 502);
    assert.equal(f.mutations(), 0);
    const records = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(records.map(record => record.id), [pending.id, 'flush-fresh']);
    assert.ok(records.every(record => !record.url));
  } finally { gate.resolve(); prototype.sync = sync; }
});

test('concurrent submissions retain separate request identities across restart', async t => {
  const f = await fixture(t);
  const requests = Array.from({ length: 6 }, (_, n) => ({ id: 'concurrent-request-' + n, repo: 'a/b', number: n + 1, head, action: 'ship', notes: '' }));
  const responses = await Promise.all(requests.map(input => f.send(input)));
  assert.ok(responses.every(r => r.status === 200)); assert.equal(f.mutations(), 6);
  const records = (await readFile(join(f.root, 'control/dashboard-feedback.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  for (const input of requests) assert.equal(records.filter(r => r.id === input.id).length, 2);
  await f.restart();
  for (const input of requests) assert.equal((await f.send({ ...input, action: 'revise', notes: 'Change identity' })).status, 409);
  assert.equal(f.mutations(), 6);
});

test('cold activity lookup crosses large tool results without exposing their contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-long-rollout-')), sessions = join(root, 'sessions'), dir = join(sessions, '2026/01/01');
  await Promise.all(['running', 'logs', 'sessions/2026/01/01'].map(name => mkdir(join(root, name), { recursive: true })));
  await writeFile(join(root, 'running/task.md'), '# Track public progress');
  await writeFile(join(root, 'logs/task.20260101-120000.log'), 'session id: example\n');
  const record = payload => JSON.stringify({ type: 'response_item', payload }) + '\n', rollout = join(dir, 'rollout-example.jsonl');
  const progress = text => record({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text }] });
  await writeFile(rollout, progress('Checking the latest results.') + record({ type: 'custom_tool_call', name: 'exec', arguments: 'private arguments' }) + record({ type: 'function_call_output', output: 'private output'.repeat(90000) }));
  const units = [{ unit: 'codex-task-1-task.service', active: 'active' }];
  let activity = (await readQueue(root, sessions, units)).running[0].activity;
  assert.equal(activity.message, 'Checking the latest results.'); assert.equal(activity.action, 'Running a command'); assert.ok(!JSON.stringify(activity).includes('private'));
  await appendFile(rollout, progress('Results checked.') + record({ type: 'function_call_output', output: 'private output'.repeat(90000) }));
  activity = (await readQueue(root, sessions, units)).running[0].activity;
  assert.equal(activity.message, 'Results checked.'); assert.equal(activity.action, 'Running a command');
  assert.ok(!JSON.stringify(activity).includes('private'));
});
