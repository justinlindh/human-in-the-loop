import { h, setText, setWidth, fmtMoney, toggleClass, setClass, dateOf } from '../dom.js';
import { B, INCIDENT_LABEL } from '../content.js';
import { postureParts as simPostureParts } from '../../sim/incidents.js';
import { liveView, meter } from '../widgets.js';
import { icon } from '../icons.js';
import { oversightNeeded, oversightHave } from './automation.js';

// The sim's own breakdown, so the rows add up to the posture bar. Debt is a positive penalty.
export function postureParts(s) {
  // A placement-era state has no items list; older sim helpers still iterate it.
  const p = simPostureParts(s.items ? s : { ...s, items: [] });
  const people = p.people ?? s.staff.filter((x) => x.assignment?.type === 'security' && x.mood !== 'away').length;
  return { ...p, people };
}

function severityPips(n) {
  return h('span.pips', { title: `SEV${6 - n}: SEV1 is the worst` }, h('b.sev.num', { text: `SEV${6 - n}` }), ...[1, 2, 3, 4, 5].map((i) => h(`i${i <= n ? '.on' : ''}`)));
}

export function opsPanel(ctx) {
  const view = liveView(
    (s) => [s.outage ? `${s.outage.productId}${s.outage.unrecoverable}${s.outage.severity}` : '-', s.incidentLog.length,
      s.incidentLog[s.incidentLog.length - 1]?.week, s.security?.tooling, s.staff.filter((p) => p.role === 'security').length].join('|'),
    (s, bind) => {
      // Outage
      let outageCard;
      if (s.outage) {
        const o = s.outage;
        const p = s.products.find((x) => x.id === o.productId);
        const wk = h('b.num');
        bind((st) => st.outage && setText(wk, `${st.outage.weeks}w down`));
        outageCard = h('div.card.outage', null,
          h('div.row', null, icon('tray.outage', { size: 24 }), h('div', null,
            h('b.otitle', { text: `${p?.name ?? 'A product'} is down` }),
            h('div.small', { text: INCIDENT_LABEL[o.kind] ?? o.kind })),
          h('span.spacer'), severityPips(o.severity), wk),
          o.unrecoverable
            ? h('div.nobody', { text: 'Nobody here can debug this. The people who understood it are gone, or were never here.' })
            : h('div.small', { text: 'Your engineers are on it. Knowledgeable engineers fix outages faster.' }),
          h('div.row', null,
            h('span.small.muted', { text: 'Consultants fix any outage right away, at a price.' }), h('span.spacer'),
            h('button.btn.danger', { onclick: () => { if (ctx.act({ type: 'callConsultants' }).ok) ctx.sfx('coin'); } },
              icon('consultants'), ` Call consultants ${fmtMoney(B.consultantCost ?? 45000)}`)));
      } else {
        outageCard = h('div.card.allgood', null, icon('check', { size: 20 }), h('b', { text: ' All systems operational' }));
      }

      // Security posture
      const post = meter({ label: 'Posture', cls: 'thick', color: '#34c38f' });
      const parts = {
        staff: h('b.num'), bonus: h('b.num'), audit: h('b.num'), tooling: h('b.num'), debt: h('b.num'),
      };
      const auditLeft = h('span.small.muted');
      bind((st) => {
        const pp = postureParts(st);
        post.set(pp.total, pp.total < 30 ? '#e5484d' : pp.total < 60 ? '#e8930c' : '#34c38f');
        setText(parts.staff, `+${pp.staff.toFixed(1)}`);
        setText(parts.audit, `+${pp.audit.toFixed(1)}`);
        setText(parts.tooling, `+${pp.tooling.toFixed(0)}`);
        setText(parts.bonus, `+${pp.bonus.toFixed(1)}`);
        setText(parts.debt, `-${pp.debt.toFixed(1)}`);
        setText(auditLeft, pp.audit > 0.5 ? 'Audit boost fades a little every week.' : 'No recent audit.');
      });
      const pp0 = postureParts(s);
      const tooling = !!s.security?.tooling;
      const secCard = h('div.card.sec', null,
        h('div.row', null, icon('security', { size: 20 }), h('b', { text: 'Security posture' }), h('span.spacer'),
          h('span.small.muted', { text: 'Attacks land when a roll beats your posture.' })),
        post.el,
        h('div.breakdown', null,
          h('div', null, h('span', { text: `Security staff (${pp0.people})` }), parts.staff),
          h('div', null, h('span', { text: 'Tools and specialists' }), parts.bonus),
          h('div', null, h('span', { text: 'Audit' }), parts.audit),
          h('div', null, h('span', { text: 'Tooling' }), parts.tooling),
          h('div.neg', null, h('span', { text: 'Comprehension debt' }), parts.debt)),
        h('div.row.wrap', null,
          h('button.btn.blue', { onclick: () => { if (ctx.act({ type: 'buyAudit' }).ok) ctx.sfx('coin'); } }, icon('audit'), ` Buy audit ${fmtMoney(B.auditCost ?? 15000)}`),
          auditLeft),
        h('div.row', null,
          h('span.small', { text: `Security tooling ${fmtMoney(B.toolingWeekly ?? 900)}/wk: scanners and alerts that stop the lazy attacks.` }), h('span.spacer'),
          (() => {
            const sw = h('button.switch', { title: tooling ? 'Turn off' : 'Turn on', onclick: () => ctx.act({ type: 'setTooling', on: !tooling }) }, h('span.knob'));
            toggleClass(sw, 'on', tooling);
            return sw;
          })()));

      // Oversight and load
      const ovReq = h('b.num'); const ovProv = h('b.num'); const ovFill = h('i');
      const sup = meter({ label: 'Support', cls: '', color: '#34c38f', fmt: (v) => `${Math.round(v)}%` });
      const mnt = meter({ label: 'Upkeep', cls: '', color: '#4f8cff', fmt: (v) => `${Math.round(v)}%` });
      bind((st) => {
        const req = oversightNeeded(st);
        const prov = oversightHave(st);
        setText(ovReq, `${Math.round(req)}h`); setText(ovProv, `${Math.round(prov)}h`);
        setWidth(ovFill, req > 0 ? prov / req : 1);
        const short = req > 0 && prov < req;
        ovFill.style.background = short ? '#e5484d' : '#34c38f';
        setClass(ovProv, short ? 'num bad-t' : 'num good-t');
        const sc = 100 * (1 - (st.ops?.supportShortfall ?? 0));
        const mc = 100 * (1 - (st.ops?.maintenanceShortfall ?? 0));
        sup.set(sc, sc < 70 ? '#e5484d' : '#34c38f');
        mnt.set(mc, mc < 70 ? '#e5484d' : '#4f8cff');
      });
      const loadCard = h('div.card.load', null,
        h('div.row', null, icon('oversight'), h('b', { text: 'Oversight' }), h('span', null, ovProv, ' of ', ovReq), h('span.spacer'),
          h('button.btn.small', { onclick: () => ctx.open('automation') }, 'Automation')),
        h('div.bar.thick', null, ovFill),
        h('div.small.muted', { text: 'Coverage: how much of the needed work is actually getting done.' }),
        sup.el, mnt.el);

      // Incident log
      const st = s.stats ?? {};
      const log = [...(s.incidentLog ?? [])].reverse();
      const logEl = log.length ? h('table.inclog', null,
        h('thead', null, h('tr', null, ...['When', 'What', 'Product', 'Severity', ''].map((t) => h('th', { text: t })))),
        h('tbody', null, ...log.map((e) => {
          const d = dateOf(e.week);
          const p = s.products.find((x) => x.id === e.productId);
          return h(`tr${e.caught ? '.caught' : ''}`, null,
            h('td.num', { text: `${d.year} W${d.week}` }),
            h('td', { text: INCIDENT_LABEL[e.kind] ?? e.kind }),
            h('td', { text: p?.name ?? '-' }),
            h('td', null, severityPips(e.severity)),
            h('td', null, e.caught ? h('span.pill.good', null, icon('caught', { size: 12 }), ' Caught') : h('span.pill.bad', { text: 'Hit' })));
        }))) : h('div.empty', { text: 'No incidents yet. Enjoy it.' });

      return [
        outageCard,
        h('div.opsgrid', null, secCard, loadCard),
        h('div.section', null,
          h('h3', null, icon('incident'), ' Incident log',
            h('span.aside', { text: `${st.incidents ?? 0} incidents · ${st.caught ?? 0} caught · ${st.breaches ?? 0} breaches` })),
          logEl),
      ];
    });
  return { el: view.el, update: (s, f) => view.update(s, f) };
}
