import { B } from '../sim/balance.js';

const triggered = { random: false, weight: B.dotcom.sockWeight, cooldownWeeks: B.dotcom.sockCooldown, subject: null, kind: 'era', eras: ['dotcom'], when: () => true };
export const DOTCOM_EVENTS = [
  { ...triggered, id: 'dotcom_eyeballs', title: 'The eyeball economy',
    text: `We have counted both eyes. Finance asked us to. Customer acquisition is now ${Math.round((B.dotcom.boomAcquisition - 1) * 100)}% faster until the bust. Revenue still requires a product.`,
    auto: {} },
  { ...triggered, id: 'dotcom_ipo_frenzy', title: 'The roadshow has a roadshow',
    text: 'A banker says your domain name has excellent fundamentals. A small public float buys runway, but gives away a share of the final score. This is financing, not a retirement.',
    choices: [
      { label: 'Stay private', hint: `Brand +${B.dotcom.privateBrand}; keep the score`, effects: { dotcom: 'private' }, outcome: 'The banker respects your decision in a very short email.' },
      { label: 'Take the small float', hint: `+$${B.dotcom.floatCash / 1000}K; existing dilution score x0.8; public-company costs during the bust`, effects: { dotcom: 'float' }, outcome: 'The bell rings. Someone still has to answer support mail.' },
    ] },
  { ...triggered, id: 'dotcom_warning', title: 'An interesting market',
    text: `The analyst has replaced "inevitable" with "interesting". The bust arrives in company week ${B.dotcom.bustWeek}. Keep runway and maintain your products.`,
    auto: {} },
  { ...triggered, id: 'dotcom_bust', title: 'The market discovers a second direction',
    text: `New-customer acquisition falls to ${B.dotcom.bustAcquisition * 100}% until recovery. Existing customers need reassurance. Public companies also pay a one-time cost capped at $${B.dotcom.floatCostCap / 1000}K or ${B.dotcom.floatCashShare * 100}% of cash, whichever is less. Nobody is automatically laid off.`,
    choices: [
      { label: 'Preserve cash', hint: `Lose ${B.dotcom.preserveLoss * 100}% of customers across live products; no retention spending`, effects: { dotcom: 'preserve' }, outcome: 'The team keeps the lights on. The business plan now contains prices.' },
      { label: 'Call every customer', hint: `Spend up to $${B.dotcom.retainCostCap / 1000}K, capped at ${B.dotcom.retainCashShare * 100}% of cash; lose ${B.dotcom.retainLoss * 100}% of customers`, effects: { dotcom: 'retain' }, outcome: 'A human picks up the phone. Customers remember that.' },
    ] },
  { ...triggered, id: 'dotcom_recovery', title: 'A business model, at last',
    text: 'We have a business model now. It is invoices. The boom and bust are over. This bridge career skips the intervening years and continues in Classic SaaS with your people, products and cash intact.',
    auto: {} },
  { ...triggered, id: 'dotcom_sock_pivot', kind: 'misc', random: true, weight: B.dotcom.sockWeight, cooldownWeeks: B.dotcom.sockCooldown,
    title: 'PetParcel wants a partnership', text: 'They sell pet supplies and a very confident sock. The sock has better media training than the board.',
    choices: [
      { label: 'Sponsor the sock', hint: `-$${B.dotcom.sockCost / 1000}K, newest product hype +${B.dotcom.sockHype}`, effects: { cash: -B.dotcom.sockCost, hype: B.dotcom.sockHype }, outcome: 'The sock thanks your company by name. Nobody expected to feel proud.' },
      { label: 'Wish the sock well', hint: 'No cost', effects: {}, outcome: 'The sock nods with professional warmth.' },
    ] },
];

export const DOTCOM_GOALS = [
  { id: 'dotcom_first_web', startEras: ['dotcom'], group: 'Dot-com', name: 'A place on the web', trophy: true,
    desc: 'Ship a web product during the dot-com chapter. The visitor counter may finally count someone else.',
    reward: B.dotcom.launchReward, done: (s) => !!s.flags.dotcom?.webLaunched },
  { id: 'dotcom_survivor', startEras: ['dotcom'], group: 'Dot-com', name: 'Still answering the phone', trophy: true,
    desc: 'Reach recovery with the company solvent. The office fern was never worried.',
    reward: B.dotcom.survivorReward, done: (s) => !!s.flags.dotcom?.recovered && s.cash >= 0 },
];
