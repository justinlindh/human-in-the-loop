// Everything placed in the office. effects[level - 1] maps a bonus key to its value; systems read them
// through itemBonus(state, key). Percent keys are fractions (0.15 = +15%); flat keys are added as-is.
// kind: 'furniture' (one level, bought once per copy; effects[0] is a small global effect, often empty) or
// 'shop' (three upgrade levels).
// footprint: tiles at rot 0. adjacency: { radius, key, value } adds value to every desk whose seat is within
// radius tiles of the item; with `to`, it adds value for each item of that id within radius instead.
const FURNITURE = [
  ['desk', 'Desk Set', 'A desk, a chair, and a screen. One person each. No desk, no hire.', [800], { w: 1, h: 2 }, null],
  ['meeting_table', 'Meeting Table', 'Standups and arguments happen here. Mostly arguments.', [3000], { w: 3, h: 2 }, null],
  ['whiteboard', 'Whiteboard', 'Nearby desks get a little more inventive. The markers are always dry.', [400], { w: 2, h: 1 },
    { radius: 2, key: 'novelty', value: 0.04 }],
  ['coffee_corner', 'Coffee Corner', 'A kettle, a drip machine, and a mug that says World\'s Okayest Dev. Keeps the desks right next to it going.', [1200], { w: 2, h: 1 },
    { radius: 3, key: 'staminaRecovery', value: 0.08 }],
  ['plant', 'Potted Plant', 'Green and quietly judgmental. People nearby recover a little faster.', [150], { w: 1, h: 1 },
    { radius: 2, key: 'meaningRecovery', value: 0.04 }],
  ['bookshelf', 'Bookshelf', 'Old manuals, one good novel. People nearby learn the systems faster.', [500], { w: 2, h: 1 },
    { radius: 2, key: 'knowledgeGain', value: 0.05 }],
  ['couch', 'Couch', 'Somewhere to collapse that is not the floor. A little faster recovery for everyone.', [600], { w: 2, h: 1 },
    null, { meaningRecovery: 0.03, staminaRecovery: 0.05 }],
  ['foosball', 'Foosball Table', 'Two minutes of spinning rods and yelling. Morale up, output barely down.', [900], { w: 1, h: 1 },
    null, { meaningRecovery: 0.04, output: -0.01 }],
  ['ping_pong_table', 'Ping Pong Table', 'The official conflict resolution tool of the software industry.', [1500], { w: 2, h: 1 },
    null, { meaningRecovery: 0.06, output: -0.015 }, 1],
];

const SHOP_SHAPE = {
  espresso: [{ w: 2, h: 1 }, null], plant_wall: [{ w: 2, h: 1 }, null], nap_pod: [{ w: 1, h: 2 }, null], arcade: [{ w: 1, h: 1 }, null],
  standing_desk: [{ w: 2, h: 1 }, null], whiteboard_wall: [{ w: 3, h: 1 }, null], library: [{ w: 2, h: 2 }, null],
  monitoring_wall: [{ w: 3, h: 1 }, null], server_rack: [{ w: 2, h: 1 }, { radius: 1, key: 'uptimeFloor', value: 0.01, to: 'server_rack' }],
  trophy_case: [{ w: 2, h: 1 }, null],
};

// Items about AI work arrive with that era.
const SHOP_ERA = { monitoring_wall: 'agents' };

const rows = [
  ['espresso', 'Espresso Machine', 'Proper coffee, for the whole office. Everyone\'s stamina comes back faster.', 0, [3000, 9000, 27000],
    [{ staminaRecovery: 0.15 }, { staminaRecovery: 0.3 }, { staminaRecovery: 0.45 }], null],
  ['plant_wall', 'Plant Wall', 'A wall of green. Everyone recovers a little faster.', 0, [2500, 7500, 22000],
    [{ meaningRecovery: 0.1 }, { meaningRecovery: 0.2 }, { meaningRecovery: 0.3 }], null],
  ['nap_pod', 'Nap Pod', 'A place to lie down before quitting. Burnt-out people are less likely to resign.', 1, [6000, 18000, 50000],
    [{ burnoutResign: -0.15 }, { burnoutResign: -0.3 }, { burnoutResign: -0.45 }], null],
  ['arcade', 'Arcade Cabinet', 'Fun at work, officially. Faster recovery, slightly less work.', 1, [8000, 24000, 70000],
    [{ meaningRecovery: 0.15, output: -0.02 }, { meaningRecovery: 0.25, output: -0.03 }, { meaningRecovery: 0.35, output: -0.04 }], null],
  ['standing_desk', 'Standing Desks', 'Raised once, for a photo. Now a shelf for hoodies. Somehow everyone\'s stamina lasts longer. Not a seat.', 0, [4000, 12000, 36000],
    [{ staminaDrain: -0.1 }, { staminaDrain: -0.2 }, { staminaDrain: -0.3 }], null],
  ['whiteboard_wall', 'Whiteboard Wall', 'Floor-to-ceiling whiteboards. Ideas get weirder, in a good way.', 0, [3500, 10000, 30000],
    [{ novelty: 0.05 }, { novelty: 0.1 }, { novelty: 0.15 }], null],
  ['library', 'Library Nook', 'Books, a lamp, a comfy chair. People learn the systems faster.', 1, [6000, 18000, 54000],
    [{ knowledgeGain: 0.15 }, { knowledgeGain: 0.3 }, { knowledgeGain: 0.45 }], null],
  ['monitoring_wall', 'Monitoring Wall', 'Big screens full of agent logs. Overseers cover more ground.', 1, [7000, 21000, 60000],
    [{ oversight: 0.15 }, { oversight: 0.3 }, { oversight: 0.45 }], null],
  ['server_rack', 'Server Racks', 'Your own hardware. Less to maintain, fewer bad days.', 0, [5000, 15000, 45000],
    [{ maintenanceNeed: -0.05, uptimeFloor: 0.03 }, { maintenanceNeed: -0.1, uptimeFloor: 0.06 }, { maintenanceNeed: -0.15, uptimeFloor: 0.1 }], null],
  ['trophy_case', 'Trophy Case', 'Show off the Saasies. People remember you longer.', 0, [3000, 9000, 27000],
    [{ brandDecay: -0.15 }, { brandDecay: -0.3 }, { brandDecay: -0.45 }], 'award'],
];

// Items that can go on the roof terrace.
const OUTDOOR = new Set(['plant', 'couch', 'coffee_corner', 'ping_pong_table', 'plant_wall']);

export const ITEMS = Object.fromEntries([
  ...FURNITURE.map(([id, name, desc, costs, footprint, adjacency, effect = {}, minStage = 0]) => [
    id, { id, name, desc, kind: 'furniture', minStage, costs, effects: [effect], requires: null, footprint, adjacency, era: null, outdoor: OUTDOOR.has(id) },
  ]),
  ...rows.map(([id, name, desc, minStage, costs, effects, requires]) => [
    id, { id, name, desc, kind: 'shop', minStage, costs, effects, requires, footprint: SHOP_SHAPE[id][0], adjacency: SHOP_SHAPE[id][1], era: SHOP_ERA[id] ?? null, outdoor: OUTDOOR.has(id) },
  ]),
]);
