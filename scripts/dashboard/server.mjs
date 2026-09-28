#!/usr/bin/env node
// The owner dashboard: a read-only page of what the team and CI are doing, on the private network.
//   node scripts/dashboard/server.mjs --host <private address> [--port 8790]
// It binds one private address (loopback, RFC 1918 or 100.64/10), never a wildcard, and answers
// only GET requests from such addresses: / (the page) and /state.json (scripts/dashboard/collect.mjs,
// refreshed every 30 s, the slow parts every 5 minutes). Nothing it serves calls a model or changes
// anything. The systemd unit (scripts/systemd/hitl-dashboard.service) runs it; install.sh picks the
// address.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindAllowed, isPrivateAddress } from './lib.mjs';
import { collect } from './collect.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const host = String(opt('host', process.env.HITL_DASH_HOST) ?? '').trim();
const port = Number(opt('port', process.env.HITL_DASH_PORT ?? 8790));
if (!bindAllowed(host)) {
  console.error(`dashboard: refusing to bind "${host ?? ''}": give one private address (loopback, 10/8, 172.16/12, 192.168/16 or 100.64/10), never a wildcard`);
  process.exit(2);
}

// Browsers must address it by its own address: a request naming any other host (a rebound DNS name
// pointing here) gets 421, so no outside page can read it as same-origin.
const hostName = host.includes(':') ? `[${host}]` : host;
const allowedHosts = new Set([`${hostName}:${port}`, ...(port === 80 ? [hostName] : [])]);
const page = readFileSync(join(import.meta.dirname, 'page.html'));
let state = JSON.stringify({ at: 0, loading: true });
let busy = false, n = 0;
async function refresh() {
  if (busy) return;
  busy = true;
  try { state = JSON.stringify(await collect({ slow: n++ % 10 === 0 })); } catch (e) { console.error(`dashboard: collect failed: ${e.message}`); }
  busy = false;
}
refresh();
setInterval(refresh, Number(process.env.HITL_DASH_EVERY ?? 30) * 1000).unref();

const HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
};
const server = createServer((req, res) => {
  if (!isPrivateAddress(req.socket.remoteAddress)) { res.writeHead(403, HEADERS).end('forbidden\n'); return; }
  if (!allowedHosts.has(String(req.headers.host ?? '').toLowerCase())) { res.writeHead(421, HEADERS).end('misdirected: use the address the dashboard listens on\n'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...HEADERS, allow: 'GET, HEAD' }).end('read-only\n'); return; }
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/') res.writeHead(200, { ...HEADERS, 'content-type': 'text/html; charset=utf-8' }).end(page);
  else if (path === '/state.json') res.writeHead(200, { ...HEADERS, 'content-type': 'application/json' }).end(state);
  else res.writeHead(404, HEADERS).end('not found\n');
});
server.listen(port, host, () => console.log(`dashboard: http://${hostName}:${port}/`));
