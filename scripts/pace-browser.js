// Browser implementation of pace.js. Metadata is attached only in this Vite session;
// records come from visible DOM surfaces, never from event delivery counts.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { glMode, holdRenderLock, launchChromium } from './lib/gl.js';
import { waitForBoot } from './lib/boot.js';
import { parseSize } from './tools/drive.mjs';
import { BOTS } from '../src/sim/bots.js';

export const KINDS = ['decision', 'toast', 'yak', 'yak-prompt', 'mail', 'advisor-prompt', 'office-prompt', 'panel', 'card', 'tutorial'];
// What asks the player for an answer: a gap between two of these, in running play, is the "ask gap".
export const ASKS = ['decision', 'yak-prompt', 'mail'];

// The game's measurement hooks (window.__hitlHooks, set by installObservation) and data attributes this
// tool reads, by the file that provides each. A run refuses to start when one is gone, instead of
// silently measuring an uninstrumented surface.
export const HOOK_SITES = {
  'src/main.js': ['__hitlHooks?.uiEvents', "__hitlHooks?.origin?.() === 'player'", '__hitlHooks?.playerEvents?.('],
  'src/ui/dom.js': ['__hitlHooks?.created?.(el)', '__hitlHooks?.listener'],
  'src/ui/toasts.js': ['__hitlHooks?.origin?.()', 'dataset.toastId', 'dataset.toastTag'],
  'src/ui/chat.js': ['__hitlHooks?.chatTag?.(m.id)', '__hitlHooks?.opened?.(el)'],
  'src/ui/incident.js': ['__hitlHooks?.opened?.(el)'],
  'src/ui/hud.js': ['dataset.needKey'],
  'src/ui/advisor.js': ['el.dataset.adviceKey', 'peek.dataset.adviceKey'],
};

// The hook sites missing from the source, as messages (none when all are there).
export function missingHooks(read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')) {
  const out = [];
  for (const [file, needles] of Object.entries(HOOK_SITES)) {
    let src = '';
    try { src = read(file); } catch { out.push(`pace: ${file} is missing`); continue; }
    for (const n of needles) if (!src.includes(n)) out.push(`pace: measurement hook missing in ${file}: expected ${n}. The game's hooks and scripts/pace-browser.js must match (see docs/toolkit/pace.md).`);
  }
  return out;
}

// A stored game (an event-index snapshot, .json.gz, or a state .json) as the localStorage entries the
// game's own saveGame writes, so the page loads it with continueGame as a player's save.
export async function saveEntries(file) {
  const { readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const { saveGame } = await import('../src/save/save.js');
  let raw;
  try { raw = readFileSync(file); } catch (e) { throw new Error(`pace: --load ${file}: ${e.message}`); }
  let state;
  try { state = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8')); }
  catch (e) { throw new Error(`pace: --load ${file} is not a saved game: ${e.message}`); }
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  if (!saveGame(state, storage)) throw new Error(`pace: --load ${file}: the game would not save it`);
  return [...mem.entries()];
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
  // The game calls these where it creates surfaces, handles clicks and routes events (HOOK_SITES).
  window.__hitlHooks = {
    origin: () => P.origin,
    created: (el) => { el.__paceOrigin = P.origin; },
    opened: (el) => { el.__paceOrigin = P.origin; },
    listener: (fn) => function (...args) { return P.player(() => fn.apply(this, args)); },
    chatTag: (id) => P.chatOrigins.get(id) ?? 'game',
    playerEvents: (events) => P.tag(events, 'player'),
    uiEvents: (events, state, ui) => P.present(events, state, ui),
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
    const full = el.textContent.trim().replace(/\s+/g, ' ');
    // words is the whole surface's, for reading time; text is cut for the report.
    rows.push({ kind, id: String(id), text: full.slice(0, 500), words: full ? full.split(' ').length : 0,
      actionable: actions.length > 0 || el.matches('button,.clickable'), actions,
      origin: el.dataset.toastTag || el.dataset.tag || el.__paceOrigin || 'game', ...extra });
  };
  for (const el of document.querySelectorAll('.modal,.announce,.panel,.coach,.inccard,.callgrid,.go-card,.chat.max')) {
    const title = el.matches('.inccard') ? `incident:${s.outage?.productId}:${s.outage?.kind}`
      : el.matches('.chat.max') ? 'Yak'
      : el.querySelector('h1,h2')?.textContent ?? el.querySelector('b')?.textContent ?? el.textContent.slice(0, 80);
    // A letter the attention queue presents opens as a decision-like card; it is the letter, by its mail id.
    if (el.matches('.letterdecision')) {
      const m = (s.mail ?? []).find((x) => x.options?.length && !x.resolved && !x.archived && x.subject && el.textContent.includes(x.subject));
      add(el, 'mail', m?.id ?? title);
      continue;
    }
    const decision = el.matches('.decision');
    const kind = decision ? 'decision' : el.matches('.coach') ? 'tutorial' : el.matches('.announce,.launch,.go-card') ? 'card' : 'panel';
    add(el, kind, decision ? s.pendingDecision?.id ?? s.pendingDecision?.eventId ?? title : title,
      decision ? { eventId: s.pendingDecision?.eventId } : {});
  }
  for (const el of document.querySelectorAll('.toast:not(.out),.dtoast')) {
    if (!el.dataset.toastId) throw new Error('pace: toast metadata is missing');
    add(el, 'toast', el.dataset.toastId);
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
  for (const el of document.querySelectorAll('.advpeek.show,.advitem')) add(el, 'advisor-prompt', el.dataset.adviceKey);
  for (const el of document.querySelectorAll('.needrow[data-need-key^="office-move-"]')) add(el, 'office-prompt', el.dataset.needKey);
  return rows;
}

export function collectPresentations() {
  const P = window.__pace, H = window.__HITL, s = H.state, t = (performance.now() - P.start) / 1000;
  // The game clock ran since the last sample when its week or its place in the week moved; otherwise
  // it was held (paused, a card or menu, a spotlight). run is the running-play seconds so far.
  const clock = `${s.week}:${H.clock?.acc ?? ''}`;
  const dt = P.lastT == null ? 0 : t - P.lastT;
  const ran = P.lastClock != null && clock !== P.lastClock;
  if (P.lastClock != null) {
    if (ran) P.running = (P.running ?? 0) + dt;
    else {
      P.held = (P.held ?? 0) + dt;
      // What held it: the first that applies, in the order the game checks them.
      // A launch card pauses the game itself (speed 0), so it is checked before speed.
      const c = H.controls, why = s.gameOver ? 'gameOver' : s.pendingDecision ? 'decision'
        : document.querySelector('.modal.letterdecision')?.checkVisibility() ? 'decision'
        : document.querySelector('.modal.launch')?.checkVisibility() ? 'card'
        : c?.getSpeed?.() === 0 ? (c.awayPaused ? 'away' : 'speed0') : window.__HITL_UI?.isBusy?.() ? 'menu'
        : c?.spotlightHeld?.() ? 'spotlight' : document.hidden ? 'hidden' : 'other';
      P.heldBy ??= {}; P.heldBy[why] = (P.heldBy[why] ?? 0) + dt;
    }
  }
  P.lastClock = clock; P.lastT = t;
  const context = { t, run: P.running ?? 0, week: s.week, era: s.era.id, officeStage: s.officeStage };
  // The answerable series, from the game's own state: an open decision, an unanswered Yak prompt, a
  // letter with a choice. Each joins when it opens; also the most open at once, and the running play
  // spent with none open.
  if (s.pendingDecision !== P.decisionObj) { P.decisionObj = s.pendingDecision; P.decisionN = (P.decisionN ?? 0) + 1; }
  const open = [
    ...(s.pendingDecision ? [['decision', `${s.pendingDecision.eventId}#${P.decisionN}`]] : []),
    ...(s.chatPrompts ?? []).filter((p) => !p.resolved).map((p) => ['yak-prompt', p.id]),
    ...(s.mail ?? []).filter((m) => m.options?.length && !m.resolved && !m.archived).map((m) => ['mail', m.id]),
  ];
  P.asks ??= []; P.askSeen ??= new Set();
  for (const [kind, id] of open) if (!P.askSeen.has(`${kind}:${id}`)) { P.askSeen.add(`${kind}:${id}`); P.asks.push({ kind, id, t, run: context.run, week: s.week }); }
  P.openMax = Math.max(P.openMax ?? 0, open.length);
  P.quiet = open.length ? 0 : (P.quiet ?? 0) + (ran ? dt : 0);
  P.longestQuiet = Math.max(P.longestQuiet ?? 0, P.quiet);
  const next = new Map(), fresh = [];
  // A letter that needs an answer is an ask the moment it lands (the mail button shows it), whether or
  // not the inbox is open.
  P.mailSeen ??= new Set();
  for (const m of s.mail ?? []) {
    if (P.mailSeen.has(m.id) || !m.options?.length || m.resolved) continue;
    P.mailSeen.add(m.id);
    fresh.push({ ...context, kind: 'mail', id: m.id, text: `${m.subject ?? ''} ${m.body ?? ''}`.trim().slice(0, 500), actionable: true, actions: m.options.map((o) => o.label),
      origin: 'game', sequence: ++P.serial, transition: 'shown' });
  }
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
  // An ask that closes without having been on screen (a decision or Yak prompt seen in a sample, a letter
  // the player opened) is missed: it took its default, and the series still counts it.
  P.viewed ??= new Set();
  for (const r of next.values()) {
    if (r.kind === 'decision' && s.pendingDecision) P.viewed.add(`decision:${s.pendingDecision.eventId}#${P.decisionN}`);
    if (r.kind === 'yak-prompt') P.viewed.add(`yak-prompt:${r.id}`);
    if (r.kind === 'mail') P.viewed.add(`mail:${r.id}`);
  }
  const openKeys = new Set(open.map(([kind, id]) => `${kind}:${id}`));
  // A Yak prompt seen but closed with no choice ran out of time while on screen.
  for (const key of P.lastOpen ?? []) {
    if (openKeys.has(key)) continue;
    if (!P.viewed.has(key)) { (P.missed ??= []).push({ key, t, week: s.week }); continue; }
    const p = key.startsWith('yak-prompt:') && s.chatPrompts?.find((x) => `yak-prompt:${x.id}` === key);
    if (p && p.resolved && p.resolved.choice == null) (P.expired ??= []).push({ key, t, week: s.week });
  }
  P.lastOpen = openKeys;
  return { ...context, held: P.held ?? 0, heldBy: P.heldBy ?? {}, task: P.task ?? null, missed: P.missed ?? [], expired: P.expired ?? [], asks: P.asks, openMax: P.openMax, longestQuiet: P.longestQuiet ?? 0, fresh, gameOver: s.gameOver, active: [...next.values()] };
}

// The paused share of wall time and the answerable series: asks ({ kind, run }, in order), the gaps
// between them in running-play seconds, the longest running stretch with nothing open to answer, and
// the most open at once.
export function askGaps(asks, elapsed, held, { openMax = 0, longestQuiet = 0, heldBy = {}, missed = [], expired = [] } = {}) {
  const gaps = asks.slice(1).map((r, i) => +(r.run - asks[i].run).toFixed(1));
  const sorted = [...gaps].sort((a, b) => a - b);
  const runTotal = Math.max(0, elapsed - held);
  return {
    pausedShare: elapsed ? +(held / elapsed).toFixed(3) : 0, heldSeconds: +held.toFixed(1), runningSeconds: +runTotal.toFixed(1),
    heldBy: Object.fromEntries(Object.entries(heldBy).map(([k, v]) => [k, +v.toFixed(1)])),
    asks: asks.length, asksPerRunningMinute: runTotal ? +(asks.length * 60 / runTotal).toFixed(2) : 0,
    byKind: Object.fromEntries(ASKS.map((k) => [k, asks.filter((r) => r.kind === k).length])),
    gap: gaps.length ? { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], mean: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1), max: sorted.at(-1) } : null,
    longestWithNothingToAnswer: +longestQuiet.toFixed(1), mostOpenAtOnce: openMax, missedAsks: missed.length, missed, expiredWhileShown: expired.length, expired,
    gaps, series: asks,
  };
}

// Runs in the page: the simulated player. o = { bot, speed, reader, wpm, choose, flat, menuSeconds }.
// flat is the old bot timing (8 s on a decision, 6 s on anything else, prompts and mail answered in the
// weekly turn). Otherwise each surface waits its reading time (dwellSeconds), Yak prompts and mail stay
// for the player to answer through the UI with the choice the bot would make, and menuSeconds of every
// running minute is spent with a management panel open.
export async function installPlayer(o) {
  const bots = await import('/src/sim/bots.js');
  const P = window.__pace, H = window.__HITL;
  P.read = (0, eval)(`(${o.reader})`);
  P.start = performance.now(); P.lastTurn = -1; P.weekAt = performance.now(); P.seenWeek = H.state.week;
  P.due = new Map(); P.task = null; P.owed = 0; P.ranAt = 0;
  const now = () => (performance.now() - P.start) / 1000;
  const dwellSeconds = (0, eval)(`(${o.dwell})`);
  const dwell = (words, actionable, kind) => (o.flat ? (kind === 'decision' ? 8 : 6) : dwellSeconds(words, actionable, o));
  const due = (key, secs) => { if (!P.due.has(key)) P.due.set(key, now() + secs); return now() >= P.due.get(key); };
  const on = { onEvents: (events) => { P.tag(events, 'player'); H.emit(events); } };
  const shown = (el) => !!el?.isConnected && el.checkVisibility();
  const click = (el) => { if (!shown(el) || el.disabled) return false; P.player(() => el.click()); return true; };
  const closePanel = () => click(document.querySelector('.panel-head button.x'))
    || P.player(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })));
  const openPrompts = () => (H.state.chatPrompts ?? []).filter((p) => !p.resolved);
  const openMail = () => (H.state.mail ?? []).filter((m) => m.options?.length && !m.resolved && !m.archived);
  // The bot's own choice for one prompt or letter, from a copy of the game, so the click is the one the bot would make.
  const botChoice = (kind, id) => {
    const c = JSON.parse(JSON.stringify(H.state));
    c.chatPrompts = (c.chatPrompts ?? []).filter((p) => kind === 'prompt' && p.id === id);
    c.mail = (c.mail ?? []).filter((m) => kind === 'mail' && m.id === id);
    try { bots.botTurn(o.bot, c); } catch { return null; }
    return (kind === 'prompt' ? c.chatPrompts : c.mail).find((x) => x.id === id)?.resolved?.choice ?? null;
  };
  const pick = (buttons, choice) => buttons[choice] && !buttons[choice].disabled ? buttons[choice] : buttons.find((b) => !b.disabled);
  // The weekly management turn. With the player answering prompts and mail itself, the bot doesn't see them.
  const turn = () => {
    const s = H.state;
    if (o.flat) { P.player(() => bots.botTurn(o.bot, s, on)); return; }
    const cp = s.chatPrompts ?? [], ml = s.mail ?? [];
    s.chatPrompts = cp.filter((p) => p.resolved); s.mail = ml.filter((m) => m.resolved || !m.options?.length || m.archived);
    try { P.player(() => bots.botTurn(o.bot, s, on)); }
    finally {
      s.chatPrompts = [...cp, ...(s.chatPrompts ?? []).filter((p) => !cp.includes(p))];
      s.mail = [...ml, ...(s.mail ?? []).filter((m) => !ml.includes(m))];
    }
  };
  P.act = () => {
    const t = now(), run = P.running ?? 0;
    if (H.state.week !== P.seenWeek) { P.seenWeek = H.state.week; P.weekAt = performance.now(); }
    if (o.menuSeconds) { P.owed += Math.max(0, run - P.ranAt) * o.menuSeconds / 60; P.ranAt = run; }
    const active = [...P.active.values()];
    // A letter the attention queue presented as a card: read it, then answer with the bot's choice.
    const letterCard = document.querySelector('.modal.letterdecision');
    if (shown(letterCard)) {
      const m = openMail().find((x) => x.subject && letterCard.textContent.includes(x.subject));
      if (m && due(`letter:${m.id}`, dwell(`${m.subject ?? ''} ${m.body ?? ''}`, true))) {
        (P.viewed ??= new Set()).add(`mail:${m.id}`);
        const b = pick([...letterCard.querySelectorAll('button.mailopt')], botChoice('mail', m.id));
        if (b) click(b);
      }
    }
    // Decisions, cards and tutorials the game put up: read, then choose or dismiss.
    for (const r of active) {
      const key = `${r.kind}:${r.sequence}`;
      if (r.kind === 'decision' && H.state.pendingDecision && due(key, dwell(r.words ?? r.text, r.actionable, r.kind))) P.player(() => bots.botDecide(o.bot, H.state, on));
      if (['card', 'tutorial'].includes(r.kind) || (r.kind === 'panel' && !P.task)) {
        if (!due(key, dwell(r.words ?? r.text, r.actionable, r.kind))) continue;
        const b = [...document.querySelectorAll('.modal button,.announce button,.coach button,.panel-head button')]
          .find((x) => x.checkVisibility() && /^(Got it|Onward|Nice!|Later|Skip tour|Close|See the decision)$/.test(x.textContent.trim()));
        if (b) click(b);
      }
    }
    // Build mode (a reply that promises an item opens it): read the bar, Place for me, then Done.
    const bar = document.querySelector('.buildbar');
    if (P.task?.kind === 'build' && !shown(bar)) P.task = null;
    else if (!P.task && shown(bar)) P.task = { kind: 'build', due: t + dwell(bar.textContent, true), placed: false };
    else if (P.task?.kind === 'build' && t >= P.task.due) {
      if (!P.task.placed) { click(bar.querySelector('button.bauto')); P.task = { ...P.task, placed: true, due: t + 1 }; }
      else click(bar.querySelector('button.btn.go:not(.bplace)'));
    }
    if (!o.flat) {
      // Yak prompts: read a visible one with its post, then reply.
      for (const r of active.filter((x) => x.kind === 'yak-prompt')) {
        const post = active.find((x) => x.kind === 'yak' && x.id === r.chatId);
        if (!due(`prompt:${r.id}`, dwell((post?.words ?? 0) + (r.words ?? 0), true))) continue;
        const el = document.querySelector(`.yprompt[data-prompt="${CSS.escape(r.id)}"]`);
        const b = pick([...(el?.querySelectorAll('button.yp-opt') ?? [])], botChoice('prompt', r.id));
        if (b) click(b);
      }
      // One waiting out of view: the Reply mark while Yak is collapsed, else the channel tab marked for a
      // prompt, else scroll the open channel to it.
      if (openPrompts().length && !active.some((x) => x.kind === 'yak-prompt')) {
        const tab = [...document.querySelectorAll('button.ctab.prompt')].find((b) => shown(b) && !b.classList.contains('on'));
        const el = document.querySelector(`.yprompt[data-prompt="${CSS.escape(openPrompts()[0].id)}"]`);
        if (!click(document.querySelector('button.ymark')) && !click(tab) && el) P.player(() => el.scrollIntoView({ block: 'center' }));
      }
      // Mail: open the inbox when a letter needs an answer, read each one, answer it, then close the inbox.
      const busy = H.state.pendingDecision || shown(letterCard) || active.some((x) => ['decision', 'card', 'tutorial'].includes(x.kind));
      if (!P.task && !busy && openMail().length && !window.__HITL_UI.isBusy() && click(document.querySelector('button.mailbtn'))) P.task = { kind: 'mail', id: null };
      else if (P.task?.kind === 'mail') {
        const letter = P.task.id && H.state.mail.find((m) => m.id === P.task.id);
        if (!P.task.id || !letter || letter.resolved) {
          const next = openMail()[0];
          if (!next) { closePanel(); P.task = null; }
          else if (click(document.querySelector(`[data-mail="${CSS.escape(next.id)}"]`)) && (P.viewed ??= new Set()).add(`mail:${next.id}`)) P.task = { kind: 'mail', id: next.id, due: t + dwell(`${next.subject ?? ''} ${next.body ?? ''}`, true) };
          else if (!document.querySelector('.maillist')) click(document.querySelector('button.mailback'));
        } else if (t >= P.task.due) {
          const b = pick([...document.querySelectorAll('button.mailopt')], botChoice('mail', letter.id));
          if (b) click(b);
        }
      }
      // Menu time: a management panel open for the minutes of running play it is owed.
      if (o.menuSeconds && !P.task && !busy && P.owed >= o.menuSeconds && !window.__HITL_UI.isBusy()) {
        const staff = [...document.querySelectorAll('button')].find((b) => shown(b) && !b.closest('.panel') && /Staff$/.test(b.textContent.trim()));
        if (click(staff)) { P.task = { kind: 'menu', until: t + P.owed }; P.owed = 0; }
      } else if (P.task?.kind === 'menu' && t >= P.task.until) { closePanel(); P.task = null; }
    }
    if (!P.task && !H.state.pendingDecision && !shown(letterCard) && !window.__HITL_UI.isBusy() && P.lastTurn !== H.state.week && performance.now() - P.weekAt >= 2000) {
      turn(); P.lastTurn = H.state.week;
    }
  };
  H.setSpeed(o.speed);
}

// Seconds a person spends on a surface: its words (a count, or the text) at wpm, plus choose when it
// asks for a choice. installPlayer runs this same function in the page.
export const dwellSeconds = (words, actionable, { wpm, choose }) =>
  (typeof words === 'number' ? words : String(words ?? '').split(/\s+/).filter(Boolean).length) / wpm * 60 + (actionable ? choose : 0);

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
  // Human timing by default: 200 words a minute, 4 s to choose, 10 s of menus per running minute.
  // --flat keeps the old bot timing (8 s and 6 s, prompts and mail inside the weekly turn).
  const flat = !!args.flat;
  if (flat && ['wpm', 'choose', 'menu-seconds'].some((k) => k in args)) throw new Error('pace: --flat takes no --wpm, --choose or --menu-seconds');
  const wpm = number('wpm', 200);
  const nonNegative = (key, fallback) => {
    const n = Number(args[key] ?? fallback);
    if (args[key] === true || !Number.isFinite(n) || n < 0) throw new Error(`pace: --${key} needs a number of seconds, 0 or more`);
    return n;
  };
  const choose = nonNegative('choose', 4), menuSeconds = flat ? 0 : nonNegative('menu-seconds', 10);
  if (menuSeconds >= 60) throw new Error('pace: --menu-seconds is per running minute, so under 60');
  if (args.era !== undefined && args.load !== undefined) throw new Error('pace: --era and --load are exclusive');
  if (args.era === true || args.load === true) throw new Error(`pace: --${args.era === true ? 'era' : 'load'} needs a value`);
  const { ERA_STARTS } = await import('../src/data/era-modes.js');
  if (args.era !== undefined && !Object.hasOwn(ERA_STARTS, args.era)) throw new Error(`pace: unknown start era ${args.era} (one of ${Object.keys(ERA_STARTS).join(', ')})`);
  const saved = args.load !== undefined ? await saveEntries(String(args.load)) : null;
  if (![1, 2, 4].includes(speed)) throw new Error('pace: browser speed must be 1, 2 or 4');
  const bot = args.bot ?? 'sensible', size = parseSize(args.size ?? 'laptop');
  if (!BOTS[bot]) throw new Error(`pace: unknown bot ${bot}`);
  for (const [key, n] of [['seed', seed], ['weeks', weeks], ['sample-minute', sampleMinute]]) {
    if (!Number.isInteger(n)) throw new Error(`pace: --${key} needs an integer`);
  }
  const out = resolve(String(args.out ?? 'shots/pace-browser'));
  mkdirSync(out, { recursive: true });
  const missing = missingHooks();
  if (missing.length) throw new Error(missing.join('\n'));
  const mode = glMode(); holdRenderLock(mode);
  const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
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
    await waitForBoot(page);
    // Another start: a new company founded in that era, or a stored game through the game's own load.
    const start = await page.evaluate(({ seed, era, saved }) => {
      const H = window.__HITL;
      if (era) H.controls.newGame({ seed, startEra: era });
      if (saved) {
        for (const [k, v] of saved) localStorage.setItem(k, v);
        const r = H.controls.continueGame();
        if (!r.ok) return { error: `could not load the save: ${r.reason ?? 'refused'}` };
      }
      return { week: H.state.week, era: H.state.era?.id };
    }, { seed, era: args.era ?? null, saved });
    if (start.error) throw new Error(`pace: ${start.error}`);
    await page.evaluate(installPlayer, { bot, speed, reader: readPresentations.toString(), dwell: dwellSeconds.toString(), wpm, choose, flat, menuSeconds });
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
    const policy = flat
      ? 'weekly bot management after 2s; decision reading 8s; other cards 6s; Yak prompts and mail answered in the weekly turn'
      : `human: every surface stays words/${wpm} wpm plus ${choose}s to choose; Yak prompts and mail answered through the UI with the bot's choice after their reading time; ${menuSeconds}s of menus per running minute; weekly bot management after 2s`;
    const report = { mode: 'browser', clock: 'performance.now (real elapsed seconds)', seed, speed, bot,
      start: args.load ? { load: String(args.load), ...start } : { era: start.era, week: start.week },
      timing: flat ? { flat: true } : { wpm, choose, menuSeconds }, policy,
      elapsedSeconds: result.t, weeks: result.week, gameOver: result.gameOver,
      pacing: askGaps(result.asks, result.t, result.held, { openMax: result.openMax, longestQuiet: result.longestQuiet, heldBy: result.heldBy, missed: result.missed, expired: result.expired }),
      stop: errors.length ? 'error' : result.gameOver ? 'gameOver' : result.week >= weeks ? 'weeks' : 'minutes',
      rates: summarize(records, result.t), sample: { from: (sampleMinute - 1) * 60, to: sampleMinute * 60, frames: samples }, records, errors };
    writeFileSync(`${out}/observed.json`, JSON.stringify(report, null, 2) + '\n');
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify({ elapsedSeconds: result.t, weeks: result.week, pacing: { ...report.pacing, gaps: undefined, series: undefined }, rates: report.rates, errors }, null, 2));
    if (errors.length) throw new Error(`pace: browser errors: ${errors.join('; ')}`);
    if (args.weeks && report.stop === 'minutes') throw new Error(`pace: elapsed cap reached at week ${result.week}, before requested week ${weeks}`);
  } finally { await browser?.close(); await server.close(); }
}
