// The Incentives Program's reward ladder, from the modest to the legendary. Each reward is staged as a
// moment: onlookers whisper to each other, the winner says something awkward, and Slackk speculates.
// onlookers: turns for two onlookers, a then b; any variant of b works after any variant of a.
// {winner} is the winner's first name.
export const INCENTIVES = [
  {
    id: 'finger_traps', name: 'a set of finger traps', short: 'finger traps',
    onlookers: [
      ['a', ['Are those finger traps?', 'Is {winner} stuck in a finger trap?', 'Did {winner} win finger traps?']],
      ['b', ['Top performer of the quarter.', 'That is the prize. I checked twice.', 'Apparently it builds character.']],
    ],
    winner: ['I cannot get my fingers out. Thank you, though.', 'This is a very honest prize.', 'I will treasure these. Carefully.'],
    slack: {
      post: ['Congrats to {winner}, winner of finger traps. The incentives program is live.', 'The first incentive has been awarded. It is finger traps.'],
      replies: ['Can you still type?', 'Asking for a friend: how do you get out?', 'Aim high, everyone.'],
    },
  },
  {
    id: 'balloons', name: 'a bunch of balloons', short: 'balloons',
    onlookers: [
      ['a', ['Why does {winner} have balloons?', 'Are those balloons for {winner}?', 'Is it {winner}\'s birthday?']],
      ['b', ['Incentive program. Tier two.', 'Top performer. Balloons are tier two.', 'No. It is merit.']],
    ],
    winner: ['I have to take these home on the bus.', 'They are very nice. They keep hitting the ceiling fan.', 'Thank you. I think.'],
    slack: {
      post: ['{winner} won the balloons. The incentives program is escalating.', 'There are balloons tied to {winner}\'s chair. Winner of tier two.'],
      replies: ['What is tier three?', 'I will be working this weekend. For the balloons.', 'One is already losing air. Like my will to compete.'],
    },
  },
  {
    id: 'caricature', name: 'a caricature portrait', short: 'a caricature',
    onlookers: [
      ['a', ['Is that a caricature of {winner}?', 'Who drew {winner} with that chin?', 'Why is there an artist here?']],
      ['b', ['Tier three. You get drawn.', 'It is the incentive. The chin is part of it.', 'Top performer gets immortalized. Loosely.']],
    ],
    winner: ['The chin is a lot. The chin is fair.', 'I look like a tired walnut. I love it.', 'I am framing this. Please do not look at it.'],
    slack: {
      post: ['{winner}\'s caricature is up by the door. Please do not add a moustache.', 'Tier three awarded: {winner} has been drawn.'],
      replies: ['Someone added a moustache.', 'It captures the essence. The essence is chin.', 'I want one. I also do not want one.'],
    },
  },
  {
    id: 'melon_bar', name: 'a melon bar', short: 'a melon bar',
    onlookers: [
      ['a', ['Is that a melon bar?', 'Why is there a table of melon?', 'Did {winner} win melon?']],
      ['b', ['Three kinds of melon. Tier four.', 'It is the reward. We just look at it.', 'The melon is for {winner}. We can look.']],
    ],
    winner: ['There is so much melon. Please, everyone, have some melon.', 'I did not know melon came in this many colours.', 'This is the nicest thing a spreadsheet has ever done for me.'],
    slack: {
      post: ['There is a melon bar in the kitchen for {winner}. Do not touch the honeydew.', 'Tier four is a melon bar. I repeat, a melon bar.'],
      replies: ['I touched the honeydew.', 'Is the melon bar the whole reward or is there more?', 'Adding melon to my list of motivations.'],
    },
  },
  {
    id: 'music_night', name: 'a music and dance night', short: 'a music night',
    onlookers: [
      ['a', ['Why is there a DJ?', 'Is {winner} dancing on purpose?', 'Is this a performance review?']],
      ['b', ['Tier five. Music and dance.', 'It is the incentive. We are the audience.', 'Top performer gets a dance floor. We get to watch.']],
    ],
    winner: ['I did not know I would have to dance.', 'Please stop filming.', 'This is a lot of attention for one quarter of work.'],
    slack: {
      post: ['Music night for {winner} at five. Attendance is optional but strongly watched.', 'There is a disco ball. It is for {winner}.'],
      replies: ['I have seen things I cannot unsee.', 'The disco ball is the most productive thing in the office.', 'Next quarter I am aiming for tier five. And a nap.'],
    },
  },
  {
    id: 'waffle_party', name: 'THE WAFFLE PARTY', short: 'the Waffle Party',
    onlookers: [
      ['a', ['Is that... a waffle party?', 'Are those waffles?', 'I thought the Waffle Party was a myth.']],
      ['b', ['Do we get waffles?', 'Do we get any?', 'Is there enough for us?']],
      ['a', ['No. We watch.', 'No. We just watch.', 'We are allowed to smell them.']],
    ],
    winner: ['This is... nice. Thank you.', 'I do not know what to say. There is so much syrup.', 'I will remember this for the rest of my career.'],
    slack: {
      post: ['{winner} reached the Waffle Party. We are witnessing history.', 'Photo from the Waffle Party (sorry it is blurry, I was shaking)'],
      replies: ['Is that whipped cream or a cloud?', 'I did not believe it was real.', 'This is blurry but it is the most beautiful photo I have ever seen.'],
    },
  },
];

export const INCENTIVE_IDS = INCENTIVES.map((r) => r.id);
