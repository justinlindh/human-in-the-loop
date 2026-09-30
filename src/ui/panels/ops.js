import { h, setText, setWidth, fmtMoney, toggleClass, setClass, calendarDate } from '../dom.js';
import { B } from '../content.js';
import { incidentLabel } from '../v2content.js';
import { postureParts as simPostureParts } from '../../sim/incidents.js';
import { liveView, meter } from '../widgets.js';
import { icon } from '../icons.js';
import { NOC_MODES, modeBlurb, nocPlaced, nocStatus, nocEffect } from '../nocMode.js';
import { oversightNeeded, oversightHave } from './automation.js';

// A breakdown value with its sign; a value that rounds to zero carries none ("0.0", not "-0.0").
const signed = (v, sign, digits = 1) => { const t = Math.abs(v).toFixed(digits); return Number(t) === 0 ? t : `${sign}${t}`; };

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
      s.incidentLog[s.incidentLog.length - 1]?.week, s.security?.tooling, s.staff.filter((p) => p.role === 'security').length,
      nocPlaced(s) ? `noc${nocPlaced(s).level}` : '-', s.ops?.noc ?? '-'].join('|'),
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
            h('div.small', { text: incidentLabel(s, o.kind) })),
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
        setText(parts.staff, signed(pp.staff, '+'));
        setText(parts.audit, signed(pp.audit, '+'));
        setText(parts.tooling, signed(pp.tooling, '+', 0));
        setText(parts.bonus, signed(pp.bonus, '+'));
        setText(parts.debt, signed(pp.debt, '-'));
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
          h('div.neg', null, h('span', { text: 'Tech debt' }), parts.debt)),
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
      // Before automation unlocks there is nothing to oversee, so the Oversight row and its Automation
      // button stay out of sight; the card is just Coverage (Support and Upkeep matter from day one).
      // They appear, live, when the unlock arrives.
      const ovHead = h('div.row', null, icon('oversight'), h('b', { text: 'Oversight' }), h('span', null, ovProv, ' of ', ovReq), h('span.spacer'),
        h('button.btn.small', { onclick: () => ctx.open('automation') }, 'Automation'));
      const ovBar = h('div.bar.thick', null, ovFill);
      const ovNote = h('div.small.muted', { text: 'Coverage: how much of the needed work is actually getting done.' });
      const covHead = h('div.row', null, h('b', { text: 'Coverage' }), h('span.spacer'), h('span.small.muted', { text: 'How much of the needed work is getting done.' }));
      bind((st) => {
        const locked = !!st.unlocks && st.unlocks.automation == null;
        for (const el of [ovHead, ovBar, ovNote]) el.style.display = locked ? 'none' : '';
        covHead.style.display = locked ? '' : 'none';
      });
      const loadCard = h('div.card.load', null, ovHead, covHead, ovBar, ovNote, sup.el, mnt.el);

      // Incident log
      const st = s.stats ?? {};
      const log = [...(s.incidentLog ?? [])].reverse();
      const logEl = log.length ? h('table.inclog', null,
        h('thead', null, h('tr', null, ...['When', 'What', 'Product', 'Severity', ''].map((t) => h('th', { text: t })))),
        h('tbody', null, ...log.map((e) => {
          const d = calendarDate(s, e.week);
          const p = s.products.find((x) => x.id === e.productId);
          return h(`tr${e.caught ? '.caught' : ''}`, null,
            h('td.num', { text: `${d.year} W${d.week}` }),
            h('td', { text: incidentLabel(s, e.kind) }),
            h('td', { text: p?.name ?? '-' }),
            h('td', null, severityPips(e.severity)),
            h('td', null, e.caught ? h('span.pill.good', null, icon('caught', { size: 12 }), ' Caught') : h('span.pill.bad', { text: 'Hit' })));
        }))) : h('div.empty', { text: 'No incidents yet. Enjoy it.' });

      // NOC: who watches the screens. Present once a NOC is placed; every switch goes through the sim,
      // which says why when it refuses (before the bet, too soon).
      let nocCard = null;
      const noc = nocPlaced(s);
      if (noc) {
        const status = h('div.small.nocstatus'); const effect = h('div.small.muted');
        const btns = NOC_MODES.map((m) => h('button.segb', { type: 'button', dataset: { mode: m.v },
          onclick: () => { if (ctx.act({ type: 'setNocMode', mode: m.v }).ok) ctx.sfx?.('click'); } },
          h('b', { text: m.label }), h('span.nocblurb', { text: modeBlurb(m.v) })));
        bind((st) => {
          const mode = st.ops?.noc ?? null;
          btns.forEach((b, i) => toggleClass(b, 'on', mode === NOC_MODES[i].v));
          setText(status, nocStatus(st));
          const crew = st.staff.filter((p) => p.assignment?.type === 'security' && p.mood !== 'away').length;
          setText(effect, mode ? nocEffect(st, crew) : 'Pick who watches once the choice opens.');
        });
        nocCard = h('div.card.noc', null,
          h('div.row', null, icon('oversight', { size: 20 }), h('b', { text: `Network Operations Center` }), h('span.spacer'), h('span.small.muted', { text: `Level ${noc.level ?? 1}` })),
          h('div.seg.nocseg', { role: 'group', 'aria-label': 'Who watches the NOC' }, ...btns),
          status, effect);
      }

      return [
        outageCard,
        ...(nocCard ? [nocCard] : []),
        h('div.opsgrid', null, secCard, loadCard),
        h('div.section', null,
          h('h3', null, icon('incident'), ' Incident log',
            h('span.aside', { text: `${st.incidents ?? 0} incidents · ${st.caught ?? 0} caught · ${st.breaches ?? 0} breaches` })),
          logEl),
      ];
    });
  return { el: view.el, update: (s, f) => view.update(s, f) };
}
