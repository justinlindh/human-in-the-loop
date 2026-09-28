// Pure helpers for the owner dashboard (scripts/dashboard/server.mjs): which addresses it may bind
// and answer, how an agent's latest tool description is made safe to show, and what each agent did
// last, from the tails of Claude Code's session logs.
import { closeSync, openSync, readSync, statSync } from 'node:fs';

// IPv4 as four numbers, or null. An IPv4-mapped IPv6 address (::ffff:a.b.c.d) counts as IPv4.
const v4 = (ip) => {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(String(ip ?? ''));
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return n.every((x) => x <= 255) ? n : null;
};

// Loopback, RFC 1918, and the carrier-grade range Tailscale uses (100.64.0.0/10); IPv6 loopback and
// unique-local (fc00::/7).
export function isPrivateAddress(ip) {
  const n = v4(ip);
  if (n) {
    const [a, b] = n;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const s = String(ip ?? '').toLowerCase();
  return s === '::1' || /^f[cd][0-9a-f]{2}:/.test(s);
}

// The dashboard binds one specific private address, never a wildcard (0.0.0.0, ::) or a public one.
export function bindAllowed(host) {
  const s = String(host ?? '').trim();
  if (!s || s === '0.0.0.0' || s === '::' || s === '[::]' || s === '*' || s === 'localhost') return false;
  return isPrivateAddress(s);
}

// What an agent says it is doing, safe to show: secrets and tokens replaced, one line, at most `max`
// characters.
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{10,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{10,}/g,
  /\btk_[A-Za-z0-9_-]{4,}/g,
  /\b(?:sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{10,}/g, // API keys
  /\bAKIA[0-9A-Z]{12,}/g, // AWS access keys
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, // JWTs
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[_-]?key|key|token|secret|password|passwd|pwd|auth|credential)s?\s*[=:]\s*\S+/gi,
  /\b[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9])/g, // any long opaque string
];
export function scrub(text, max = 80) {
  let s = String(text ?? '').replace(/\s+/g, ' ').trim();
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[hidden]');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// A model id as people say it: claude-opus-5-5 -> "Opus 5.5", claude-sonnet-5 -> "Sonnet 5". Anything
// else (a dated or unfamiliar id) is shown as it is, and a missing one as "".
export function modelName(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/.exec(String(id ?? ''));
  if (!m) return String(id ?? '');
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}

// The last `bytes` of a file as lines (the first, likely partial, line dropped).
function tailLines(path, bytes) {
  const size = statSync(path).size;
  const start = Math.max(0, size - bytes);
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    return start > 0 ? lines.slice(1) : lines;
  } finally { closeSync(fd); }
}

// When a session log started: the first timestamp in its head, or 0.
function sessionStart(path, bytes = 65536) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(Math.min(bytes, statSync(path).size));
    readSync(fd, buf, 0, buf.length, 0);
    const m = /"timestamp":"([^"]+)"/.exec(buf.toString('utf8'));
    return m ? Date.parse(m[1]) || 0 : 0;
  } finally { closeSync(fd); }
}

// Per agent, the newest tool call in its session logs: { who, at, tool, what, model } (what = the call's
// own one-line description, scrubbed). model is the model of the agent's newest session (the log that
// started last), from its newest reply, so a teammate restarted on another model shows the new one
// before it makes a tool call. `files` are { path, mtime, parent } (scripts/usage-lib.mjs logFiles);
// `nameOf(parent)` names a subagent log's session. Only the tail and head of each log are read.
export function lastActivity(files, nameOf, { since = 0, bytes = 262144 } = {}) {
  const best = new Map();
  const newest = new Map();
  for (const f of files) {
    if (f.mtime < since) continue;
    let lines;
    try { lines = tailLines(f.path, bytes); } catch { continue; }
    let call = false, model = null;
    for (let i = lines.length - 1; i >= 0 && !(call && model); i--) {
      const l = lines[i];
      if (!l.includes('"assistant"')) continue;
      let o;
      try { o = JSON.parse(l); } catch { continue; }
      if (o?.type !== 'assistant' || !o.timestamp) continue;
      const who = o.agentName || (f.parent ? `${nameOf(f.parent)} (subagent)` : 'lead');
      const id = o.message?.model;
      if (!model && id && id !== '<synthetic>') {
        model = { who, id };
        let started = 0;
        try { started = sessionStart(f.path); } catch { /* keep 0 */ }
        if (!(newest.get(who)?.started > started)) newest.set(who, { started, id });
      }
      const uses = Array.isArray(o.message?.content) ? o.message.content.filter((c) => c?.type === 'tool_use') : [];
      if (call || !uses.length) continue;
      call = true;
      const u = uses[uses.length - 1];
      const at = Date.parse(o.timestamp);
      if (!(best.get(who)?.at >= at)) best.set(who, { who, at, tool: String(u.name ?? '?'), what: scrub(u.input?.description ?? u.input?.summary ?? ''), model: modelName(id) });
    }
  }
  for (const [who, row] of best) if (newest.has(who)) row.model = modelName(newest.get(who).id);
  return [...best.values()].sort((a, b) => b.at - a.at);
}
