import { h, setText, setWidth, fmtMoney, fmtNum, setClass, dateOf } from '../dom.js';
import { categoryName, angleName, modelName, CATEGORY, ANGLE } from '../content.js';
import { liveView, tabs, stars, confirmButton } from '../widgets.js';
import { icon } from '../icons.js';
import { lineChart, stackedChart, sample } from '../charts.js';
import { wrapperRisk } from './marketing.js';
import { retireOptions, retireBanner } from '../retire.js';
import { PURPOSE_INFO } from '../v2content.js';

const money = (v) => fmtMoney(v);
const num = (v) => fmtNum(v);

function chartCard(title, legend, canvas, extra) {
  return h('div.card.chartcard', null,
    h('div.row', null, h('b', { text: title }), h('span.spacer'),
      ...legend.map((l) => h('span.legend', null, h('i', { style: { background: l.color } }), l.label))),
    canvas, extra ?? null);
}

function scoreClass(v) {
  return v >= 8 ? 'great' : v >= 6 ? 'ok' : v >= 4 ? 'meh' : 'bad';
}

export function reportsPanel(ctx) {
  let tab = 'overview';
  const t = tabs([
    { id: 'overview', icon: 'chart', label: 'Money' },
    { id: 'people', icon: 'team', label: 'People' },
    { id: 'products', icon: 'product', label: 'Products' },
    { id: 'combos', icon: 'star', label: 'Combos' },
  ], tab, (id) => { tab = id; t.set(id); render(); });
  const host = h('div');
  const bannerHost = h('div');
  const root = h('div', null, bannerHost, host);
  let retireSig = null;
  const syncBanner = (s) => {
    const o = retireOptions(s);
    const r = s.rival;
    const sig = `${o.ipo?.ok}|${o.acquired?.ok}|${o.acquired?.by}|${s.flags?.anniversaryScore}|${r ? `${r.status}${Math.round((r.strength ?? 0) / 5)}` : ''}|${s.purpose ? `${s.purpose.mission}${Math.round(s.purpose.value ?? 0)}${s.purpose.tests?.length}` : ''}`;
    if (sig === retireSig) return;
    retireSig = sig;
    const anniv = s.flags?.anniversaryScore;
    bannerHost.replaceChildren(...[
      Number.isFinite(anniv) ? h('div.card.annivcard', null, icon('award', { size: 22 }), h('b', { text: 'Anniversary score' }), h('b.num.big', { text: fmtNum(anniv) }), h('span.small.muted', { text: 'Locked in at 20 years. You kept going.' })) : null,
      purposeCard(s),
      rivalCard(s),
      retireBanner(ctx, s)].filter(Boolean));
  };

  const chartW = () => {
    const body = host.closest('.panel-body');
    const w = (body?.clientWidth ?? 900) - 32;
    return Math.max(260, Math.floor((w - 16) / 2) - 24);
  };
  const chartH = () => Math.round(chartW() * 0.36);

  const overview = liveView(
    (s) => `${s.history.length}|${s.history[s.history.length - 1]?.week}`,
    (s) => {
      const hist = sample(s.history);
      const weeks = hist.map((x) => x.week);
      const W = chartW(), H = chartH();
      const last = s.history[s.history.length - 1] ?? {};
      return h('div.charts', null,
        chartCard('MRR', [{ label: money(last.mrr ?? 0), color: '#34c38f' }],
          lineChart({ weeks, w: W, h: H, fmt: money, series: [{ color: '#34c38f', values: hist.map((x) => x.mrr) }] })),
        chartCard('Customers', [{ label: num(last.customers ?? 0), color: '#4f8cff' }],
          lineChart({ weeks, w: W, h: H, fmt: num, series: [{ color: '#4f8cff', values: hist.map((x) => x.customers) }] })),
        chartCard('Cash', [{ label: money(last.cash ?? 0), color: '#ffb020' }],
          lineChart({ weeks, w: W, h: H, fmt: money, series: [{ color: '#e8930c', values: hist.map((x) => x.cash) }] })),
        chartCard('Company health', [{ label: 'Brand', color: '#9b6bff' }, { label: 'Know-how', color: '#3fb6b0' }, { label: 'Debt', color: '#e5484d' }],
          lineChart({ weeks, w: W, h: H, max: 100, fill: false, series: [
            { color: '#9b6bff', values: hist.map((x) => x.brand) },
            { color: '#3fb6b0', values: hist.map((x) => x.ik) },
            { color: '#e5484d', values: hist.map((x) => x.debt) },
          ] })));
    });

  const people = liveView(
    (s) => `${s.history.length}|${s.history[s.history.length - 1]?.week}|${s.staff.length}`,
    (s) => {
      const hist = sample(s.history);
      const weeks = hist.map((x) => x.week);
      const W = chartW(), H = chartH();
      const st = s.stats ?? {};
      const last = s.history[s.history.length - 1] ?? {};
      const juniors = s.staff.filter((p) => p.seniority === 'junior').length;
      const seniors = s.staff.filter((p) => p.seniority === 'senior').length;
      const warn = juniors === 0 && s.staff.length > 3
        ? h('div.riskline.show', null, icon('warn'), ' No juniors on staff. Nobody is learning the job, so nobody will replace your seniors.')
        : null;
      return [
        warn,
        h('div.charts', null,
          chartCard('Staff pipeline', [{ label: 'Juniors', color: '#8ec5ff' }, { label: 'Mids', color: '#b89bff' }, { label: 'Seniors', color: '#ffc861' }],
            stackedChart({ weeks, w: W, h: H, series: [
              { color: '#8ec5ff', values: hist.map((x) => x.juniors) },
              { color: '#b89bff', values: hist.map((x) => x.mids) },
              { color: '#ffc861', values: hist.map((x) => x.seniors) },
            ] })),
          chartCard('Average meaning', [{ label: `${Math.round(last.avgMeaning ?? 0)}`, color: '#34c38f' }],
            lineChart({ weeks, w: W, h: H, max: 100, series: [{ color: '#34c38f', values: hist.map((x) => x.avgMeaning) }] })),
          chartCard('Incidents (total)', [{ label: `${st.incidents ?? 0}`, color: '#e5484d' }],
            lineChart({ weeks, w: W, h: H, series: [{ color: '#e5484d', values: hist.map((x) => x.incidents) }] })),
          h('div.card.chartcard.statgrid', null,
            h('b', { text: 'Career so far' }),
            ...[
              ['Hires', st.hires], ['Juniors hired', st.juniorsHired], ['Resignations', st.resignations],
              ['Launches', st.launches], ['Awards', st.awards], ['Incidents caught', `${st.caught ?? 0}/${st.incidents ?? 0}`],
              ['Breaches', st.breaches], ['Peak MRR', money(st.peakMrr ?? 0)], ['Seniors now', seniors],
            ].map(([k, v]) => h('div.kv', null, h('span', { text: k }), h('b.num', { text: String(v ?? 0) }))))),
      ];
    });

  const products = liveView(
    (s) => [s.products.map((p) => `${p.id}${p.killed}${p.version}${p.ownerId}${p.migrationDueWeek}`).join(), s.staff.map((p) => p.id).join(),
      s.projects.filter((j) => j.kind === 'update').map((j) => j.productId).join()].join('|'),
    (s, bind) => {
      const live = s.products.filter((p) => !p.killed);
      const dead = s.products.filter((p) => p.killed);
      if (!live.length && !dead.length) return h('div.empty', { text: 'No products yet. Ship something from Build!' });
      const updating = new Set(s.projects.filter((j) => j.kind === 'update').map((j) => j.productId));
      const cards = live.map((p) => {
        const cust = h('b.num'); const mrr = h('b.num');
        const healthF = h('i'); const novF = h('i', { style: { background: '#ffb020' } }); const hypeF = h('i', { style: { background: '#ff7eb6' } });
        const healthV = h('span.num.small'); const novV = h('span.num.small'); const hypeV = h('span.num.small');
        const up = h('span.num.small');
        bind((st) => {
          const cur = st.products.find((x) => x.id === p.id);
          if (!cur) return;
          setText(cust, num(cur.customers)); setText(mrr, money(cur.mrr));
          setWidth(healthF, cur.health / 100); setText(healthV, Math.round(cur.health));
          const hc = cur.health < 40 ? '#e5484d' : cur.health < 70 ? '#e8930c' : '#34c38f';
          if (healthF.style.background !== hc) healthF.style.background = hc;
          setWidth(novF, cur.novelty / 10); setText(novV, cur.novelty.toFixed(1));
          setWidth(hypeF, cur.hype / 100); setText(hypeV, Math.round(cur.hype));
          setText(up, `${(cur.uptime * 100).toFixed(1)}% up`);
          setClass(up, `num small ${cur.uptime < 0.95 ? 'bad-t' : 'muted'}`);
        });
        const risk = wrapperRisk(p);
        const tags = h('div.row.wrap.ptags', null,
          p.wrapperHit || risk === 'hit' ? h('span.pill.bad', null, icon('wrapper', { size: 12 }), ' "Just a wrapper"') : null,
          p.copied ? h('span.pill.warn', { title: 'An incumbent copied your features; freshness halved' }, 'Copied by incumbent') : null,
          p.migrationDueWeek != null ? h('span.pill.warn', null, icon('migrate', { size: 12 }), ` Migrate by ${p.migrationDueWeek <= s.week ? 'NOW' : `${p.migrationDueWeek - s.week}w`}`) : null,
          s.outage?.productId === p.id ? h('span.pill.bad', null, icon('tray.outage', { size: 12 }), ' DOWN') : null,
        );
        const ownerSel = h('select.ownersel', {
          onchange: (e) => { const v = e.target.value; e.target.blur(); ctx.act({ type: 'setOwner', productId: p.id, staffId: v || null }); },
        }, h('option', { value: '', text: 'No owner' }), ...s.staff.map((x) => h('option', { value: x.id, text: x.name })));
        ownerSel.value = p.ownerId ?? '';
        return h('div.card.prodcard', null,
          h('div.row', null,
            h(`div.score.${scoreClass(p.score)}`, { title: 'Review average' }, p.score.toFixed(1)),
            h('div', { style: { minWidth: 0 } }, h('b.pname', { text: `${p.name} v${p.version}` }),
              h('div.small.muted', { text: `${categoryName(p.category)} × ${angleName(p.angle)} · ${modelName(p.model)}` }))),
          h('div.reviews', null, ...(p.reviews ?? []).slice(0, 4).map((r) => h('div.review', { title: r.quote },
            h('span.outlet', { text: r.outlet }), h(`b.num.${scoreClass(r.score)}`, { text: String(r.score) }), h('span.quote', { text: `"${r.quote}"` })))),
          h('div.pnums', null,
            h('div', null, h('span.small.muted', { text: 'Customers' }), cust),
            h('div', null, h('span.small.muted', { text: 'MRR' }), mrr),
            h('div', null, h('span.small.muted', { text: 'Uptime' }), up)),
          h('div.pbars', null,
            h('div.pstat', null, h('span', { text: 'Health' }), h('div.bar', null, healthF), healthV),
            h('div.pstat', null, h('span.skname', null, icon('stat.novelty', { size: 13 }), ' Freshness'), h('div.bar', null, novF), novV),
            h('div.pstat', null, h('span', { text: 'Hype' }), h('div.bar', null, hypeF), hypeV)),
          tags,
          h('div.row.pacts', null,
            h('span.small.muted', { text: 'Owner' }), ownerSel, h('span.spacer'),
            updating.has(p.id) ? h('span.pill.good', { text: 'Updating...' })
              : h('button.btn.small.blue', { onclick: () => { if (ctx.act({ type: 'startProject', kind: 'update', productId: p.id }).ok) ctx.sfx('confirm'); } }, icon('update', { size: 12 }), ' Update'),
            confirmButton('Kill', 'Really kill?', 'small.danger', () => ctx.act({ type: 'killProduct', productId: p.id }))));
      });
      return [
        h('div.prodgrid', null, ...cards),
        dead.length ? h('div.small.muted', { style: { marginTop: '0.8em' }, text: `Sunset: ${dead.map((p) => p.name).join(', ')}` }) : null,
      ];
    });

  const combos = liveView(
    (s) => Object.keys(s.discoveredCombos ?? {}).join(),
    (s) => {
      const rows = Object.entries(s.discoveredCombos ?? {}).map(([k, fit]) => {
        const [cat, ang] = k.split(':');
        return { cat, ang, fit };
      }).sort((a, b) => b.fit - a.fit);
      if (!rows.length) return h('div.empty', { text: 'Launch products to learn which category and AI angle combos customers love.' });
      return h('table.combos', null,
        h('thead', null, h('tr', null, ...['Category', 'AI angle', 'Fit', ''].map((x) => h('th', { text: x })))),
        h('tbody', null, ...rows.map((r) => h('tr', null,
          h('td', null, icon(`cat.${r.cat}`), ` ${CATEGORY[r.cat]?.name ?? r.cat}`),
          h('td', { text: ANGLE[r.ang]?.name ?? r.ang }),
          h('td', null, stars(r.fit)),
          h('td.num', { text: `${r.fit.toFixed(2)}x` })))));
    });

  const views = { overview, people, products, combos };
  function render() {
    host.replaceChildren(views[tab].el);
    views[tab].update(ctx.getState(), true);
  }
  // Charts need the panel's width, so the first render waits until the panel is in the DOM.
  requestAnimationFrame(() => render());
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); };
  addEventListener('resize', onResize);
  syncBanner(ctx.getState());
  return {
    el: root,
    tabs: t.el,
    destroy() { removeEventListener('resize', onResize); clearTimeout(resizeTimer); },
    update(s) {
      t.setLabel('products', `Products (${s.products.filter((p) => !p.killed).length})`);
      syncBanner(s);
      if (host.firstChild) views[tab].update(s);
    },
  };
}


const RIVAL_STATUS = { rising: ['Rising', 'warn'], stalled: ['Stalled', ''], acquired: ['Acquired', 'good'], dead: ['Shut down', 'good'], merged: ['Merged', ''] };

// The rival company: who, where, how strong, and how it ended.
function rivalCard(s) {
  const r = s.rival;
  if (!r) return null;
  const [label, tone] = RIVAL_STATUS[r.status] ?? [r.status, ''];
  const fill = h('i', { style: { width: `${Math.max(0, Math.min(100, r.strength ?? 0))}%`, background: 'var(--ink-soft)' } });
  return h('div.card.rivalcard', null,
    h('span.rlogo', { style: { background: r.logoColor ?? '' }, text: (r.name || '?').slice(0, 1).toUpperCase() }),
    h('div', { style: { minWidth: 0, flex: 1 } },
      h('div.row', null, h('b', { text: r.name }), h('span.small.muted', { text: ` Your rival, run by ${r.founderName ?? 'someone you used to know'}` })),
      h('div.row', null, h('span.small', { text: `${categoryName(r.categoryId)} · strength` }), h('div.bar', { style: { flex: 1, maxWidth: '12em' } }, fill), h('b.num.small', { text: String(Math.round(r.strength ?? 0)) }))),
    h(`span.pill${tone ? `.${tone}` : ''}`, { text: label }));
}

const PURPOSE_AFFECTS = 'Keeps meaning steady when the work changes. Choices that go against the mission test it; passing a test strengthens it.';

// The company's mission and how well it is holding up.
function purposeCard(s) {
  const pu = s.purpose;
  if (!pu) return null;
  const v = Math.max(0, Math.min(100, pu.value ?? 0));
  const tests = (pu.tests ?? []).slice(-3).reverse();
  return h('div.card.purposecard', null,
    h('div.row', null, icon('idea', { size: 20 }), h('b', { text: 'Purpose' }), h('span.small.muted', { text: pu.mission ? ` "${pu.mission}"` : ' No mission yet' }), h('span.spacer'),
      h('div.bar', { style: { width: '10em' } }, h('i', { style: { width: `${v}%`, background: 'var(--purple)' } })), h('b.num', { text: String(Math.round(v)) })),
    h('div.small.muted', { text: PURPOSE_INFO?.affects ?? PURPOSE_AFFECTS }),
    tests.length ? h('div.ptests', null, ...tests.map((t) => h('div.ptest', null,
      h(`span.num.${(t.delta ?? 0) >= 0 ? 'good-t' : 'bad-t'}`, { text: `${(t.delta ?? 0) >= 0 ? '+' : ''}${Math.round(t.delta ?? 0)}` }),
      h('span', { text: t.text ?? '' }), h('span.small.muted', { text: Number.isFinite(t.week) ? `${dateOf(t.week).year} Q${dateOf(t.week).quarter}` : '' })))) : null);
}
