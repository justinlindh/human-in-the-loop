import { h, setText, setWidth, toggleClass, fmtMoney, fmtNum, dateOf, clear } from './dom.js';
import { B, trendName, INCIDENT_LABEL, capacityOf, MOOD_INFO } from './content.js';

export const liveProducts = (s) => s.products.filter((p) => !p.killed);
export const totalMrr = (s) => liveProducts(s).reduce((a, p) => a + (Number.isFinite(p.mrr) ? p.mrr : 0), 0);
export const totalCustomers = (s) => liveProducts(s).reduce((a, p) => a + (Number.isFinite(p.customers) ? p.customers : 0), 0);

// Average weekly cash change over the last few recorded weeks.
export function weeklyNet(s) {
  const hist = s.history ?? [];
  if (hist.length < 2) return null;
  const k = Math.min(4, hist.length - 1);
  const past = hist[hist.length - 1 - k];
  const net = (s.cash - past.cash) / Math.max(1, s.week - past.week);
  return Number.isFinite(net) ? net : null;
}

const SPEEDS = [
  { k: 0, ico: '❚❚', title: 'Pause (Space)' },
  { k: 1, ico: '▶', title: 'Normal speed (1)' },
  { k: 2, ico: '▶▶', title: 'Fast (2)' },
  { k: 4, ico: '▶▶▶', title: 'Fastest (3)' },
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
  const speedBtns = SPEEDS.map((sp) => h('button.btn.small', {
    title: sp.title,
    onclick: () => ui.setSpeed(sp.k),
  }, h('span.ico', { text: sp.ico })));
  const speed = h('div.chip.speed', null, pausedTag, ...speedBtns);

  const bar = h('div.topbar', null, company, cash, mrr, team, meters, h('div.spacer'), speed);

  const tray = h('div.tray');
  root.append(bar, tray);

  let traySig = '';
  let trayBinds = [];

  function buildTray(s) {
    clear(tray);
    trayBinds = [];
    if (s.outage) {
      const o = s.outage;
      const p = s.products.find((x) => x.id === o.productId);
      const k = h('span.k');
      tray.append(h('div.tray-card.alert', { onclick: () => ui.open('ops') },
        h('div.t', null, h('span', { text: `🚨 ${p?.name ?? 'Product'} is down` }), k),
        h('div', { style: { fontSize: '0.82em', marginTop: '0.15em' }, text: o.unrecoverable ? 'Nobody here can debug this.' : (INCIDENT_LABEL[o.kind] ?? 'Outage') })));
      trayBinds.push((st) => st.outage && setText(k, `SEV${st.outage.severity} · ${st.outage.weeks}w`));
    }
    for (const j of s.projects.slice(0, 4)) {
      const fill = h('i');
      const k = h('span.k.num');
      const label = j.kind === 'new' ? j.name : `${j.kind === 'update' ? 'Update' : j.kind === 'migration' ? 'Migrate' : j.kind === 'refactor' ? 'Refactor' : 'Craft'}${j.name ? `: ${j.name}` : ''}`;
      tray.append(h('div.tray-card', { onclick: () => ui.open('build'), title: 'Open Build' },
        h('div.t', null, h('span', { text: `🔨 ${label}` }), k),
        h('div.bar', null, fill)));
      trayBinds.push((st) => {
        const cur = st.projects.find((x) => x.id === j.id);
        if (!cur) return;
        const f = cur.pointsNeeded > 0 ? cur.progress / cur.pointsNeeded : 0;
        setWidth(fill, f);
        setText(k, `${Math.floor(Math.min(1, f) * 100)}%`);
      });
    }
    if (s.market?.trend && s.market.trend !== 'steady') {
      const k = h('span.k.num');
      tray.append(h('div.tray-card.trend', { title: 'Current market trend' },
        h('div.t', null, h('span', { text: `📡 ${trendName(s.market.trend)}` }), k)));
      trayBinds.push((st) => setText(k, `${st.market.trendWeeksLeft}w`));
    }
  }

  let last = {};
  function update(s) {
    const d = dateOf(s.week);
    setText(logo, (s.companyName || '?').slice(0, 1).toUpperCase());
    setText(name, s.companyName || 'Your Lab');
    setText(dateVal, `${d.year} · Q${d.quarter} · Wk ${d.week}`);

    setText(cashVal, fmtMoney(s.cash));
    const neg = s.cash < 0;
    toggleClass(cash, 'neg', neg);
    if (neg) {
      const left = Math.max(0, (B.runwayLoseWeeks ?? 8) - (s.lowCashWeeks ?? 0));
      setText(cashSub, `Broke! ${left} wk to fold`);
      cashSub.className = 'sub bad';
    } else {
      const net = weeklyNet(s);
      if (net !== null && net < 0) {
        const wk = Math.floor(s.cash / -net);
        setText(cashSub, wk > 99 ? `${fmtMoney(net)}/wk` : `${wk} wk runway`);
        cashSub.className = wk <= 12 ? 'sub bad' : wk <= 30 ? 'sub warn' : 'sub';
      } else {
        setText(cashSub, net === null ? 'Runway: fine' : `${fmtMoney(net, { sign: true })}/wk`);
        cashSub.className = 'sub';
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
      mrrTrend.className = `trend ${dir}`;
      setText(mrrTrend, dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•');
    }
    setText(mrrSub, `${fmtNum(totalCustomers(s))} customers`);

    const cap = capacityOf(s);
    setText(teamVal, `${s.staff.length}/${cap}`);
    let sad = 0;
    for (const p of s.staff) if (p.mood === 'burnout' || p.mood === 'coasting') sad++;
    setText(teamSub, sad ? `${MOOD_INFO.coasting.icon} ${sad} unhappy` : `${MOOD_INFO.ok.icon} all good`);
    toggleClass(teamSub, 'warn-t', sad > 0);

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

    const sig = `${s.outage ? `${s.outage.productId}:${s.outage.unrecoverable}` : ''}|${s.projects.map((j) => j.id).join(',')}|${s.market?.trend}`;
    if (sig !== traySig) { traySig = sig; buildTray(s); }
    for (const b of trayBinds) b(s);
  }

  return { update, el: bar };
}

