// Office talk: spoken exchanges (say events, shown as speech bubbles) and Yak exchanges (chat events).
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

// The @channel running joke: one over-notifier per run pings everyone for nothing, a few times a run.
// Each moment is a post and matching replies ({a} is the offender). Warranted ones happen during a real outage.
export const AT_CHANNEL = [
  { post: ['@channel who took my yogurt', '@channel whoever took the yogurt with my name on it, I just want to talk'],
    replies: ['The whole company now knows about the yogurt.', 'I was in a customer call. My phone announced the yogurt.', 'Pinning this in case anyone forgets the yogurt.'] },
  { post: ['@channel nvm found it', '@channel never mind, it was in my other bag'],
    replies: ['Found what, {a}? We will never know.', 'Thank you for the update on the thing we did not know was lost.', 'Relieved for you. Also woken up.'] },
  { post: ['@channel happy friday!!', '@channel HAPPY FRIDAY everyone'],
    replies: ['It is Thursday.', 'Happy Friday to you too. Please never do that again.', 'The guidelines, for the third time this month.'] },
  { post: ['@channel typo on the pricing page, fixing it now', '@channel small thing, the pricing page says "anual"'],
    replies: ['It is two in the morning, {a}.', 'Thank you for fixing it. Thank you less for telling all of us at 2 a.m.', 'Fixed a typo, woke the company. A fair trade, apparently.'] },
  { post: ['@channel does anyone have a phone charger', '@channel who has a spare charger, the round kind'],
    replies: ['There is a drawer. There has always been a drawer.', 'Here is the channel guidelines doc, again.', 'I have one. I will not be giving it to someone who does this.'] },
];

export const AT_CHANNEL_WARRANTED = {
  post: ['@channel {product} is down. Everyone who can, please look.', '@channel {product} is down for everyone. All hands.'],
  replies: ['Sorry for the reaction earlier. This one is fair.', 'Okay, this is what it is for. On it.', 'Removing my reaction. Looking now.'],
};
