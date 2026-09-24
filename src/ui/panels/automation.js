import { h, setText, setWidth, fmtMoney, toggleClass, setClass } from '../dom.js';
import { FUNCTIONS, FUNCTION_INFO, MODEL, MODELS, ROLES, B, POLICIES, POLICY, policyUnlocked, policyLockText } from '../content.js';

// Policies that cannot be on together. Data can declare it with excludes: [ids]; the standup pair is known here too.
const EXCLUSIVE = [['daily_standups', 'async_standups']];
function exclusiveWith(p) {
  const ids = new Set([].concat(p.excludes ?? []));
  for (const group of EXCLUSIVE) if (group.includes(p.id)) group.filter((x) => x !== p.id).forEach((x) => ids.add(x));
  return [...ids];
}
import { liveView, tabs } from '../widgets.js';
import * as SIM from '../../sim/index.js';
import { automationWeeklyCost } from '../../sim/economy.js';
import { icon } from '../icons.js';

const LEVELS = [0, 0.25, 0.5, 0.75, 1];
const DEBT = { engineering: B.debtFromEngAuto ?? 1.1, qa: B.debtFromQaAuto ?? 0.35, ops: B.debtFromOpsAuto ?? 0.3 };

export function fnOversight(s, fn) {
  const a = s.automation[fn];
  if (!a) return 0;
  const g = MODEL[a.model]?.guardrails ?? 0.5;
  return a.level * (B.oversightHoursPerLevel?.[fn] ?? 10) * (1 - 0.6 * g);
}

// Oversight totals come from the sim when it exports them, so the UI and the sim agree.
export function oversightNeeded(s) {
  if (typeof SIM.oversightRequired === 'function') return SIM.oversightRequired(s);
  return FUNCTIONS.reduce((a, f) => a + fnOversight(s, f), 0);
}
export function oversightHave(s) {
  if (typeof SIM.oversightProvided === 'function') return SIM.oversightProvided(s);
  return s.ops?.oversightProvided ?? 0;
}

export function fnCost(s, fn) {
  const a = s.automation[fn];
  if (!a) return 0;
  return automationWeeklyCost(s, fn);
}

function outputText(s, fn) {
  const a = s.automation[fn];
  const lvl = a.level;
  if (lvl <= 0) return 'Off: humans do this';
  const cap = (s.models[a.model]?.capability ?? MODEL[a.model]?.capability ?? 70) / 100;
  switch (fn) {
    case 'engineering': return `+${(B.autoEngPoints * lvl * cap * (s.policies.pair ? B.pairAutoMult : 1)).toFixed(1)} work pts/wk`;
    case 'support': return `+${Math.round(lvl * B.autoSupportHours)} support hrs/wk`;
    case 'sales': return `+${(lvl * B.autoSalesBoost * 100).toFixed(1)}% deal closing`;
    case 'marketing': return `+${Math.round(lvl * B.autoMarketingHype * 100)}% hype, -${Math.round(lvl * B.autoMarketingBrandPenalty * 100)}% brand gain`;
    case 'qa': return 'Tests itself. Mostly.';
    case 'ops': return 'Runs the servers. Mostly.';
    default: return '';
  }
}

function affected(s, fn) {
  return s.staff.filter((p) => (ROLES[p.role]?.automatedBy?.[fn] ?? 0) > 0);
}

export function automationPanel(ctx) {
  let tab = 'dials';
  const t = tabs([{ id: 'dials', icon: 'menu.automation', label: 'Automation' }, { id: 'policies', icon: 'policy', label: 'Policies' }], tab, (id) => { tab = id; t.set(id); render(); });
  const host = h('div');

  const dials = liveView(
    (s) => [FUNCTIONS.map((f) => `${s.automation[f]?.level}${s.automation[f]?.model}`).join(), s.policies.pair ? 1 : 0,
      MODELS.map((m) => `${s.models[m.id]?.available}${s.models[m.id]?.deprecated}`).join()].join('|'),
    (s, bind) => {
      // Oversight summary
      const reqEl = h('b.num');
      const provEl = h('b.num');
      const ovFill = h('i');
      const ovNote = h('span.small');
      const costEl = h('b.num');
      const debtEl = h('b.num');
      bind((st) => {
        const req = oversightNeeded(st);
        const prov = oversightHave(st);
        setText(reqEl, `${Math.round(req)}h`);
        setText(provEl, `${Math.round(prov)}h`);
        const short = req > 0 && prov < req;
        setWidth(ovFill, req > 0 ? prov / req : 1);
        ovFill.style.background = short ? '#e5484d' : '#34c38f';
        setClass(provEl, short ? 'num bad-t' : 'num good-t');
        const overseers = st.staff.filter((p) => p.assignment.type === 'oversight').length;
        setText(ovNote, req <= 0 ? 'No agents running, nothing to oversee.'
          : short ? `Short ${Math.round(req - prov)}h. Unwatched agents go rogue more often, and nobody catches them. ${overseers} on duty.`
            : `Covered. ${overseers} overseer${overseers === 1 ? '' : 's'} on duty, ready to catch mistakes.`);
        setClass(ovNote, short ? 'small bad-t' : 'small muted');
        setText(costEl, `${fmtMoney(FUNCTIONS.reduce((a, f) => a + fnCost(st, f), 0))}/wk`);
        const debt = FUNCTIONS.reduce((a, f) => a + (DEBT[f] ?? 0) * (st.automation[f]?.level ?? 0), 0);
        setText(debtEl, debt > 0 ? `+${debt.toFixed(1)}/wk` : 'none');
      });
      const summary = h('div.card.autosum', null,
        h('div.ovhead', null, h('b', null, icon('oversight'), ' Oversight'), h('span', null, provEl, ' provided of ', reqEl, ' needed'), h('span.spacer'),
          h('button.btn.small', { onclick: () => ctx.open('staff') }, 'Assign overseers')),
        h('div.bar.thick', null, ovFill),
        ovNote,
        h('div.row.wrap.autometa', null,
          h('span.pill', null, icon('money'), ' Automation cost ', costEl),
          h('span.pill.warn', null, icon('debt'), ' Comprehension debt ', debtEl),
          s.policies.pair ? h('span.pill.good', null, icon('pair'), ' AI as Pair: less output, far less meaning drain') : null));

      const rows = h('div.autorows');
      for (const fn of FUNCTIONS) {
        const a = s.automation[fn] ?? { level: 0, model: 'chatgbt' };
        const seg = h('div.seg', null, ...LEVELS.map((lv) => {
          const b = h('button.segb', { onclick: () => { if (ctx.act({ type: 'setAutomation', fn, level: lv, model: a.model }).ok) ctx.sfx('click'); } }, `${lv * 100}%`);
          toggleClass(b, 'on', Math.abs(a.level - lv) < 0.01);
          toggleClass(b, 'hot', lv >= 0.75);
          return b;
        }));
        const modelSel = h('select', {
          onchange: (e) => { const m = e.target.value; e.target.blur(); ctx.act({ type: 'setAutomation', fn, level: a.level, model: m }); },
        }, ...MODELS.filter((m) => (s.models[m.id]?.available && !s.models[m.id]?.deprecated) || m.id === a.model)
          .map((m) => h('option', { value: m.id, text: `${m.name} · ${Math.round(m.guardrails * 100)}% guard` })));
        modelSel.value = a.model;

        const who = affected(s, fn);
        const meanEl = h('span.num');
        const whoEl = h('span.small');
        bind((st) => {
          const ppl = affected(st, fn);
          const avg = ppl.length ? ppl.reduce((x, p) => x + p.meaning, 0) / ppl.length : 0;
          setText(meanEl, ppl.length ? Math.round(avg) : '-');
          setClass(meanEl, `num ${avg < 35 && ppl.length ? 'bad-t' : avg < 55 && ppl.length ? 'warn-t' : ''}`);
          setText(whoEl, ppl.length ? `${ppl.length} affected, meaning ` : 'Nobody affected');
        });
        const ov = fnOversight(s, fn);
        const debt = (DEBT[fn] ?? 0) * a.level;
        rows.append(h('div.autorow', { class: a.level > 0 ? 'lit' : '' },
          h('div.fname', null, h('span.fico', null, icon(`fn.${fn}`)), h('b', { text: FUNCTION_INFO[fn].name })),
          seg,
          modelSel,
          h('div.readouts', null,
            h('span.ro.good-t', { text: outputText(s, fn) }),
            h('span.ro', { text: a.level > 0 ? `${fmtMoney(fnCost(s, fn))}/wk` : '' }),
            ov > 0 ? h('span.ro.warn-t', null, icon('oversight', { size: 12 }), ` ${ov.toFixed(1)}h oversight`) : null,
            debt > 0 ? h('span.ro.bad-t', null, icon('debt', { size: 12 }), ` +${debt.toFixed(2)} debt/wk`) : null),
          h('div.whoaff', { title: who.map((p) => p.name).join(', ') }, whoEl, meanEl)));
      }
      return [summary, rows,
        h('div.small.muted.autonote', { text: 'Automation is cheap output. It also drains the meaning of the people whose work it replaces, piles up code nobody understands, and needs humans watching it.' })];
    });

  const pol = liveView(
    (s) => [Object.keys(s.policies).sort().join(), POLICIES.map((p) => policyUnlocked(s, p) ? 1 : 0).join('')].join('|'),
    (s) => h('div.policies', null, ...POLICIES.map((p) => {
      const on = !!s.policies[p.id];
      const rivals = exclusiveWith(p).filter((id) => POLICY[id]);
      const rivalOn = rivals.find((id) => s.policies[id]);
      const unlocked = policyUnlocked(s, p);
      const sw = h('button.switch', {
        disabled: !on && !unlocked,
        title: !on && !unlocked ? policyLockText(p) : on ? 'Turn off' : 'Turn on',
        onclick: () => { if (ctx.act({ type: 'setPolicy', id: p.id, on: !on }).ok) ctx.sfx(on ? 'close' : 'confirm'); },
      }, h('span.knob'));
      toggleClass(sw, 'on', on);
      const card = h('div.card.policy', null,
        h('div.row', null, h('b.pname', { text: p.name }), h('span.spacer'), sw),
        h('div.small', { text: p.desc }),
        h('div.row.wrap', null,
          h('span.pill', null, icon('money'), p.weeklyCost ? ` ${fmtMoney(p.weeklyCost)}/wk` : ' Free'),
          !unlocked && !on ? h('span.pill.warn', null, icon('lock', { size: 12 }), ` ${policyLockText(p)}`) : on ? h('span.pill.good', null, icon('check'), ' Active') : null,
          rivals.length ? h('span', { class: rivalOn && !on ? 'pill warn' : 'pill', title: 'Only one of these can be on at a time' },
            icon('migrate', { size: 12 }), rivalOn && !on ? ` Turns off ${POLICY[rivalOn].name}` : ` Either this or ${rivals.map((id) => POLICY[id].name).join(', ')}`) : null));
      toggleClass(card, 'on', on);
      toggleClass(card, 'locked', !unlocked && !on);
      return card;
    })));

  function render() {
    const v = tab === 'dials' ? dials : pol;
    host.replaceChildren(v.el);
    v.update(ctx.getState(), true);
  }
  render();
  return {
    el: host,
    tabs: t.el,
    update(s) {
      t.setLabel('policies', `Policies (${Object.keys(s.policies).length} on)`);
      (tab === 'dials' ? dials : pol).update(s);
    },
  };
}
