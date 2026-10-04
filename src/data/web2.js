import { B } from '../sim/balance.js';

const period = { weight: B.web2.eventWeight, cooldownWeeks: B.web2.eventCooldown, subject: null, kind: 'misc', eras: ['web2'], when: () => true };
export const WEB2_EVENTS = [
  { ...period, id: 'web2_recovery', random: false, kind: 'era', title: 'The revenue slide contains revenue',
    text: 'The company has paying customers to find. Their IT department approves Internet Exploder 6. Foxfire is not approved. A newer browser is still a proposal in a meeting room.',
    choices: [
      { label: 'Fund the QA bench', hint: `-$${B.web2.qaCost / 1000}K, comprehension debt ${B.web2.qaDebt}`, effects: { cash: -B.web2.qaCost, debt: B.web2.qaDebt }, outcome: 'The test machine is labelled CLIENT. Nobody is allowed to update it.' },
      { label: 'Keep the runway', hint: 'No cost; web projects still include compatibility work', effects: {}, outcome: 'The budget is small. The conditional comment is long.' },
    ] },
  { ...period, id: 'web2_activex', title: 'An Active-ish control',
    text: 'The client wants a control that needs administrator access to display a calendar. It has a certificate and a very confident installer.',
    choices: [
      { label: 'Build a sandbox', hint: `-$${B.web2.sandboxCost / 1000}K, debt ${B.web2.sandboxDebt}`, effects: { cash: -B.web2.sandboxCost, debt: B.web2.sandboxDebt }, outcome: 'The calendar has its own little room now.' },
      { label: 'Approve an exception', hint: `Debt +${B.web2.exceptionDebt}; no cash cost`, effects: { debt: B.web2.exceptionDebt }, outcome: 'The exception document has become a template. This is how it starts.' },
      { label: 'Offer an ordinary form', hint: 'No cost', effects: {}, outcome: 'The form has twelve options. All of them are months.' },
    ] },
  { ...period, id: 'web2_grey_png', subject: 'compatibleProduct', title: 'Transparency, in grey',
    text: '{product} has transparent PNGs. On the approved browser, transparency is a grey rectangle. The rectangle is extremely reliable.',
    choices: [
      { label: 'Patch the image loader', hint: `-$${B.web2.pngCost / 1000}K, product polish +${B.web2.pngPolish}`, effects: { cash: -B.web2.pngCost, legacyPolish: B.web2.pngPolish }, outcome: 'The grey is gone. The workaround has its own comment explaining why it must stay.' },
      { label: 'Keep the rectangle', hint: 'No cost', effects: {}, outcome: 'Design calls it a solid foundation.' },
    ] },
];

export const WEB2_GOALS = [
  { id: 'web2_compatible_launch', startEras: ['web2', 'dotcom', 'preinternet'], requiredChapter: 'web2', group: 'Web 2.0', name: 'Works on the client machine', trophy: true,
    desc: 'Ship a web product with Internet Exploder 6 compatibility. The client can finally click the second button.',
    reward: B.web2.launchReward, done: (s) => s.products.some((p) => p.legacyCompatible) },
];
