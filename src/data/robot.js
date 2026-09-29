// The office robot's Yak lines (#178). {name}: whose desk; {fixer}: who slapped it; {coworker}: someone else.
// Keep each under 90 characters.
export const ROBOT_LINES = {
  // #random while automation is high enough that people blame the robot.
  grumble: [
    "The clanker said 'Have a productive day' to me. I have never felt so threatened.",
    'Watched it bring {coworker} a latte. {coworker} said thank you. To the robot.',
    'It has a better attendance record than me and I hate that.',
    'Not taking coffee from a machine that is coming for the coffee machine.',
    "Someone put a sticky note on it that says 'I know what you did'. It didn't do anything.",
    'It beeped at me in a tone. I know a tone when I hear one.',
  ],
  // #random while automation is low and the robot is just a nice robot.
  fond: [
    'The robot remembered I take oat milk. Nobody else here remembered.',
    'It waited for me to finish my sentence before it rolled off. Better manners than most VPs.',
    'The robot watered my plant. My plant has never been this loved.',
    'It said "Excuse me" to the recycling bin. We do not deserve it.',
  ],
  breakdown: {
    spin: ['The robot is spinning by the kitchen again. Do not make eye contact.', 'Robot is doing the thing. The spinning thing. Someone get the hand.'],
    stuck: ['It has been apologising to the same chair for twenty minutes.', 'The robot is stuck on a chair and has chosen to live there now.'],
    emptyDesk: ["It brought {name}'s usual to {name}'s desk. {name} is away. It is still waiting.", "The robot is holding a coffee at {name}'s empty desk. I'm fine. Everything's fine."],
    cone: ['There is a traffic cone in the hallway. Where do you even get a traffic cone.', 'The robot met a traffic cone and lost. Nobody knows where the cone came from.'],
    decaf: ['The robot is serving decaf. This is an act of war.', 'Someone swapped the robot to decaf. The robot does not know. The robot is so proud.'],
    unplug: ["The robot got unplugged 'by accident'. The quotation marks are doing a lot of work.", 'Robot unplugged. The plug is two metres from anything anyone would trip on.'],
  },
  fixed: [
    '{fixer} fixed it. {fixer} will not explain how.',
    'One slap. Right side. {fixer} walked away without looking back.',
    '{fixer} gave it a firm, loving slap. It is back and it is sorry.',
  ],
  // The fixer who has earned Percussive Maintenance fixes it the same week.
  fixedFast: [
    '{fixer} fixed it before anyone finished typing "the robot is".',
    '{fixer} slapped it without looking up from their laptop. Legend.',
  ],
};
