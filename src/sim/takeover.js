import { B } from './balance.js';
import { runBot } from './bots.js';
import { FUNDING } from '../data/funding.js';

export const canTakeOver = (era) => Object.hasOwn(B.takeover.scoreMult, era);

// Preserve the predecessor's clock and earned records; entry metadata controls the score.
export function buildTakeover({ startEra, funding, ...options }) {
  if (!canTakeOver(startEra)) throw new Error('Takeover is available from ChatGBT onward in the era preview.');
  if (!Object.hasOwn(FUNDING, funding)) throw new Error('Unknown takeover funding.');
  const bot = B.takeover.bot;
  const state = runBot(bot, options.seed, B.runWeeks, {
    founding: { ...options, funding }, stopWhen: (s) => s.era.id === startEra,
  }).state;
  if (state.gameOver || state.era.id !== startEra) {
    throw new Error(`This company did not reach ${startEra === 'chatgbt' ? 'ChatGBT' : 'Agents'} under its previous management. Try another seed, founder pair or funding source, or found a company.`);
  }
  Object.assign(state.founding, {
    startMode: 'takeover', takeoverEra: startEra, takeoverWeek: state.week, takeoverBot: bot,
    eraScoreMult: B.takeover.scoreMult[startEra],
  });
  return state;
}
