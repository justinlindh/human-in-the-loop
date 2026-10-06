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
  // The first batch, after a boxed launch, and a reorder when a product sells out with buyers still asking.
  // Both order through the orderBatch action; {batchSmall} and {batchLarge} are today's quotes. Each is dropped
  // when it no longer fits by the time it comes due. The first order keeps the chapter's eras on purpose: it is a
  // pre-internet nudge, so a card still queued when dot-com begins is dropped.
  { ...chapter, id: 'pre_first_order', subject: 'randomProduct', title: 'Empty shelves',
    fits: (s, id) => { const inv = liveBoxOf(s, id); return !!inv && !inv.stock && !inv.delivered && !inv.deliveries.length; },
    text: '{product} is finished and the reviews are in. The stores would love to sell it. They would need something to sell. Boxed software sells from stock: no boxes, no sales.',
    choices: orderChoices([
      'The duplicator is warming up. Someone has volunteered to lick the labels.',
      'Five hundred boxes are on their way. The hallway will be a warehouse for a while.',
      'The shelves stay empty. The disks are on the founder\'s desk, where they sell to nobody.',
    ]) },
  { ...chapter, id: 'pre_sold_out', subject: 'randomProduct', eras: undefined, title: 'Sold out',
    fits: (s, id) => { const inv = liveBoxOf(s, id); return !!inv && !inv.stock && !inv.deliveries.length; },
    text: 'The last copy of {product} just left the shelf. People are still asking for it. The store has started taking their names on a napkin.',
    choices: orderChoices([
      'More boxes are on the way. The napkin is retired with honours.',
      'A big batch is coming. The store has cleared an end cap.',
      'The shelf stays empty. The napkin fills up, then gets thrown away.',
    ]) },
];

function liveBoxOf(s, id) {
  const p = s.products.find((x) => x.id === id);
  return p?.boxed && !p.killed ? p.boxed : null;
}

function orderChoices([small, large, hold]) {
  const [s, l] = B.preinternet.batches;
  return [
    { label: `Order ${s} copies`, hint: `{batchSmall}; on the shelves in ${B.preinternet.leadWeeks} weeks`, effects: { preinternet: `order:${s}` }, outcome: small },
    { label: `Order ${l} copies`, hint: `{batchLarge}; on the shelves in ${B.preinternet.leadWeeks} weeks`, effects: { preinternet: `order:${l}` }, outcome: large },
    { label: 'Hold off', hint: 'No cost and no sales; order any time from Reports > Inventory', effects: { preinternet: 'hold' }, outcome: hold },
  ];
}

export const PREINTERNET_GOALS = [
  { id: 'pre_first_batch', startEras: ['preinternet'], requiredChapter: 'preinternet', group: 'Pre-internet', name: 'A physical release', trophy: true,
    desc: 'Duplicate and receive the first paid batch of a boxed product.', reward: B.preinternet.launchReward,
    done: (s) => s.products.some((p) => p.boxed?.delivered > 0) },
];
