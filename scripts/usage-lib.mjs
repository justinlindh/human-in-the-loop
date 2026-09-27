// Token use per teammate from Claude Code session logs (scripts/usage.mjs).
//
// A session log is one JSON object per line. Assistant lines carry message.usage; a reply streamed
// as several content blocks is written as several lines with the same message.id and the same
// usage, so each message counts once. The teammate is the line's agentName (the team member the
// session ran as), else "lead" for the main session. A subagent's log (<session>/subagents/*.jsonl)
// has no agentName; it counts as "<the parent session's teammate> (subagents)". Logs run to
// gigabytes, so they are read a line at a time.
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, dirname, join } from 'node:path';

// Every .jsonl under the project folders `wanted` accepts (a folder name -> boolean), subagent logs
// included. Each subagent log carries `parent`, its session's own log.
export function logFiles(root, wanted) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.jsonl')) {
        const sub = basename(dir) === 'subagents' ? `${dirname(dir)}.jsonl` : null;
        out.push({ path: p, mtime: st.mtimeMs, parent: sub });
      }
    }
  };
  for (const d of readdirSync(root)) if (wanted(d)) walk(join(root, d));
  return out;
}

// The teammate a session log belongs to: the first agentName in it, else "lead".
export async function sessionName(path) {
  try {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"agentName"')) continue;
      const name = /"agentName":"([^"]+)"/.exec(line)?.[1];
      if (name) { rl.close(); return name; }
    }
  } catch { /* no parent log */ }
  return 'lead';
}

// A running tally: add(line) for each log line, rows() for the totals per teammate, largest output
// first: messages, output, fresh input (tokens read uncached, cache writes included), cache reads.
export function createTally(since) {
  const seen = new Set();
  const by = new Map();
  return {
    // `fallback` names a line without an agentName (default "lead").
    add(line, fallback = 'lead') {
      if (!line.includes('"usage"')) return;
      let o;
      try { o = JSON.parse(line); } catch { return; }
      const u = o?.message?.usage;
      if (o?.type !== 'assistant' || !u || !o.timestamp || new Date(o.timestamp) < since) return;
      const id = o.message.id ?? o.requestId ?? o.uuid;
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      const who = o.agentName || fallback;
      const t = by.get(who) ?? { who, messages: 0, output: 0, freshInput: 0, cacheRead: 0 };
      t.messages++;
      t.output += u.output_tokens ?? 0;
      t.freshInput += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      t.cacheRead += u.cache_read_input_tokens ?? 0;
      by.set(who, t);
    },
    rows: () => [...by.values()].sort((a, b) => b.output - a.output),
  };
}

// Reads every log touched since `since` and tallies it.
export async function usageSince(root, wanted, since) {
  const t = createTally(since);
  const names = new Map();
  for (const f of logFiles(root, wanted)) {
    if (f.mtime < since.getTime()) continue;
    let fallback = 'lead';
    if (f.parent) {
      if (!names.has(f.parent)) names.set(f.parent, await sessionName(f.parent));
      fallback = `${names.get(f.parent)} (subagents)`;
    }
    for await (const line of createInterface({ input: createReadStream(f.path), crlfDelay: Infinity })) t.add(line, fallback);
  }
  return t.rows();
}
