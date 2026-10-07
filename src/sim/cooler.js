import { B } from './balance.js';
import { footprintCells, seatTile, desksOf } from './office.js';
import { isIn } from './props.js';
import { shortText } from './util.js';

const within = (cells, [x, y], radius) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= radius);
const topOf = (members) => Math.max(...members.map((p) => p.knowledge));

// The water cooler's knowledgeShare (#1640), run by the knowledge system each week. Each placed cooler's crowd
// is the staff in the office whose seats are within B.cooler.radius of it; someone in reach of two coolers
// stays only in the crowd with the higher top. In a crowd of two or more, each member closes B.cooler.share of
// the gap to the crowd's most knowledgeable member, at most B.cooler.maxGain. Not an item bonus, so
// B.itemBonusCap does not apply.
export function coolerShare(ctx) {
  const { state } = ctx;
  const coolers = state.office.placed.filter((p) => p.itemId === 'water_cooler');
  if (!coolers.length) return;
  const desks = new Map(desksOf(state.office.placed).map((d) => [d.id, d]));
  const here = state.staff.filter((p) => isIn(p) && desks.has(p.deskId));
  const { radius, share, maxGain, notifyGain, notifyWeeks } = B.cooler;
  const reach = coolers.map((c) => {
    const cells = footprintCells(c.itemId, c.x, c.y, c.rot);
    return { cooler: c, members: here.filter((p) => within(cells, seatTile(desks.get(p.deskId)), radius)) };
  });
  for (const r of reach) r.top = r.members.length ? topOf(r.members) : -Infinity;
  const home = new Map();
  for (const r of reach) for (const p of r.members) if (!home.has(p) || r.top > home.get(p).top) home.set(p, r);
  const crowds = reach.map((r) => ({ cooler: r.cooler, members: r.members.filter((p) => home.get(p) === r) }))
    .filter((c) => c.members.length >= 2);
  const gained = new Map();
  for (const crowd of crowds) {
    crowd.top = topOf(crowd.members);
    crowd.expert = crowd.members.find((p) => p.knowledge === crowd.top);
    for (const p of crowd.members) {
      const gain = Math.min(maxGain, share * (crowd.top - p.knowledge));
      if (gain <= 0) continue;
      p.knowledge = Math.min(100, p.knowledge + gain);
      gained.set(p, gain);
    }
  }
  const last = (state.flags.coolerShared ??= {});
  for (const { cooler, members, expert } of crowds) {
    if (state.week - (last[cooler.id] ?? -Infinity) < notifyWeeks) continue;
    // Members keep state.staff order, so a tie goes to whoever comes first.
    const best = members.reduce((a, p) => ((gained.get(p) ?? 0) > (gained.get(a) ?? 0) ? p : a), members[0]);
    if ((gained.get(best) ?? 0) < notifyGain) continue;
    last[cooler.id] = state.week;
    ctx.emit({ type: 'toast', text: `${best.name} picked up some context from ${expert.name} at the water cooler.`, tone: 'good', topic: 'shared', subjectId: best.id, short: shortText('Context shared') });
  }
}
