// Office talk: spoken exchanges (say events, shown as speech bubbles) and Slackk exchanges (chat events).
//
// An exchange:
//   { id, stream: 'say' | 'chat', channel /* chat only: general | wins | incidents | random */,
//     on /* a situation (see SITUATIONS), or absent for everyday talk */,
//     eras /* optional list of era ids it may run in */, rare /* true: only in about a third of runs */,
//     weight /* default 1 */, cooldown /* weeks before it can run again */, when /* optional (state, h) => bool */,
//     cast: { a: spec, b: spec, c: spec }   // b and c optional; specs in CAST_SPECS
//     turns: [['a', [variant, variant, variant]], ['b', [...]], ...] }
// Each turn picks one variant at random, so every variant of a reply must work after every variant of
// the line before it. Variants that fail the era or office check, or were used recently, are skipped.
// Placeholders (SLOTS): {a} {b} {c} are the cast's first names; the rest come from the game state and a
// line whose placeholder has no value is skipped.
// h = { era, avgMeaning, debt, ik, week, staff, live, cash, stage, policy, beats, hasModifier(label) }.
import { SAY_EXCHANGES } from './talk-say.js';
import { SAY_EVERYDAY } from './talk-everyday.js';
import { CHAT_EXCHANGES } from './talk-chat.js';
import { SAY_SOLO_LINES, JOKES } from './talk-solo.js';

export const CAST_SPECS = [
  'any', 'founder', 'builder', 'junior', 'senior', 'mentor', 'mentee', 'mentorOf', 'teammate', 'neighbour', 'newhire',
  'veteran', 'coasting', 'burnout', 'tired', 'happy', 'automated', 'overseer', 'remote', 'stayer', 'petOwner', 'promoted',
  'engineer', 'designer', 'marketer', 'support', 'sales', 'security',
];

// In priority order: when several things happen in one week, the earlier one gets talked about.
export const SITUATIONS = [
  'outage', 'launch', 'resign', 'incident', 'award', 'era', 'lockdown', 'caught', 'promotion', 'office', 'hire', 'lowcash',
  'burnout', 'research', 'item', 'goal', 'standups', 'rival', 'priceHike', 'clone', 'copied', 'pet',
];

export const SLOTS = [
  'a', 'b', 'c', 'product', 'category', 'incumbent', 'model', 'project', 'coworker', 'rival', 'rivalFounder', 'pet', 'item',
  'era', 'company', 'gone', 'year',
];

export const TALK = [...SAY_EXCHANGES, ...SAY_EVERYDAY, ...CHAT_EXCHANGES];
export const SAY_SOLO = SAY_SOLO_LINES;
export const RUNNING_JOKES = JOKES;
