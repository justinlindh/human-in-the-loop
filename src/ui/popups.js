import { h, fmtMoney } from './dom.js';
import { CHANNEL } from './content.js';
import { SIMX } from './simapi.js';
import { EVENTS } from '../data/events.js';
import { icon } from './icons.js';
import { portrait, portraitLive, roleChip } from './widgets.js';

const LEADERSHIP_IDS = new Set(['ceo_replace_support', 'four_day_week', 'ai_first_mandate', 'rebrand', 'pivot_pitch', 'open_plan_office',
  'hackathon_week', 'founder_burnout', 'ceo_support_fallout', 'four_day_week_review', 'ai_first_review']);
const DELAYED = /later|week/i;

const isLeadership = (d) => EVENTS[d.eventId]?.kind === 'leadership' || LEADERSHIP_IDS.has(d.eventId);

// Modal layer for decisions and launch results. While a modal is open,
// toasts dock in its strip so a refused choice's reason shows right under the choices.
export function createPopups({ layer, ctx, toasts, restoreDock }) {
  const queue = []; // launch results waiting for the screen
  let launch = null; // { productId, prevSpeed, timers }
  let resumeSpeed = null; // speed to restore after a launch popup that a decision interrupted
  const backdrop = h('div.modal-back');
  backdrop.style.display = 'none';
  layer.append(backdrop);

  let shown = null; // the pendingDecision object on screen

  // What the launch popup's shortcuts need and the launch event doesn't carry, seen each week:
  // who worked on each project (and what it became), and the channel last promoting each product.
  const MEMORY = 40;
  const crews = new Map();    // projectId -> { name, productId, team: [staffId] }
  const lastChannel = new Map(); // 'p:<productId>' | 'j:<projectId>' -> channel id
  let seenWeek = null;
  function remember(s) {
    if (s.week === seenWeek) return;
    seenWeek = s.week;
    for (const j of s.projects ?? []) {
      if (!['new', 'update'].includes(j.kind)) continue;
      const team = s.staff.filter((p) => p.assignment?.type === 'project' && p.assignment.targetId === j.id).map((p) => p.id);
      crews.delete(j.id);
      crews.set(j.id, { name: j.name, productId: j.productId ?? null, team });
    }
    for (const c of s.campaigns ?? []) {
      const key = c.productId ? `p:${c.productId}` : `j:${c.projectId}`;
      lastChannel.delete(key);
      lastChannel.set(key, c.channel);
    }
    while (crews.size > MEMORY) crews.delete(crews.keys().next().value);
    while (lastChannel.size > MEMORY) lastChannel.delete(lastChannel.keys().next().value);
  }
  // The project that just shipped this product: an update names it, a new product shares its name.
  function crewFor(s, p) {
    let hit = null;
    for (const [id, c] of crews) if (!(s.projects ?? []).some((j) => j.id === id) && (c.productId === p.id || (!c.productId && c.name === p.name))) hit = [id, c];
    return hit;
  }

  // "Start v{n+1} with the same team" and "Run {channel} again": the usual next moves after a launch.
  function nextSteps(s, p) {
    const row = h('div.lnext');
    const done = (btn, text) => btn.replaceWith(h('span.pill.good', null, icon('check', { size: 12 }), ` ${text}`));
    const crew = crewFor(s, p);
    const updating = (s.projects ?? []).some((j) => j.productId === p.id && ['update', 'migration'].includes(j.kind));
    if (!p.killed && !updating) {
      const free = (st) => (crew?.[1].team ?? []).map((id) => st.staff.find((x) => x.id === id)).filter((x) => x && x.assignment?.type !== 'project');
      const n = free(s).length;
      const btn = h('button.btn.blue', { onclick: () => {
        const res = ctx.act({ type: 'startProject', kind: 'update', productId: p.id });
        if (!res.ok) return;
        const st = ctx.getState();
        const projectId = res.projectId ?? st.projects.find((j) => j.productId === p.id && j.kind === 'update')?.id;
        let moved = 0;
        if (projectId) for (const x of free(st)) if (ctx.act({ type: 'assign', staffId: x.id, assignment: { type: 'project', targetId: projectId } }).ok) moved++;
        ctx.sfx('confirm');
        done(btn, moved ? `v${p.version + 1} underway with ${moved} ${moved === 1 ? 'person' : 'people'}` : `v${p.version + 1} underway`);
      } }, icon('update', { size: 14 }), n ? ` Start v${p.version + 1} with the same team` : ` Start v${p.version + 1}`);
      row.append(btn);
    }
    const key = `p:${p.id}`;
    const ch = lastChannel.get(key) ?? (crew ? lastChannel.get(`j:${crew[0]}`) : null);
    const running = (s.campaigns ?? []).some((c) => c.productId === p.id && c.channel === ch);
    if (ch && CHANNEL[ch] && !p.killed && !running) {
      const cost = SIMX.campaignCost?.(s, ch) ?? CHANNEL[ch].cost;
      const btn = h('button.btn', { onclick: () => {
        if (!ctx.act({ type: 'runCampaign', channel: ch, productId: p.id, projectId: null }).ok) return;
        ctx.sfx('coin');
        done(btn, `${CHANNEL[ch].name} is live`);
      } }, icon(`channel.${ch}`, { size: 14 }), ` Run ${CHANNEL[ch].name} again`, h('span.num.lcost', { text: fmtMoney(cost) }));
      row.append(btn);
    }
    return row.childElementCount ? row : null;
  }
  let choiceBtns = [];

  function choose(i) {
    const d = ctx.getState().pendingDecision;
    if (!d || !d.choices[i]) return;
    const res = ctx.act({ type: 'resolveDecision', choice: i });
    if (res.ok) ctx.sfx('confirm');
    else {
      const b = choiceBtns[i];
      if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    }
  }

  function renderDecision(s, d) {
    const leader = isLeadership(d);
    const subject = s.staff.find((p) => p.id === d.subjectId)
      ?? (leader ? s.staff.find((p) => p.founder) : null);
    const product = s.products.find((p) => p.id === d.subjectId);
    choiceBtns = d.choices.map((c, i) => {
      const later = DELAYED.test(c.hint ?? '');
      const off = c.available === false;
      return h(`button.choice${off ? '.unavail' : ''}`, { onclick: () => choose(i), title: off ? c.reason ?? '' : '' },
        h('span.ckey.num', { text: String(i + 1) }),
        h('span.cbody', null,
          h('b.clabel', { text: c.label }),
          c.hint ? h('span.chint', null, later ? icon('hourglass', { size: 13, title: 'Effects arrive later' }) : null, later ? ' ' : null, c.hint) : null,
          off && c.reason && c.reason !== c.hint ? h('span.creason', null, icon('lock', { size: 12 }), ` ${c.reason}`) : null));
    });
    const body = leader && subject
      ? h('div.leader', null,
        h('div.lport', null, portraitLive(subject, 88), h('b.small', { text: subject.name.split(' ')[0] }), roleChip(subject.role)),
        h('div.bubble', null, h('p', { text: d.text })))
      : h('div.dtext', null,
        subject ? h('div.subj', null, portrait(subject, 44), h('div', null, h('b', { text: subject.name }), h('div', null, roleChip(subject.role)))) : null,
        product ? h('span.pill.ink', null, icon('product', { size: 12 }), ` ${product.name}`) : null,
        h('p', { text: d.text }));
    const dock = h('div.modal-dock');
    const card = h(`div.modal.decision${leader ? '.lead' : ''}`, null,
      h('div.mhead', null, icon(leader ? 'idea' : 'decision', { size: 24 }), h('h2', { text: d.title }), h('span.spacer'),
        h('span.mtag', { text: leader ? 'Leadership idea' : 'Decision' })),
      h('div.mbody', null, body, h('div.choices', null, ...choiceBtns),
        h('div.small.muted.keys', null, 'Press ', h('span.kbd', { text: '1' }), ` to `, h('span.kbd', { text: String(d.choices.length) }), ' to choose. The week waits for you.')),
      dock);
    backdrop.replaceChildren(card);
    // Decisions dock to the right with a light dim so the office stays readable behind them.
    backdrop.classList.add('docked');
    backdrop.style.display = '';
    toasts.setDock(dock);
    ctx.sfx('decision');
  }

  function hide() {
    backdrop.style.display = 'none';
    backdrop.replaceChildren();
    choiceBtns = [];
    shown = null;
    restoreDock();
  }

  const VERDICT = [[9, 'Instant classic'], [8, 'A hit'], [6.5, 'Solid launch'], [5, 'Mixed reviews'], [0, 'Oof']];
  const tier = (v) => (v >= 8 ? 'great' : v >= 6 ? 'ok' : v >= 4 ? 'meh' : 'bad');

  function showLaunch(s, productId) {
    const p = s.products.find((x) => x.id === productId);
    if (!p) return false;
    const prevSpeed = resumeSpeed ?? ctx.controls.getSpeed?.() ?? 1;
    resumeSpeed = null;
    ctx.controls.setSpeed?.(0);
    const reviews = (p.reviews ?? []).slice(0, 4);
    const cards = reviews.map((r) => h('div.rev', null,
      h('div.rev-top', null, h('b.outlet', { text: r.outlet }), h(`span.rscore.num.${tier(r.score)}`, { text: String(r.score) })),
      h('div.rquote', { text: `"${r.quote}"` })));
    const verdict = VERDICT.find(([min]) => p.score >= min)?.[1] ?? '';
    const final = h(`div.final.${tier(p.score)}`, null, h('span.small', { text: 'Review average' }), h('b.num', { text: p.score.toFixed(1) }), h('span.verdict', { text: verdict }));
    const ok = h('button.btn.go.big', { onclick: () => closeLaunch() }, 'Nice!');
    const dock = h('div.modal-dock');
    backdrop.classList.remove('docked');
    backdrop.replaceChildren(h('div.modal.launch', null,
      h('div.mhead', null, icon('launch', { size: 24 }), h('h2', { text: p.version > 1 ? `${p.name} v${p.version} is out!` : `${p.name} launched!` }), h('span.spacer'),
        h('span.mtag', { text: 'Launch day' })),
      h('div.mbody', null, h('div.revs', null, ...cards), final, h('div.row.lfoot', null, nextSteps(s, p), h('span.spacer'), ok)),
      dock));
    backdrop.style.display = '';
    toasts.setDock(dock);
    const timers = cards.map((c, i) => setTimeout(() => { c.classList.add('in'); ctx.sfx('blip'); }, 350 + i * 650));
    timers.push(setTimeout(() => { final.classList.add('in'); ctx.sfx(p.score >= 6.5 ? 'fanfare' : 'blip'); }, 350 + cards.length * 650 + 250));
    launch = { productId, prevSpeed, timers };
    return true;
  }

  function closeLaunch() {
    if (!launch) return;
    launch.timers.forEach(clearTimeout);
    if ((ctx.controls.getSpeed?.() ?? 0) === 0) ctx.controls.setSpeed?.(launch.prevSpeed);
    launch = null;
    backdrop.style.display = 'none';
    backdrop.replaceChildren();
    restoreDock();
    ctx.sfx('close');
  }

  function update(s) {
    remember(s);
    const d = s.pendingDecision;
    if (d && d !== shown) {
      // A decision outranks launch results; put an open launch back at the front of the queue.
      if (launch) { const id = launch.productId; launch.timers.forEach(clearTimeout); resumeSpeed = launch.prevSpeed; launch = null; queue.unshift(id); }
      shown = d;
      renderDecision(s, d);
      return;
    }
    if (!d && shown) hide();
    if (!shown && !launch && queue.length && !s.gameOver) {
      while (queue.length && !showLaunch(s, queue.shift()));
    }
  }

  function queueLaunch(productId) {
    if (!queue.includes(productId)) queue.push(productId);
    if (queue.length > 3) queue.splice(0, queue.length - 3);
  }

  // Returns true when the modal consumed the key.
  function onKey(e) {
    if (launch) {
      if (e.key === 'Enter' || e.code === 'Space' || e.key === 'Escape' || e.key === '1') { e.preventDefault(); closeLaunch(); }
      else e.preventDefault();
      return true;
    }
    if (!shown) return false;
    const n = Number(e.key);
    if (n >= 1 && n <= shown.choices.length) { e.preventDefault(); choose(n - 1); return true; }
    if (e.code === 'Space' || e.key === 'Escape' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); return true; }
    return false;
  }

  return { update, onKey, queueLaunch, get open() { return !!shown || !!launch; }, get launchOpen() { return !!launch; } };
}
