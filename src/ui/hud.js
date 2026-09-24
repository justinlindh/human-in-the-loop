import { h, setText, setWidth, toggleClass, setClass, fmtMoney, fmtNum, dateOf, clear } from './dom.js';
import { B, trendName, INCIDENT_LABEL, capacityOf } from './content.js';
import { icon } from './icons.js';
import { projectLabel } from './panels/common.js';
import { GOALS, strainOf, STRAIN_WARN } from './v2content.js';
import { weeklyCosts, weeklyRevenue } from '../sim/economy.js';

export const liveProducts = (s) => s.products.filter((p) => !p.killed);
export const totalMrr = (s) => liveProducts(s).reduce((a, p) => a + (Number.isFinite(p.mrr) ? p.mrr : 0), 0);
export const totalCustomers = (s) => liveProducts(s).reduce((a, p) => a + (Number.isFinite(p.customers) ? p.customers : 0), 0);

// Weekly cash change from the sim's own revenue and cost functions.
export function weeklyNet(s) {
  try {
    const costs = Object.values(weeklyCosts(s)).reduce((a, v) => a + v, 0);
    const net = weeklyRevenue(s) - costs;
    if (Number.isFinite(net)) return net;
  } catch {
    // Fall through to the history estimate for states the economy module cannot read.
  }
  return historyNet(s);
}

function historyNet(s) {
  const hist = s.history ?? [];
  if (hist.length < 2) return null;
  const k = Math.min(4, hist.length - 1);
  const past = hist[hist.length - 1 - k];
  const net = (s.cash - past.cash) / Math.max(1, s.week - past.week);
  return Number.isFinite(net) ? net : null;
}

// Modifier labels and polarity come from src/data/modifiers.js; the fallback covers the keys
// where an increase hurts until that table is merged.
const modMods = import.meta.glob('../data/modifiers.js', { eager: true });
const MODIFIER_KEYS = Object.values(modMods)[0]?.MODIFIER_KEYS ?? {};
const BAD_WHEN_UP = new Set(['meaningDrain', 'churn', 'staminaDrain', 'rogueRisk']);

const isGood = (m) => {
  const k = MODIFIER_KEYS[m.key];
  if (k) return (m.value > 0) === (k.goodWhen === 'up');
  return BAD_WHEN_UP.has(m.key) ? m.value < 0 : m.value > 0;
};

function keyLabel(k) {
  return MODIFIER_KEYS[k]?.label ?? String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function fmtValue(m) {
  const pct = (MODIFIER_KEYS[m.key]?.format ?? (Math.abs(m.value) < 1 ? 'pct' : 'flat')) === 'pct';
  const sign = m.value > 0 ? '+' : '';
  return pct ? `${sign}${Math.round(m.value * 100)}%` : `${sign}${Math.round(m.value * 10) / 10}/wk`;
}

// Modifiers sharing a label and end week (one decision's effects) show as one row.
function groupEffects(s) {
  const out = new Map();
  for (const m of s.modifiers ?? []) {
    if (!(m.untilWeek > s.week)) continue;
    const k = `${m.label}|${m.untilWeek}`;
    if (!out.has(k)) out.set(k, { label: m.label, untilWeek: m.untilWeek, parts: [] });
    out.get(k).parts.push(m);
  }
  return [...out.values()].slice(0, 4);
}

// Things waiting on the player, most urgent first. Each has a click-to-fix target.
export function needsYou(s) {
  const out = [];
  if (s.outage?.unrecoverable) {
    const p = s.products.find((x) => x.id === s.outage.productId);
    out.push({ key: 'outage', icon: 'tray.outage', text: `Nobody can fix ${p?.name ?? 'the outage'}`, go: ['ops'] });
  }
  if (s.cash < 0) out.push({ key: 'cash', icon: 'money', text: 'Cash is in the red', go: ['reports'] });
  // Several unstaffed projects fold into one line that opens the Projects tab.
  const empty = s.projects.filter((j) => !s.staff.some((p) => p.assignment?.type === 'project' && p.assignment.targetId === j.id));
  if (empty.length === 1) {
    const j = empty[0];
    out.push({ key: `proj:${j.id}`, icon: 'tray.project', text: `Nobody is working on ${projectLabel(s, j)}`, go: ['build', { projectId: j.id }] });
  } else if (empty.length > 1) {
    const updates = empty.every((j) => j.kind === 'update');
    out.push({ key: `proj:${empty.length}`, icon: 'tray.project', text: `${empty.length} ${updates ? 'product updates' : 'projects'} have nobody on them`, go: ['build', { projectId: empty[0].id }] });
  }
  for (const p of s.staff) {
    if (p.pathPending) out.push({ key: `path:${p.id}`, icon: 'path', text: `${p.name.split(' ')[0]} can pick a career path`, go: ['staff', { staffId: p.id, pickPath: true }] });
  }
  for (const p of s.products) {
    if (!p.killed && p.migrationDueWeek != null && !s.projects.some((j) => j.kind === 'migration' && j.productId === p.id)) {
      const w = p.migrationDueWeek - s.week;
      out.push({ key: `mig:${p.id}`, icon: 'migrate', text: `Migrate ${p.name} ${w <= 0 ? 'now' : `within ${w}w`}`, go: ['models'] });
    }
  }
  // Several weeks at empty stamina is the warning sign before burnout.
  const drained = s.staff.filter((p) => p.mood !== 'away' && p.mood !== 'burnout' && strainOf(p) >= STRAIN_WARN).sort((a, b) => strainOf(b) - strainOf(a));
  if (drained.length === 1) out.push({ key: `strain:${drained[0].id}`, icon: 'battery.low', text: `${drained[0].name.split(' ')[0]} looks exhausted`, go: ['staff', { staffId: drained[0].id }], quick: { label: 'Time off', action: { type: 'timeOff', staffId: drained[0].id } } });
  else if (drained.length > 1) out.push({ key: `strain:${drained.length}`, icon: 'battery.low', text: `${drained.length} people look exhausted`, go: ['staff', { staffId: drained[0].id }] });
  const idle = s.staff.filter((p) => p.assignment?.type === 'idle' && p.mood !== 'away').length;
  if (idle) out.push({ key: 'idle', icon: 'team', text: `${idle} ${idle === 1 ? 'person is' : 'people are'} idle`, go: ['staff'] });
  return out;
}

const SPEEDS = [
  { k: 0, ico: 'speed.pause', title: 'Pause (Space)' },
  { k: 1, ico: 'speed.play', title: 'Normal speed (1)' },
  { k: 2, ico: 'speed.fast', title: 'Fast (2)' },
  { k: 4, ico: 'speed.fastest', title: 'Fastest (3)' },
];

export function createHud({ root, controls, ui }) {
  const logo = h('div.logo');
  const name = h('div.name');
  const dateVal = h('span.num');
  const company = h('div.chip.company', { title: 'Your company' },
    logo, h('div', null, name, h('div.date', null, dateVal)));

  const cashVal = h('div.val.num');
  const cashSub = h('div.sub');
  const cash = h('div.chip.cash', { title: 'Cash on hand. Below zero for 8 weeks and the lab folds.' }, h('div.lbl', { text: 'Cash' }), cashVal, cashSub);

  const mrrVal = h('span.num');
  const mrrTrend = h('span.trend');
  const mrrSub = h('div.sub.opt');
  const mrr = h('div.chip.mrr', { title: 'Monthly recurring revenue across live products' },
    h('div.lbl', { text: 'MRR' }), h('div.val', null, mrrVal, mrrTrend), mrrSub);

  const teamVal = h('span.num');
  const teamSub = h('div.sub.opt');
  const team = h('div.chip.team', { title: 'Headcount and office capacity', onclick: () => ui.open('staff'), style: { cursor: 'pointer' } },
    h('div.lbl', { text: 'Team' }), h('div.val', null, teamVal), teamSub);

  const meter = (label, cls, title) => {
    const fill = h('i');
    const v = h('span.v.num');
    const bar = h(`div.bar.${cls}`, null, fill);
    const el = h('div.hmeter', { title }, h('span.lbl', { text: label }), v, bar);
    return { el, fill, v, bar };
  };
  const mBrand = meter('Brand', 'brand', 'Brand: multiplies signups and reduces churn. Slow to build.');
  const mIk = meter('Know-how', 'ik', 'Institutional Knowledge: how well your people understand your own systems.');
  const mDebt = meter('Debt', 'debt', 'Comprehension Debt: shipped behavior nobody on staff understands. Raises incidents.');
  const meters = h('div.chip.meters', null, mBrand.el, mIk.el, mDebt.el);

  const pausedTag = h('span.paused-tag', { text: 'Paused' });
  const menuTag = h('span.paused-tag.menu', { text: 'Paused: menu open', title: 'Time waits while a menu is open. Change this in Settings.' });
  const speedBtns = SPEEDS.map((sp) => h('button.btn.small', {
    title: sp.title,
    onclick: () => ui.setSpeed(sp.k),
  }, icon(sp.ico)));
  const gear = h('button.btn.small.gear', { title: 'Settings', onclick: () => ui.openSettings?.() }, icon('settings'));
  const speed = h('div.chip.speed', null, pausedTag, menuTag, ...speedBtns, gear);

  const bar = h('div.topbar', null, company, cash, mrr, team, meters, h('div.spacer'), speed);

  const tray = h('div.tray');
  root.append(bar, tray);

  let traySig = '';
  let trayBinds = [];

  function buildTray(s) {
    clear(tray);
    trayBinds = [];
    const needs = needsYou(s);
    if (needs.length) {
      const shown = needs.slice(0, 4);
      tray.append(h('div.tray-card.needs', null,
        h('div.t', null, h('span', { text: 'Needs you' }), h('span.k', { text: needs.length > 4 ? `+${needs.length - 4}` : '' })),
        ...shown.map((n) => {
          // An item can carry a one-tap fix next to it (e.g. time off for someone exhausted).
          const quick = n.quick ? h('button.btn.small.go.nquick', { onclick: (e) => { e.stopPropagation(); ui.act?.(n.quick.action); } }, n.quick.label) : null;
          return h('div.needrow', null, h('button.need', { onclick: () => ui.open(...n.go), title: 'Click to fix' },
            icon(n.icon, { size: 14 }), h('span', { text: n.text }), h('span.go', { text: '›' })), quick);
        })));
    }
    if (s.outage) {
      const o = s.outage;
      const p = s.products.find((x) => x.id === o.productId);
      const k = h('span.k');
      tray.append(h('div.tray-card.alert', { onclick: () => ui.open('ops') },
        h('div.t', null, h('span', null, icon('tray.outage'), ` ${p?.name ?? 'Product'} is down`), k),
        h('div', { style: { fontSize: '0.82em', marginTop: '0.15em' }, text: o.unrecoverable ? 'Nobody here can debug this.' : (INCIDENT_LABEL[o.kind] ?? 'Outage') })));
      trayBinds.push((st) => st.outage && setText(k, `SEV${6 - st.outage.severity} · ${st.outage.weeks}w`));
    }
    for (const j of s.projects.slice(0, 4)) {
      const fill = h('i');
      const k = h('span.k.num');
      const label = projectLabel(s, j);
      tray.append(h('div.tray-card', { onclick: () => ui.open('build'), title: 'Open Build' },
        h('div.t', null, h('span', null, icon('tray.project'), ` ${label}`), k),
        h('div.bar', null, fill)));
      trayBinds.push((st) => {
        const cur = st.projects.find((x) => x.id === j.id);
        if (!cur) return;
        const f = cur.pointsNeeded > 0 ? cur.progress / cur.pointsNeeded : 0;
        setWidth(fill, f);
        setText(k, `${Math.floor(Math.min(1, f) * 100)}%`);
      });
    }
    // Goals: the next couple of milestones, from state.goals in the data's order.
    if (s.goals) {
      const all = GOALS.filter((g) => s.goals[g.id]);
      const done = all.filter((g) => s.goals[g.id].done).length;
      const next = all.filter((g) => !s.goals[g.id].done).slice(0, 2);
      if (next.length) {
        tray.append(h('div.tray-card.goals', { title: 'Milestones. Each one pays a small reward. Click for the full list.', onclick: () => ui.openGoals?.() },
          h('div.t', null, h('span', null, icon('star', { size: 14 }), ' Goals'), h('span.k.num', { text: `${done}/${all.length}` })),
          ...next.map((g) => h('div.goal', null, h('span.gbox'), h('div', null, h('b', { text: g.name }), h('div.small.muted', { text: g.desc }))))));
      }
    }
    const effects = groupEffects(s);
    if (effects.length) {
      const list = h('div.effects');
      for (const e of effects) {
        const left = h('span.k.num');
        list.append(h('div.effect', { title: e.parts.map((m) => `${keyLabel(m.key)} ${fmtValue(m)}`).join(', ') },
          h('span.en', { text: e.label }),
          h('span.arrows', null, ...e.parts.map((m) => {
            return h(`span.arr.${isGood(m) ? 'good' : 'bad'}`, { title: `${keyLabel(m.key)} ${fmtValue(m)}` }, icon(m.value >= 0 ? 'arrow.up' : 'arrow.down', { size: 13 }));
          })),
          left));
        trayBinds.push((st) => setText(left, `${Math.max(0, e.untilWeek - st.week)}w`));
      }
      tray.append(h('div.tray-card.effects-card', { title: 'Temporary effects from your decisions' },
        h('div.t', null, h('span', null, icon('tray.effects'), ' Active effects')), list));
    }
    if (s.market?.trend && s.market.trend !== 'steady') {
      const k = h('span.k.num');
      tray.append(h('div.tray-card.trend', { title: 'Current market trend' },
        h('div.t', null, h('span', null, icon('tray.trend'), ` ${trendName(s.market.trend)}`), k)));
      trayBinds.push((st) => setText(k, `${st.market.trendWeeksLeft}w`));
    }
  }

  let last = {};
  let lastLogoColor = '';
  function update(s) {
    const d = dateOf(s.week);
    setText(logo, (s.companyName || '?').slice(0, 1).toUpperCase());
    const lc = s.founding?.logoColor ?? '';
    if (lc !== lastLogoColor) { lastLogoColor = lc; logo.style.background = lc; }
    setText(name, s.companyName || 'Your Lab');
    const tag = s.founding?.tagline ?? '';
    if (name.title !== tag) name.title = tag;
    setText(dateVal, `${d.year} · Q${d.quarter} · Wk ${d.week}`);

    setText(cashVal, fmtMoney(s.cash));
    const neg = s.cash < 0;
    toggleClass(cash, 'neg', neg);
    const now = performance.now();
    if (now - (last.netAt ?? 0) > 250) { last.net = weeklyNet(s); last.netAt = now; }
    const net = last.net;
    if (neg) {
      // Only losing weeks in the red count toward folding, so a profitable week is "holding".
      const left = Math.max(0, (B.runwayLoseWeeks ?? 8) - (s.lowCashWeeks ?? 0));
      setText(cashSub, net !== null && net > 0 ? `In the red, holding · ${left} wk left` : `Broke! ${left} losing wk left`);
      setClass(cashSub, net !== null && net > 0 ? 'sub warn' : 'sub bad');
    } else {
      if (net !== null && net < 0) {
        const wk = Math.floor(s.cash / -net);
        setText(cashSub, wk > 99 ? `${fmtMoney(net)}/wk` : `${wk} wk runway`);
        setClass(cashSub, wk <= 12 ? 'sub bad' : wk <= 30 ? 'sub warn' : 'sub');
      } else {
        setText(cashSub, net === null ? 'Runway: fine' : `${fmtMoney(net, { sign: true })}/wk`);
        setClass(cashSub, 'sub');
      }
    }

    const m = totalMrr(s);
    setText(mrrVal, fmtMoney(m));
    const hist = s.history ?? [];
    const past = hist.length > 4 ? hist[hist.length - 5].mrr : null;
    let dir = 'flat';
    if (past !== null && Number.isFinite(past)) {
      if (m > past * 1.005 + 1) dir = 'up';
      else if (m < past * 0.995 - 1) dir = 'down';
    }
    if (dir !== last.dir) {
      last.dir = dir;
      setClass(mrrTrend, `trend ${dir}`);
      mrrTrend.replaceChildren(icon(`arrow.${dir}`));
    }
    setText(mrrSub, `${fmtNum(totalCustomers(s))} customers`);

    const cap = capacityOf(s);
    setText(teamVal, `${s.staff.length}/${cap}`);
    let sad = 0;
    for (const p of s.staff) if (p.mood === 'burnout' || p.mood === 'coasting') sad++;
    // With placed furniture, too few desks outranks mood: nobody can be hired and people lack a seat.
    const short = s.office?.placed && cap < s.staff.length ? s.staff.length - cap : 0;
    const teamKey = short ? `d${short}` : sad ? `s${sad}` : 'ok';
    if (teamKey !== last.team) {
      last.team = teamKey;
      if (short) teamSub.replaceChildren(icon('seat', { size: 12 }), ` ${short} need${short === 1 ? 's' : ''} a desk`);
      else teamSub.replaceChildren(icon(sad ? 'mood.coasting' : 'mood.ok', { size: 12 }), sad ? ` ${sad} unhappy` : ' all good');
      toggleClass(teamSub, 'warn-t', sad > 0 || short > 0);
    }

    setWidth(mBrand.fill, s.brand / 100);
    setText(mBrand.v, Math.round(s.brand));
    setWidth(mIk.fill, s.institutionalKnowledge / 100);
    setText(mIk.v, Math.round(s.institutionalKnowledge));
    toggleClass(mIk.bar, 'low', s.institutionalKnowledge < 30);
    setWidth(mDebt.fill, s.comprehensionDebt / 100);
    setText(mDebt.v, Math.round(s.comprehensionDebt));
    toggleClass(mDebt.bar, 'hot', s.comprehensionDebt >= 60);

    const sp = controls.getSpeed?.() ?? 1;
    if (sp !== last.speed) {
      last.speed = sp;
      speedBtns.forEach((b, i) => toggleClass(b, 'on', SPEEDS[i].k === sp));
      pausedTag.style.display = sp === 0 ? '' : 'none';
    }
    // After an auto-pause on blur, the paused tag says why until the player resumes.
    const away = sp === 0 && !!controls.awayPaused;
    if (away !== last.away) {
      last.away = away;
      setText(pausedTag, away ? 'Paused while you were away' : 'Paused');
      pausedTag.title = away ? 'The game paused when the window lost focus. Press play or Space to resume. Change this in Settings.' : '';
    }
    const busy = sp > 0 && !!ui.isBusy?.();
    if (busy !== last.busy) { last.busy = busy; menuTag.style.display = busy ? 'inline' : 'none'; }

    const now2 = performance.now();
    if (now2 - (last.trayAt ?? 0) < 200) { for (const b of trayBinds) b(s); return; }
    last.trayAt = now2;
    const sig = `${Object.entries(s.goals ?? {}).map(([k, v]) => `${k}${v.done}`).join()}|${needsYou(s).map((n) => `${n.key}${n.text}`).join(',')}|${s.outage ? `${s.outage.productId}:${s.outage.unrecoverable}` : ''}|${s.projects.map((j) => j.id).join(',')}|${s.market?.trend}|${(s.modifiers ?? []).map((m) => m.id).join(',')}`;
    if (sig !== traySig) { traySig = sig; buildTray(s); }
    for (const b of trayBinds) b(s);
  }

  return { update, el: bar };
}

