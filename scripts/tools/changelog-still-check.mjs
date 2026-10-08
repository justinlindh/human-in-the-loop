// Looks at each still the rules picked for a day's changelog items, next to the item's text, and keeps
// only those that show what the item says, with a caption written from what is visible. One cheap
// headless model run (claude -p, sonnet by default, read-only tools, a dollar cap) sees every candidate of
// the day; it turns down a view other than the one the item describes (an overhead frame for first
// person), contact sheets, grids, strips, rows of frames and side-by-side comparisons.
//
//   node scripts/tools/changelog-still-check.mjs <site-checkout> <day> [--keep <keep.json>] [--budget <usd>]
//        [--cap <n>] [--model <name>] [--raw <file>] [--trim-only]
// --raw keeps the model's whole reply (with what it says each still shows) in a file.
//
// Items the keep file lists are never looked at or changed. Each other item keeps at most --cap (default
// 3) of its passing stills, in the rules' order; files nothing shows any more leave the day's media
// folder. When the run can't be had (no budget left, --trim-only, the model fails or replies with
// something unusable) the rules' first --cap stills stand and the reason is printed. stdout, one line
// each: `kept: <title>: <src> (<caption>)`, `turned down: <title>: <src>: <reason>`, `wanted: <area>:
// <title> (<refs>)` for an item left with no still, `check: ...` for what the run cost or why it did not
// run. Exit 0; 2 on bad usage; 1 on a read or write failure.
// Env: CL_CLAUDE (the claude command; a stand-in for tests).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CAP } from './changelog-media.mjs';

const EM_DASH = String.fromCharCode(8212);
// Below this there is not enough budget left for a run worth having.
export const MIN_BUDGET = 0.05;

export function prompt(items, root) {
  const out = [
    'You check the stills picked for items of a game\'s public changelog. Each item below says what changed, and lists candidate stills by file path. Open every still with the Read tool and look at it.',
    '',
    'For each still, first write in "shows" what is actually in the picture, starting with the camera: "eye level" (looking across the room from a person\'s height, walls and ceiling ahead) or "overhead" (the isometric view from above, the office floor seen from high up, roofs or desks from above), or "interface" for a screen of panels and buttons. Then decide.',
    '',
    'A still passes only if a player would see in it, plainly, what its item says. Turn a still down when:',
    '- it shows a different view or thing than the item describes: an item about first person, walking or seeing as someone needs an eye-level still, so an overhead one fails it; a settings screen fails an item about an office object;',
    '- it is a contact sheet, a grid, a strip or row of frames, or a side-by-side before/after or main/branch comparison (several small panels, often with file names or timestamps printed on them);',
    '- it is a test or debug capture: bare geometry, a lone object on an empty background with labels, mostly blank;',
    '- the thing the item describes is too small to make out: imagine the still shown at a quarter of its size, as the changelog page shows it; if the menu, button, form or object the item is about would be a few pixels across there (a full phone or tablet screenshot where the change is one small panel), turn it down as too small. A crop of that thing passes;',
    '- it shows nearly the same as a still of the same item you already passed (the same screen cropped a little differently).',
    '',
    'For each still that passes, write a caption of at most 12 words saying what is visible, the way a player would say it. No em dashes, never the word "startup" (say company or lab).',
    '',
  ];
  items.forEach((it, i) => {
    out.push(`Item ${i + 1}: ${it.area}: ${it.title}`, it.body, 'Stills:');
    it.media.forEach((m, j) => out.push(`  ${j + 1}. ${join(root, m.src)}`));
    out.push('');
  });
  out.push('Reply with exactly one JSON object and nothing else: { "items": [ { "item": <number>, "stills": [ { "still": <number>, "shows": <camera, then what is in it>, "pass": true|false, "reason": <a few words>, "caption": <when it passes> } ] } ] }, with every still of every item.');
  return out.join('\n');
}

// The JSON object in a model reply (claude -p --output-format json wraps it in { result, total_cost_usd }).
export function parseReply(raw) {
  let text = String(raw ?? ''), cost = 0;
  try { const j = JSON.parse(text); if (typeof j?.result === 'string') { text = j.result; cost = Number(j.total_cost_usd) || 0; } } catch { /* plain text */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) return { verdict: null, cost };
  try { const v = JSON.parse(text.slice(a, b + 1)); return { verdict: Array.isArray(v?.items) ? v : null, cost }; } catch { return { verdict: null, cost }; }
}

const cleanCaption = (c) => {
  const t = String(c ?? '').replace(new RegExp(EM_DASH, 'g'), ',').replace(/\s+/g, ' ').trim();
  return t && !/startup/i.test(t) ? t.slice(0, 140) : '';
};

// Applies a verdict to the items: each keeps its passing stills (up to cap) with the model's caption, or
// its first `cap` stills when the verdict says nothing about it. Returns per-item lines.
export function judge(items, verdict, cap = CAP) {
  const lines = [];
  items.forEach((it, i) => {
    const v = verdict?.items?.find((x) => Number(x.item) === i + 1);
    if (!v || !Array.isArray(v.stills)) {
      it.media = it.media.slice(0, cap);
      for (const m of it.media) lines.push(`kept: ${it.title}: ${m.src} (${m.caption ?? ''}) [not checked]`);
      return;
    }
    const keep = [];
    it.media.forEach((m, j) => {
      const s = v.stills.find((x) => Number(x.still) === j + 1);
      if (s?.pass === true && keep.length < cap) {
        const caption = cleanCaption(s.caption) || m.caption;
        keep.push({ ...m, ...(caption ? { caption } : {}) });
        lines.push(`kept: ${it.title}: ${m.src} (${caption ?? ''})`);
      } else if (s?.pass === true) lines.push(`turned down: ${it.title}: ${m.src}: passes, but the item already has ${cap}`);
      else lines.push(`turned down: ${it.title}: ${m.src}: ${s ? String(s.reason ?? 'does not show the item').replace(/\s+/g, ' ').trim() : 'not judged'}`);
    });
    it.media = keep;
  });
  return lines;
}

function runModel(text, { budget, model, dir, raw }) {
  const claude = (process.env.CL_CLAUDE || 'claude').split(' ');
  // The run starts in the stills folder, so its reach is the stills and nothing else.
  const r = spawnSync('nice', ['-n', '10', 'timeout', '600', ...claude, '-p', text, '--model', model, '--tools', 'Read', '--permission-mode', 'dontAsk', '--strict-mcp-config',
    '--add-dir', dir, '--no-session-persistence', '--max-budget-usd', String(budget), '--output-format', 'json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
  if (raw) { try { writeFileSync(raw, r.stdout ?? ''); } catch { /* the reply is still used */ } }
  if (r.status !== 0) return { error: `the run failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').pop()?.slice(0, 200)}` };
  return parseReply(r.stdout);
}

function main(argv) {
  let a;
  try { a = parseArgs({ args: argv, allowPositionals: true, options: { keep: { type: 'string' }, budget: { type: 'string' }, cap: { type: 'string' }, model: { type: 'string' }, raw: { type: 'string' }, 'trim-only': { type: 'boolean' } } }); }
  catch (e) { console.error(`changelog-still-check: ${e.message}`); return 2; }
  const { values: v, positionals: [site, day, extra] } = a;
  const cap = v.cap === undefined ? CAP : Number(v.cap), budget = v.budget === undefined ? 1 : Number(v.budget);
  if (!site || !/^\d{4}-\d\d-\d\d$/.test(day || '') || extra || !(Number.isInteger(cap) && cap >= 1) || !(budget >= 0)) {
    console.error('usage: changelog-still-check.mjs <site-checkout> <YYYY-MM-DD> [--keep <keep.json>] [--budget <usd>] [--cap <n>] [--model <name>] [--trim-only]');
    return 2;
  }
  const root = join(site, 'changelog'), file = join(root, 'entries.json');
  let entries, keep;
  try {
    entries = JSON.parse(readFileSync(file, 'utf8'));
    keep = v.keep ? JSON.parse(readFileSync(v.keep, 'utf8')) : { items: [] };
  } catch (e) { console.error(`changelog-still-check: ${e.message}`); return 1; }
  const entry = entries.find((e) => e.date === day);
  if (!entry) { console.error(`changelog-still-check: no ${day} entry in ${site}`); return 1; }
  const kept = new Set((keep.items ?? []).map((i) => i.title));
  const items = entry.items.filter((i) => !kept.has(i.title) && (i.media ?? []).length);

  let verdict = null;
  if (!items.length) console.log('check: no stills to look at');
  else if (v['trim-only']) console.log('check: not run (--trim-only); the rules\' picks stand');
  else if (budget < MIN_BUDGET) console.log(`check: not run, $${budget.toFixed(2)} of the budget left; the rules' picks stand`);
  else {
    const r = runModel(prompt(items, root), { budget, model: v.model || 'sonnet', dir: join(root, 'media', day), raw: v.raw });
    if (r.error) console.log(`check: not run, ${r.error}; the rules' picks stand`);
    else if (!r.verdict) console.log(`check: the reply was not a verdict ($${r.cost.toFixed(2)}); the rules' picks stand`);
    else { verdict = r.verdict; console.log(`check: looked at ${items.reduce((n, i) => n + i.media.length, 0)} still(s) for ${items.length} item(s), $${r.cost.toFixed(2)}`); }
  }
  for (const l of judge(items, verdict, cap)) console.log(l);
  for (const it of items) {
    // Its PRs posted stills, so it shows something on screen whatever its area (a fixes item too).
    if (!it.media.length) { delete it.media; console.log(`wanted: ${it.area}: ${it.title} (${(it.refs ?? []).join(' ') || 'no PRs'})`); }
  }
  // Every item is an object inside `entries`, so the cut stills are already gone from it.
  const dir = join(root, 'media', day);
  const shown = new Set(entry.items.flatMap((i) => (i.media ?? []).map((m) => m.src)));
  try {
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) if (!shown.has(`media/${day}/${f}`)) rmSync(join(dir, f), { recursive: true, force: true });
      if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
    }
    writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
  } catch (e) { console.error(`changelog-still-check: ${e.message}`); return 1; }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
