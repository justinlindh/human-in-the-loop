// Browser implementation of pace.js. Metadata is attached only in this Vite session;
// records come from visible DOM surfaces, never from event delivery counts.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { glMode, holdRenderLock, launchChromium } from './lib/gl.js';
import { parseSize } from './tools/drive.mjs';
import { BOTS } from '../src/sim/bots.js';

export const KINDS = ['decision', 'toast', 'yak', 'yak-prompt', 'advisor-prompt', 'office-prompt', 'panel', 'card', 'tutorial'];

// Fail on a moved hook instead of silently measuring an uninstrumented surface.
export function presentationMetadata() {
  const rules = {
    '/src/ui/dom.js': [
      ["const el = document.createElement(name || 'div');", "const el = document.createElement(name || 'div'); el.__paceOrigin = window.__pace?.origin ?? 'game';"],
      ['el.addEventListener(k.slice(2).toLowerCase(), v);', "el.addEventListener(k.slice(2).toLowerCase(), function (...args) { return window.__pace ? window.__pace.player(() => v.apply(this, args)) : v.apply(this, args); });"],
    ],
    '/src/ui/toasts.js': [
      ["function push(text, tone = 'info', opts = {}) {", "function push(text, tone = 'info', opts = {}) { opts = { ...opts, paceOrigin: opts.paceOrigin ?? window.__pace?.origin ?? 'game' };"],
      ['{ action, glyph, person, player, timed } = {}', "{ action, glyph, person, player, timed, paceOrigin = window.__pace?.origin ?? 'game' } = {}"],
      ['node: null, action, glyph, person, at,', 'node: null, action, glyph, person, paceOrigin, at,'],
      ["dataset: { occludes: '' }, onclick: (e)", "dataset: { occludes: '', paceId: String(t.id), paceOrigin: t.paceOrigin }, onclick: (e)"],
      ['{ action, glyph, person }); return;', '{ action, glyph, person, paceOrigin }); return;'],
      ['opts: { action, glyph, person }, at', 'opts: { action, glyph, person, paceOrigin }, at'],
      ['person: t.person }, at: t.at', 'person: t.person, paceOrigin: t.paceOrigin }, at: t.at'],
    ],
    '/src/ui/chat.js': [
      ["root: m.replyTo ?? m.id ?? ''", "root: m.replyTo ?? m.id ?? '', paceOrigin: window.__pace?.chatOrigins.get(m.id) ?? 'game'"],
      ["el.classList.toggle('max', on);", "el.__paceOrigin = window.__pace?.origin ?? 'game'; el.classList.toggle('max', on);"],
    ],
    '/src/ui/incident.js': [
      ["shown = on;", "shown = on; el.__paceOrigin = window.__pace?.origin ?? 'game';"],
    ],
    '/src/ui/hud.js': [
      ["h('div.needrow', null,", "h('div.needrow', { dataset: { paceId: n.key ?? '' } },"],
    ],
    '/src/ui/advisor.js': [
      ['function showPeek(e) {', "function showPeek(e) { peek.dataset.paceId = e.key; peek.__paceOrigin = 'game';"],
      ['h(`div.advitem.sev-${sev(item.severity)}`, null,', 'h(`div.advitem.sev-${sev(item.severity)}`, { dataset: { paceId: item.key } },'],
    ],
    '/src/main.js': [
      ['const route = (events, state, direct = false)', "const route = (events, state, direct = window.__pace?.origin === 'player')"],
      ['route(res.events, sim.state, true);', "window.__pace?.tag(res.events, 'player'); route(res.events, sim.state, true);"],
      ['ui?.handleEvents(events, state);', "if (window.__pace) window.__pace.present(events, state, ui); else ui?.handleEvents(events, state);"],
    ],
  };
  return { name: 'pace-presentation-metadata', enforce: 'pre', transform(code, id) {
    const entries = Object.entries(rules).find(([suffix]) => id.split('?')[0].endsWith(suffix))?.[1];
    if (!entries) return;
    for (const [from, to] of entries) {
      if (!code.includes(from)) throw new Error(`pace: metadata hook missing in ${id}. Expected source line: ${from}. Update scripts/pace-browser.js to match the UI source.`);
      code = code.replace(from, to);
    }
    return { code, map: null };
  } };
}

// Runs in the page before the game boots. Context follows an exact action/event,
// so a delayed game warning near a click cannot become a player confirmation.
export function installObservation() {
  const P = window.__pace = {
    origin: 'game', chatOrigins: new Map(), records: [], active: new Map(), serial: 0, start: null,
    player(fn) {
      const before = P.origin; P.origin = 'player';
      try { return fn(); } finally { P.origin = before; }
    },
    tag(events, origin) {
      for (const e of events ?? []) {
        e.__paceOrigin = origin;
        if (e.type === 'chat') P.chatOrigins.set(e.id, origin);
      }
    },
    present(events, state, ui) {
      // Preserve batching for grouping (era/unlocks and growth).
      const before = P.origin;
      P.origin = events.every(e => e.__paceOrigin === 'player') ? 'player' : 'game';
      try { ui?.handleEvents(events, state); } finally { P.origin = before; }
    },
  };
}

// Kept serializable so the same reader is exercised against browser fixtures.
export function readPresentations() {
  const P = window.__pace, s = window.__HITL.state;
  const visible = el => {
    if (!el?.isConnected || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    let r = el.getBoundingClientRect();
    let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
    let top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const css = getComputedStyle(p), box = p.getBoundingClientRect();
      if (css.opacity === '0' || css.visibility === 'hidden') return false;
      if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    return right - left > 2 && bottom - top > 2;
  };
  const rows = [];
  const add = (el, kind, id, extra = {}) => {
    if (!visible(el)) return;
    const actions = [...el.querySelectorAll('button:not(:disabled):not(.unavail)')].filter(visible).map(x => x.textContent.trim());
    rows.push({ kind, id: String(id), text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 500),
      actionable: actions.length > 0 || el.matches('button,.clickable'), actions,
      origin: el.dataset.paceOrigin ?? el.__paceOrigin ?? 'game', ...extra });
  };
  for (const el of document.querySelectorAll('.modal,.announce,.panel,.coach,.inccard,.callgrid,.go-card,.chat.max')) {
    const title = el.matches('.inccard') ? `incident:${s.outage?.productId}:${s.outage?.kind}`
      : el.matches('.chat.max') ? 'Yak'
      : el.querySelector('h1,h2')?.textContent ?? el.querySelector('b')?.textContent ?? el.textContent.slice(0, 80);
    const decision = el.matches('.decision');
    const kind = decision ? 'decision' : el.matches('.coach') ? 'tutorial' : el.matches('.announce,.launch,.go-card') ? 'card' : 'panel';
    add(el, kind, decision ? s.pendingDecision?.id ?? s.pendingDecision?.eventId ?? title : title,
      decision ? { eventId: s.pendingDecision?.eventId } : {});
  }
  for (const el of document.querySelectorAll('.toast:not(.out),.dtoast')) {
    if (!el.dataset.paceId) throw new Error('pace: toast metadata is missing');
    add(el, 'toast', el.dataset.paceId);
  }
  for (const el of document.querySelectorAll('.msg[data-id]')) {
    const prompt = el.querySelector('.yprompt:not(.done)');
    const canReply = !!prompt && [...prompt.querySelectorAll('button:not(:disabled)')].some(visible);
    // Reaction totals are decorative spans. Only an enabled control is an opportunity.
    const canReact = [...el.querySelectorAll('button.react:not(:disabled),[data-reaction]:not(:disabled)')].some(visible);
    add(el, 'yak', el.dataset.id, { rootId: el.dataset.root, replyTo: el.classList.contains('reply') ? el.dataset.root : null,
      actionable: canReply || canReact, opportunity: canReply ? 'reply' : canReact ? 'reaction' : null });
  }
  for (const el of document.querySelectorAll('.yprompt:not(.done)')) add(el, 'yak-prompt', el.dataset.prompt, { chatId: el.closest('.msg')?.dataset.id });
  for (const el of document.querySelectorAll('.advpeek.show,.advitem')) add(el, 'advisor-prompt', el.dataset.paceId);
  for (const el of document.querySelectorAll('.needrow[data-pace-id^="office-move-"]')) add(el, 'office-prompt', el.dataset.paceId);
  return rows;
}

export function collectPresentations() {
  const P = window.__pace, s = window.__HITL.state, t = (performance.now() - P.start) / 1000;
  const context = { t, week: s.week, era: s.era.id, officeStage: s.officeStage };
  const next = new Map(), fresh = [];
  for (const row of P.read()) {
    const key = `${row.kind}:${row.id}`;
    const prev = P.active.get(key);
    const record = prev ?? { ...context, ...row, sequence: ++P.serial, transition: 'shown' };
    next.set(key, { ...record, actionable: row.actionable, actions: row.actions, opportunity: row.opportunity });
    if (!prev) fresh.push(record);
    else if (prev.actionable !== row.actionable) fresh.push({ ...record, ...row, ...context, transition: 'updated' });
  }
  for (const [key, r] of P.active) if (!next.has(key)) {
    const prompt = r.kind === 'yak-prompt' ? s.chatPrompts?.find(p => p.id === r.id) : null;
    fresh.push({ ...r, ...context, transition: 'hidden', ...(prompt?.resolved ? { resolution: prompt.resolved } : {}) });
  }
  P.active = next;
  return { ...context, fresh, gameOver: s.gameOver, active: [...next.values()] };
}

export function summarize(records, seconds) {
  return Object.fromEntries(KINDS.map(kind => {
    const shown = records.filter(r => r.kind === kind && r.transition === 'shown');
    const actionable = new Set(records.filter(r => r.kind === kind && r.actionable).map(r => r.sequence));
    return [kind, { count: shown.length, perMinute: shown.length * 60 / seconds,
      actionable: shown.filter(r => actionable.has(r.sequence)).length,
      game: shown.filter(r => r.origin === 'game').length, player: shown.filter(r => r.origin === 'player').length }];
  }));
}

export async function runBrowserPacing(args) {
  for (const k of ['player', 'week-seconds', 'frame', 'no-spotlights', 'check', 'milestones']) {
    if (k in args) throw new Error(`pace --browser does not accept modeled option --${k}`);
  }
  const number = (key, fallback) => {
    const n = Number(args[key] ?? fallback);
    if (args[key] === true || !Number.isFinite(n) || n <= 0) throw new Error(`pace: --${key} needs a positive number`);
    return n;
  };
  const seed = number('seed', 1), speed = number('speed', 1), weeks = number('weeks', 156);
  const minutes = number('minutes', 60), sampleMinute = number('sample-minute', 2);
  if (![1, 2, 4].includes(speed)) throw new Error('pace: browser speed must be 1, 2 or 4');
  const bot = args.bot ?? 'sensible', size = parseSize(args.size ?? 'laptop');
  if (!BOTS[bot]) throw new Error(`pace: unknown bot ${bot}`);
  for (const [key, n] of [['seed', seed], ['weeks', weeks], ['sample-minute', sampleMinute]]) {
    if (!Number.isInteger(n)) throw new Error(`pace: --${key} needs an integer`);
  }
  const out = resolve(String(args.out ?? 'shots/pace-browser'));
  mkdirSync(out, { recursive: true });
  const mode = glMode(); holdRenderLock(mode);
  const server = await createServer({ plugins: [presentationMetadata()], server: { port: 0 }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    const log = console.log;
    try {
      if (args.json) console.log = console.error;
      ({ browser } = await launchChromium(chromium, { mode, label: 'pace' }));
    } finally { console.log = log; }
    const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
    await context.addInitScript(installObservation);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${server.resolvedUrls.local[0]}?seed=${seed}&speed=0&snap=1&quality=low`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__HITL_READY, null, { timeout: 60000 });
    await page.evaluate(async ({ bot, speed, reader }) => {
      const bots = await import('/src/sim/bots.js');
      const P = window.__pace, H = window.__HITL;
      P.read = (0, eval)(`(${reader})`);
      P.start = performance.now(); P.lastTurn = -1; P.weekAt = performance.now();
      P.seenWeek = H.state.week;
      P.act = () => {
        const now = performance.now();
        if (H.state.week !== P.seenWeek) { P.seenWeek = H.state.week; P.weekAt = now; }
        const old = [...P.active.values()].filter(r => now / 1000 - P.start / 1000 - r.t >= (r.kind === 'decision' ? 8 : 6));
        const decision = old.find(r => r.kind === 'decision');
        const on = { onEvents: events => { P.tag(events, 'player'); H.emit(events); } };
        if (decision && H.state.pendingDecision) P.player(() => bots.botDecide(bot, H.state, on));
        for (const r of old.filter(r => ['card', 'tutorial', 'panel'].includes(r.kind))) {
          const buttons = [...document.querySelectorAll('.modal button,.announce button,.coach button,.panel-head button')];
          const b = buttons.find(x => x.checkVisibility() && /^(Got it|Onward|Nice!|Later|Skip tour|Close|See the decision)$/.test(x.textContent.trim()));
          if (b) P.player(() => b.click());
        }
        if (!H.state.pendingDecision && !window.__HITL_UI.isBusy() && P.lastTurn !== H.state.week && now - P.weekAt >= 2000) {
          P.player(() => bots.botTurn(bot, H.state, on)); P.lastTurn = H.state.week;
        }
      };
      H.setSpeed(speed);
    }, { bot, speed, reader: readPresentations.toString() });
    const records = [], samples = [];
    let result, lastProgress = -1;
    while (true) {
      result = await page.evaluate(collectPresentations);
      records.push(...result.fresh);
      const sampleStart = (sampleMinute - 1) * 60;
      if (result.t >= sampleStart && result.t < sampleStart + 60 && (result.fresh.length || !samples.length)) {
        const name = `sample-${result.t.toFixed(3).padStart(8, '0')}.png`;
        await page.screenshot({ path: `${out}/${name}` });
        samples.push({ t: result.t, file: name, sequences: result.active.map(r => r.sequence), shown: result.fresh.filter(r => r.transition === 'shown').map(r => r.sequence) });
      }
      if (Math.floor(result.t / 60) !== lastProgress) {
        lastProgress = Math.floor(result.t / 60);
        console.error(`pace browser: ${result.t.toFixed(1)}s week ${result.week} ${records.filter(r => r.transition === 'shown').length} presentations`);
        writeFileSync(`${out}/progress.json`, JSON.stringify({ ...result, records: records.length }));
      }
      if (errors.length || result.gameOver || result.week >= weeks || result.t >= minutes * 60) break;
      await page.evaluate(() => window.__pace.act());
      await page.waitForTimeout(100);
    }
    const report = { mode: 'browser', clock: 'performance.now (real elapsed seconds)', seed, speed, bot,
      policy: 'weekly bot management after 2s; decision reading 8s; other cards 6s; visible current Yak channel only',
      elapsedSeconds: result.t, weeks: result.week, gameOver: result.gameOver,
      stop: errors.length ? 'error' : result.gameOver ? 'gameOver' : result.week >= weeks ? 'weeks' : 'minutes',
      rates: summarize(records, result.t), sample: { from: (sampleMinute - 1) * 60, to: sampleMinute * 60, frames: samples }, records, errors };
    writeFileSync(`${out}/observed.json`, JSON.stringify(report, null, 2) + '\n');
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify({ elapsedSeconds: result.t, weeks: result.week, rates: report.rates, errors }, null, 2));
    if (errors.length) throw new Error(`pace: browser errors: ${errors.join('; ')}`);
    if (args.weeks && report.stop === 'minutes') throw new Error(`pace: elapsed cap reached at week ${result.week}, before requested week ${weeks}`);
  } finally { await browser?.close(); await server.close(); }
}
