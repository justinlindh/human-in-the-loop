// Office shop. effects[level - 1] maps a bonus key to its value; systems read them through itemBonus(state, key).
// Percent keys are fractions (0.15 = +15%); flat keys are added as-is.
const rows = [
  ['espresso', 'Espresso Machine', 'Proper coffee. Stamina comes back faster.', 0, [3000, 9000, 27000],
    [{ staminaRecovery: 0.15 }, { staminaRecovery: 0.3 }, { staminaRecovery: 0.45 }], null],
  ['plant_wall', 'Plant Wall', 'A wall of green. Everyone recovers a little faster.', 0, [2500, 7500, 22000],
    [{ meaningRecovery: 0.1 }, { meaningRecovery: 0.2 }, { meaningRecovery: 0.3 }], null],
  ['nap_pod', 'Nap Pod', 'A place to lie down before quitting. Burnt-out people are less likely to resign.', 1, [6000, 18000, 50000],
    [{ burnoutResign: -0.15 }, { burnoutResign: -0.3 }, { burnoutResign: -0.45 }], null],
  ['arcade', 'Arcade Cabinet', 'Fun at work, officially. Faster recovery, slightly less work.', 1, [8000, 24000, 70000],
    [{ meaningRecovery: 0.15, output: -0.02 }, { meaningRecovery: 0.25, output: -0.03 }, { meaningRecovery: 0.35, output: -0.04 }], null],
  ['standing_desk', 'Standing Desks', 'Everyone stands. Stamina lasts longer.', 0, [4000, 12000, 36000],
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

export const ITEMS = Object.fromEntries(rows.map(([id, name, desc, minStage, costs, effects, requires]) => [
  id, { id, name, desc, minStage, costs, effects, requires },
]));
