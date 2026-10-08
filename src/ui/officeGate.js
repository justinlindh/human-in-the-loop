// The Office panel's wording for a move that is not open yet. The sim's gate (officeGateReason) decides
// whether it is blocked; this only rewrites its date and revenue-or-savings reasons so they say what is
// already met, when the rest opens and how far off that is. Every other reason passes through as the sim
// worded it.
import { fmtMoney } from './dom.js';
import { calendarDate } from '../sim/util.js';

const mrrOf = (s) => (s.products ?? []).filter((p) => !p.killed).reduce((a, p) => a + (Number.isFinite(p.mrr) ? p.mrr : 0), 0);
const REVENUE_OR_SAVINGS = /^Needs \$[\d,]+ MRR, or \$[\d,]+ in the bank from /;
const FROM_DATE = /^Available from /;

// "Q3 2021" on the calendar, or "company week 135" for an era start, and how many weeks away it is.
function whenOf(s, week) {
  const left = Math.max(0, week - s.week);
  const d = calendarDate(s, week);
  return { label: s.founding?.startEra ? `company week ${week}` : `Q${d.quarter} ${d.year}`, weeks: `${left} week${left === 1 ? '' : 's'}` };
}

// stage: the stage or expansion step being gated; reason: the sim's reason for it.
export function gateWords(s, stage, reason) {
  const g = stage?.gate;
  if (!reason || !g) return reason;
  if (g.week && FROM_DATE.test(reason)) {
    const w = whenOf(s, g.week);
    return `Available from ${w.label} (in ${w.weeks}).`;
  }
  if (!g.mrr || !g.orCash || !REVENUE_OR_SAVINGS.test(reason)) return reason;
  const openWeek = g.orCashWeek ?? 0;
  const mrr = `Needs ${fmtMoney(g.mrr)} MRR (you have ${fmtMoney(mrrOf(s))})`;
  const bank = `${fmtMoney(g.orCash)} in the bank`;
  if (s.week < openWeek) {
    const w = whenOf(s, openWeek);
    return s.cash >= g.orCash
      ? `${mrr}. Your ${fmtMoney(s.cash)} in the bank counts from ${w.label} (in ${w.weeks}).`
      : `${mrr}, or ${bank} from ${w.label} (you have ${fmtMoney(s.cash)}).`;
  }
  return `${mrr}, or ${bank} (you have ${fmtMoney(s.cash)}).`;
}
