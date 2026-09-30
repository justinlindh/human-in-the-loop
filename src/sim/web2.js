import { B } from './balance.js';
import { pick } from './rng.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { WEB2_CHAT } from '../data/early-eras.js';

export function compatibilityMult(state, angle) {
  if (state.era.id !== 'web2' || angle !== 'web') return 1;
  return state.staff.some((p) => p.role === 'engineer' && p.seniority === 'senior' && p.mood !== 'away' && p.traits.includes('legacy_whisperer'))
    ? B.web2.whispererWorkMult : B.web2.workMult;
}

// Freeze the work estimate when the project starts. Later hires or era arrivals cannot reprice it.
export function applyCompatibility(state, project) {
  const factor = compatibilityMult(state, project.angle);
  if (project.kind !== 'new' || factor === 1) return;
  project.pointsNeeded *= factor;
  project.compatibility = { id: 'legacy_compat', factor, contributors: [] };
}

export function compatibleLaunch(state, project, product) {
  if (!project.compatibility) return;
  product.legacyCompatible = true;
  for (const id of project.compatibility.contributors) {
    const p = state.staff.find((person) => person.id === id && person.role === 'engineer');
    if (!p) continue;
    p.record ??= {};
    p.record.compatibleLaunches = (p.record.compatibleLaunches ?? 0) + 1;
  }
}

export function web2Step(ctx) {
  const { state } = ctx;
  if (state.era.id === 'web2') {
    const f = state.flags.web2 ??= { arrived: false, retired: false };
    if (!f.arrived) { f.arrived = true; raiseDecision(ctx, 'web2_recovery', null, { queue: true }); }
    if (state.week % B.web2.chatterEvery === 0) emitChat(ctx, { channel: 'random', person: pick(ctx.rng, state.staff), text: pick(ctx.rng, WEB2_CHAT) });
  } else if (state.flags.web2 && !state.flags.web2.retired) {
    state.flags.web2.retired = true;
    emitChat(ctx, { channel: 'general', from: '@office', important: true,
      text: 'An old HipCheck thread resurfaces: "Internet Exploder 6 is retired. We can delete the workaround." "Which one?" New web projects no longer include old-browser QA work.' });
  }
}
