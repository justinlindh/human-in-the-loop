import { B } from '../sim/balance.js';

export const PREINTERNET_CHAT = { id: 'pre_patch_by_post', text: 'The patch is in the post. The bug arrived by courier.' };

const chapter = { random: false, subject: null, kind: 'misc', eras: ['preinternet'], cooldownWeeks: B.preinternet.weeks, when: () => true };
export const PREINTERNET_EVENTS = [
  { ...chapter, id: 'pre_master_disk', title: 'The gold master',
    text: 'The release is ready for duplication. Someone has written FINAL on the disk. Someone else has brought a pen.',
    choices: [
      { label: 'Verify the master', hint: `-$${B.preinternet.verifyCost}; reliability and maximum health +${B.preinternet.verifyReliability}`, effects: { preinternet: 'verify' }, outcome: 'The disk passed. The label now says VERIFIED FINAL.' },
      { label: 'Ship on the deadline', hint: `Launch cash +$${B.preinternet.rushCash}; debt +${B.preinternet.rushDebt}`, effects: { preinternet: 'rush' }, outcome: 'The distributor paid the deadline bonus. Support has asked for stamps.' },
    ] },
  { ...chapter, id: 'pre_retail_returns', title: 'The boxes came back',
    text: 'The retailer is clearing the first batch from its shelves. Unsold copies are withdrawn. The buyback bill uses their remaining manufacturing cost; customer refunds are accounted for separately.',
    auto: { preinternet: 'returns' } },
  { ...chapter, id: 'pre_cd_rom', title: 'More room, same deadline',
    text: 'A CD can fit the product and the manual. Marketing has asked how much of that space could be the logo.',
    choices: [
      { label: 'Master a CD release', hint: `-$${B.preinternet.cdCost}; the next batch holds ${B.preinternet.cdCapacity * 100}% more copies, each still costs money`, effects: { preinternet: 'cd' }, outcome: 'The next order has more capacity. The cardboard box remains the same size.' },
      { label: 'Keep the disks', hint: 'No cost', effects: { preinternet: 'disks' }, outcome: 'Please insert disk two. Please keep disk one nearby.' },
    ] },
];

export const PREINTERNET_GOALS = [
  { id: 'pre_first_batch', startEras: ['preinternet'], requiredChapter: 'preinternet', group: 'Pre-internet', name: 'A physical release', trophy: true,
    desc: 'Duplicate and receive the first paid batch of a boxed product.', reward: B.preinternet.launchReward,
    done: (s) => s.products.some((p) => p.boxed?.delivered > 0) },
];
