import { B } from './balance.js';
import { calendarDate } from './util.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { leaveProp } from './props.js';
import { Y2K_REPLIES } from '../data/y2k.js';

export const y2kSeason = (s) => s.era.id === 'dotcom' && calendarDate(s).year === B.y2k.year;
export const y2kProjectOpen = (s) => y2kSeason(s)
  && (s.flags.y2k?.contracts ?? 0) < B.y2k.contractLimit
  && !s.projects.some((j) => j.kind === 'y2k_compliance');

export function y2kOnCall(ctx, choice) {
  const { state } = ctx;
  if (!y2kSeason(state)) return;
  const f = state.flags.y2k ??= {};
  if (f.onCall) return;
  const fee = B.y2k.consultantRate * B.y2k.consultantMultiplier;
  if (choice === 'consultant' && state.cash < fee) return;
  f.onCall = choice;
  if (choice === 'consultant') state.cash -= fee;
}

// The saved chapter maps company weeks to calendar weeks, including compressed years.
export function y2kStep(ctx) {
  const { state } = ctx;
  if (state.era.id !== 'dotcom') return;
  const date = calendarDate(state);
  if (date.year < B.y2k.year) return;
  const f = state.flags.y2k ??= {};
  const rollover = date.year === B.y2k.year && calendarDate(state, state.week + 1).year > B.y2k.year;
  if (date.year === B.y2k.year && date.quarter >= B.y2k.onCallQuarter && !rollover && !f.offered) {
    f.offered = true;
    raiseDecision(ctx, 'dotcom_y2k_oncall', null, { queue: true });
  }
  if (rollover && f.rolloverWeek === undefined) {
    f.rolloverWeek = state.week;
    f.stage = 'rollover';
    f.onCall ??= 'founder';
    leaveProp(state, { prop: 'printer', anchor: 'kitchen', until: { weeks: B.y2k.propWeeks } });
    f.printerId = state.office.props.at(-1).id;
  }
  if (f.stage === 'rollover' && state.week > f.rolloverWeek) {
    f.stage = 'after';
    const root = emitChat(ctx, { id: `y2k:${f.rolloverWeek}`, channel: 'general', from: '@office',
      text: 'Midnight report: nothing broke. One printer issued an invoice dated 01/01/1900. Accounts would like a word.', reactions: {}, important: true });
    state.staff.forEach((person, i) => emitChat(ctx, { id: `${root.id}:${person.id}`, channel: 'general', person,
      text: Y2K_REPLIES[i % Y2K_REPLIES.length], replyTo: root.id, reactions: {} }));
    emitChat(ctx, { id: `${root.id}:consultant`, channel: 'general', from: 'Clive (away)', replyTo: root.id, reactions: {},
      text: 'Auto-reply: I have already moved on to e-business transformation. Same briefcase, new rate card.' });
  }
}
