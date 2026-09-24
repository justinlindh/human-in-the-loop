import { h, setText, setWidth, fmtMoney, toggleClass } from '../dom.js';
import { CHANNELS, CHANNEL, B, OFFICE_STAGES } from '../content.js';
import { liveView, meter } from '../widgets.js';

// A campaign target is a live product or a pre-launch 'new' project (hype banks until launch).
function targets(s) {
  return [
    ...s.products.filter((p) => !p.killed).map((p) => ({ key: `p:${p.id}`, kind: 'product', id: p.id, name: p.name, sub: `v${p.version} · score ${p.score.toFixed(1)}` })),
    ...s.projects.filter((j) => j.kind === 'new').map((j) => ({ key: `j:${j.id}`, kind: 'project', id: j.id, name: j.name, sub: 'Pre-launch' })),
  ];
}

function hypeOf(s, t) {
  if (!t) return 0;
  if (t.kind === 'product') return s.products.find((p) => p.id === t.id)?.hype ?? 0;
  return s.projects.find((j) => j.id === t.id)?.bankedHype ?? 0;
}

export function wrapperRisk(p) {
  const gap = B.wrapperGap ?? 2.5;
  const over = p.hype / 10 - p.score;
  if (over > gap) return 'hit';
  if (over > gap - 1.5) return 'near';
  return null;
}

export function marketingPanel(ctx) {
  let sel = null;

  const view = liveView(
    (s) => [targets(s).map((t) => t.key).join(), sel, s.officeStage, s.campaigns.map((c) => c.id).join(),
      s.staff.filter((p) => p.assignment.type === 'marketing').length, s.automation.marketing?.level].join('|'),
    (s, bind) => {
      const list = targets(s);
      if (!list.some((t) => t.key === sel)) sel = list[0]?.key ?? null;
      const target = list.find((t) => t.key === sel);

      // Company brand plus the selected target's hype
      const brand = meter({ label: 'Brand', cls: 'brand thick' });
      const hype = meter({ label: 'Hype', cls: 'thick', color: '#ffb020' });
      const risk = h('div.riskline');
      bind((st) => {
        brand.set(st.brand);
        hype.set(hypeOf(st, target));
        const p = target?.kind === 'product' ? st.products.find((x) => x.id === target.id) : null;
        const r = p ? wrapperRisk(p) : null;
        toggleClass(risk, 'show', !!r);
        toggleClass(risk, 'hit', r === 'hit');
        if (p && r) setText(risk, r === 'hit'
          ? `🌯 Hype (${Math.round(p.hype)}) is way past what ${p.name} delivers (score ${p.score.toFixed(1)}). Expect "just a wrapper" jokes and churn.`
          : `⚠️ Hype is getting ahead of ${p.name}'s quality. Improve it with an update before pushing harder.`);
      });

      const tgtRow = h('div.tiles.targets', null, ...list.map((t) => {
        const b = h('button.tile', { onclick: () => { sel = t.key; view.update(ctx.getState(), true); } },
          h('span.tn', { text: t.name }), h('span.ts', { text: t.sub }));
        toggleClass(b, 'on', t.key === sel);
        return b;
      }));

      const marketers = s.staff.filter((p) => p.assignment.type === 'marketing').length;
      const auto = s.automation.marketing?.level ?? 0;
      const stats = h('div.card.mkstats', null,
        h('div.mkmeters', null, brand.el, hype.el),
        risk,
        h('div.row.wrap.small', null,
          h('span', { class: marketers ? 'pill good' : 'pill warn', text: `📣 ${marketers} marketer${marketers === 1 ? '' : 's'} boosting campaigns` }),
          auto > 0 ? h('span.pill.warn', { text: `🤖 AI copy at ${Math.round(auto * 100)}%: more hype, less brand` }) : h('span.pill', { text: '✍️ Human-written copy' })));

      // Channel cards
      const chans = h('div.tiles.chans');
      for (const c of CHANNELS) {
        const locked = s.officeStage < (c.minStage ?? 0);
        const btn = h('button.btn.small.primary', {
          onclick: () => {
            if (!target) return;
            const res = ctx.act({ type: 'runCampaign', channel: c.id, productId: target.kind === 'product' ? target.id : null, projectId: target.kind === 'project' ? target.id : null });
            if (res.ok) ctx.sfx('coin');
          },
        }, 'Run');
        const why = h('span.why.small');
        bind((st) => {
          const r = locked ? `Needs ${OFFICE_STAGES[c.minStage]?.name ?? 'a bigger office'}` : !target ? 'Nothing to promote' : st.cash < c.cost ? 'Not enough cash' : '';
          btn.disabled = !!r;
          setText(why, r);
        });
        const card = h('div.card.chan', null,
          h('div.row', null, h('span.cico', { text: locked ? '🔒' : c.icon }), h('b', { text: c.name }), h('span.spacer'), h('b.num', { text: fmtMoney(c.cost) })),
          h('div.small.muted', { text: c.desc }),
          h('div.row.wrap.chanstats', null,
            h('span.pill', { text: `⏱ ${c.weeks}w` }),
            h('span.pill', { style: { background: '#ffecc2' }, text: `🔥 ${c.hype}/wk hype` }),
            c.brand > 0 ? h('span.pill', { style: { background: '#ece3ff' }, text: `💜 +${c.brand}/wk brand` }) : h('span.pill.faint', { text: 'no brand' })),
          h('div.row', null, why, h('span.spacer'), btn));
        toggleClass(card, 'locked', locked);
        chans.append(card);
      }

      // Active campaigns
      const active = h('div.grid.camps');
      for (const cp of s.campaigns) {
        const ch = CHANNEL[cp.channel];
        const tname = cp.productId ? s.products.find((p) => p.id === cp.productId)?.name : s.projects.find((j) => j.id === cp.projectId)?.name;
        const fill = h('i', { style: { background: '#ffb020' } });
        const left = h('span.num.small');
        bind((st) => {
          const c2 = st.campaigns.find((x) => x.id === cp.id);
          if (!c2) return;
          setWidth(fill, c2.weeksLeft / Math.max(1, ch?.weeks ?? c2.weeksLeft));
          setText(left, `${c2.weeksLeft}w left`);
        });
        active.append(h('div.camp', null, h('span', { text: ch?.icon ?? '📣' }), h('b', { text: ch?.name ?? cp.channel }),
          h('span.muted.small', { text: `for ${tname ?? '?'}` }), h('div.bar', null, fill), left));
      }

      return [
        list.length
          ? h('div.section', null, h('h3', null, 'Promote', h('span.aside', { text: 'pre-launch hype carries over at launch' })), tgtRow)
          : h('div.empty', { text: 'Nothing to promote yet. Start a product in Build: you can hype it before launch.' }),
        h('div.section', null, stats),
        h('div.section', null, h('h3', null, 'Channels', h('span.aside', { text: 'hype brings signups now, brand keeps customers forever' })), chans),
        h('div.section', null, h('h3', null, `Running campaigns (${s.campaigns.length})`),
          s.campaigns.length ? active : h('div.empty', { text: 'No campaigns running.' })),
      ];
    });

  return { el: view.el, update: (s, f) => view.update(s, f) };
}

