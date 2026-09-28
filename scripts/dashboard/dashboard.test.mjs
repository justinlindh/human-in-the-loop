// Cases for the owner dashboard: where it may bind, whom it answers, what it hides, and that the
// server refuses a wildcard and answers only reads. Run: node --test scripts/dashboard/dashboard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { bindAllowed, isPrivateAddress, scrub, lastActivity } from './lib.mjs';

const SERVER = join(import.meta.dirname, 'server.mjs');

test('binds only one specific private address', () => {
  for (const ok of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.199', '100.64.0.7', '100.127.1.1', '::1', 'fd12:3456::1'])
    assert.equal(bindAllowed(ok), true, ok);
  for (const no of ['0.0.0.0', '::', '[::]', '*', '', undefined, 'localhost', '8.8.8.8', '172.32.0.1', '172.15.0.1', '100.128.0.1', '192.169.0.1', 'example.com', '2001:db8::1'])
    assert.equal(bindAllowed(no), false, String(no));
});

test('answers only loopback and private sources', () => {
  for (const ok of ['127.0.0.1', '::1', '::ffff:192.168.1.20', '10.0.0.5', '172.20.3.4', '100.100.1.1', 'fc00::5'])
    assert.equal(isPrivateAddress(ok), true, ok);
  for (const no of ['8.8.8.8', '::ffff:8.8.8.8', '1.1.1.1', '172.32.1.1', '100.63.255.255', '2606:4700::1', 'garbage', undefined])
    assert.equal(isPrivateAddress(no), false, String(no));
});

test('scrubs secrets and keeps descriptions to one short line', () => {
  const cases = [
    ['Push with ghp_abcdefghijklmnopqrstuvwxyz123456', 'ghp_'],
    ['use tk_live_9f8e7d6c5b4a to call', 'tk_live'],
    ['curl -H "Authorization: Bearer abcdef1234567890xyz"', 'abcdef1234567890xyz'],
    ['set API_KEY=sk-ant-api03-verysecretvalue', 'verysecret'],
    ['password: hunter2hunter2', 'hunter2'],
    ['token=abc123def456', 'abc123def456'],
    ['aws AKIAABCDEFGHIJKLMNOP key', 'AKIAABCDEFGHIJKLMNOP'],
    ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc', 'eyJhbGci'],
    ['blob Zm9vYmFyYmF6cXV4cXV1eHh5enp6enp6enp6enp6enp6 here', 'Zm9vYmFy'],
  ];
  for (const [text, secret] of cases) {
    const out = scrub(text);
    assert.ok(!out.includes(secret), `${text} -> ${out}`);
    assert.ok(out.includes('[hidden]'), `${text} -> ${out}`);
  }
  assert.equal(scrub('Check #841 and #886 now main is green'), 'Check #841 and #886 now main is green');
  const long = scrub('x '.repeat(100));
  assert.ok(long.length <= 80 && long.endsWith('…'), long);
  assert.equal(scrub('two\nlines'), 'two lines');
});

test('takes each agent\'s newest tool call from the log tails, scrubbed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dash-'));
  const line = (who, at, name, description) => JSON.stringify({ type: 'assistant', agentName: who, timestamp: at,
    message: { content: [{ type: 'tool_use', name, input: { description, command: 'secret stays out' } }] } });
  writeFileSync(join(dir, 'a.jsonl'), [line('art', '2026-01-01T00:00:00Z', 'Bash', 'older'), line('art', '2026-01-01T00:05:00Z', 'Bash', 'push ghp_abcdefghijklmnopqrstuvwxyz0123')].join('\n'));
  mkdirSync(join(dir, 's', 'subagents'), { recursive: true });
  writeFileSync(join(dir, 's', 'subagents', 'x.jsonl'), JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:03:00Z', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } }));
  const files = [{ path: join(dir, 'a.jsonl'), mtime: Date.now(), parent: null }, { path: join(dir, 's', 'subagents', 'x.jsonl'), mtime: Date.now(), parent: join(dir, 's.jsonl') }];
  const rows = lastActivity(files, () => 'sim');
  const art = rows.find((r) => r.who === 'art');
  assert.equal(art.tool, 'Bash');
  assert.ok(art.what.startsWith('push [hidden]'), art.what);
  assert.ok(!JSON.stringify(rows).includes('secret stays out'));
  assert.ok(rows.some((r) => r.who === 'sim (subagent)' && r.tool === 'Read'));
});

test('the server refuses a wildcard or public bind', () => {
  for (const host of ['0.0.0.0', '::', '8.8.8.8', ' 0.0.0.0 ']) {
    const r = spawnSync(process.execPath, [SERVER, '--host', host, '--port', '0'], { encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 2, `${host}: ${r.stderr}`);
    assert.match(r.stderr, /refusing to bind/);
  }
});

test('the server answers GETs on loopback and refuses writes', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [SERVER, '--host', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HITL_DASH_EVERY: '3600' } });
  try {
    await new Promise((res, rej) => { child.stdout.on('data', (d) => /dashboard: http/.test(d) && res()); child.on('exit', (c) => rej(new Error(`exited ${c}`))); setTimeout(() => rej(new Error('no start')), 20000); });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/state.json`)).headers.get('content-type'), 'application/json');
    assert.equal((await fetch(`${base}/state.json`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    // A request naming another host (DNS rebinding) is refused; the dashboard's own address works.
    const withHost = (h) => new Promise((res, rej) => {
      const r = request({ host: '127.0.0.1', port, path: '/state.json', headers: { host: h } }, (resp) => { resp.resume(); res(resp.statusCode); });
      r.on('error', rej); r.end();
    });
    assert.equal(await withHost('attacker.example'), 421);
    assert.equal(await withHost(`attacker.example:${port}`), 421);
    assert.equal(await withHost('127.0.0.1'), 421);
    assert.equal(await withHost(`127.0.0.1:${port}`), 200);
  } finally { child.kill(); }
});
