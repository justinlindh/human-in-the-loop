// The Office panel's wording for a move that is not open yet. The sim's gate (officeGateReason) decides
// whether it is blocked; this only rewrites its revenue-or-savings reason so it says what is already met
// and what is left. Every other reason passes through as the sim worded it.
import { fmtMoney } from './dom.js';
import { dateOf } from '../sim/util.js';

const mrrOf = (s) => (s.products ?? []).filter((p) => !p.killed).reduce((a, p) => a + (Number.isFinite(p.mrr) ? p.mrr : 0), 0);
const REVENUE_OR_SAVINGS = /^Needs \$[\d,]+ MRR, or \$[\d,]+ in the bank from /;

// stage: the stage or expansion step being gated; reason: the sim's reason for it.
export function gateWords(s, stage, reason) {
  const g = stage?.gate;
  if (!reason || !g?.mrr || !g.orCash || !REVENUE_OR_SAVINGS.test(reason)) return reason;
  const openWeek = g.orCashWeek ?? 0;
  const mrr = `Needs ${fmtMoney(g.mrr)} MRR (you have ${fmtMoney(mrrOf(s))})`;
  const bank = `${fmtMoney(g.orCash)} in the bank`;
  if (s.week < openWeek) {
    const when = s.founding?.startEra ? `company week ${openWeek}` : `${dateOf(openWeek).year}`;
    const left = openWeek - s.week;
    const wk = `${left} week${left === 1 ? '' : 's'}`;
    return s.cash >= g.orCash
      ? `${mrr}. Your ${fmtMoney(s.cash)} in the bank counts from ${when} (in ${wk}).`
      : `${mrr}, or ${bank} from ${when} (you have ${fmtMoney(s.cash)}).`;
  }
  return `${mrr}, or ${bank} (you have ${fmtMoney(s.cash)}).`;
}
