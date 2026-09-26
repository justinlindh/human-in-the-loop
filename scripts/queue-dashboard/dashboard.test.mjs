import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
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

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-http-')); let liveHead = head, comments = [], mutations = 0;
  const run = async (args, input) => {
    if (args[0] === 'systemctl') return '[]';
    if (args[1] === 'api') return JSON.stringify([comments]);
    if (args[1] === 'pr' && args[2] === 'view') return JSON.stringify({ headRefOid: liveHead, state: 'OPEN', labels: [{ name: 'awaiting-user' }] });
    if (args[1] === 'pr' && args[2] === 'comment') { mutations++; comments.push({ body: input, html_url: 'https://github.com/a/b/pull/1#issuecomment-1' }); return comments.at(-1).html_url; }
    if (args[1] === 'pr' && args[2] === 'list') return '[]';
    throw new Error('Unexpected command');
  };
  const app = createDashboard({ token, queue: root, repos: ['a/b'], hosts: ['127.0.0.1'] }, run);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const send = (input, headers = {}) => fetch(base + '/api/feedback', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: JSON.stringify(input) });
  return { app, root, base, cookie, send, run, mutations: () => mutations, setHead: value => { liveHead = value; } };
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
