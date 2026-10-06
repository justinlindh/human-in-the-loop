// The boombox's stations. Audio keys its station beds to these ids. The station is flavour: the boombox's
// effect is the same whatever plays.
//   like, dislike   what someone says about the station when it's theirs, or very much isn't
export const STATIONS = [
  { id: 'lofi', name: 'Sad Lo-fi FM',
    like: ['This is my focus music. Please nobody touch the dial.', 'Rain sounds and a sad piano. Finally, a coworker who gets me.'],
    dislike: ['Is it raining in here or is that the radio?', 'This station makes me want to journal. I do not want to journal.'] },
  { id: 'synth88', name: 'Synth 88',
    like: ['I am coding in a neon montage right now.', 'Every commit feels like a car chase.'],
    dislike: ['Too many arpeggios. My brain is arpeggiating.', 'Why does the radio sound like a training montage?'] },
  { id: 'polka', name: 'Polka Hour',
    like: ['Polka is efficient. Every song is exactly the same speed as my typing.', 'Nobody understands polka. I understand polka.'],
    dislike: ['Can we not do polka again?', 'The accordion has been going since lunch. It has not stopped. It will never stop.'] },
  { id: 'bossa', name: 'Bossa Nova Express',
    like: ['Bossa nova makes the bug tracker feel like a beach.', 'I have never been to Rio. Today I am closer.'],
    dislike: ['The flute keeps sneaking up on me.', 'It is too relaxing. I have stopped caring about the deadline.'] },
  { id: 'elevator', name: 'Elevator Jazz',
    like: ['Elevator jazz is underrated. Nothing bad has ever happened during elevator jazz.', 'I feel like I am on hold, but in a good way.'],
    dislike: ['I feel like I am on hold with my own job.', 'Every song sounds like it is about to ask for my account number.'] },
  { id: 'funk', name: 'Office Funk',
    like: ['That bass line is doing my code review for me.', 'You cannot be sad during slap bass. It is scientifically impossible.'],
    dislike: ['The bass is in my chair. My chair is funky now. I did not ask for that.', 'Too much wah. I cannot think with this much wah.'] },
];

export const STATION_IDS = STATIONS.map((s) => s.id);
export const stationName = (id) => STATIONS.find((s) => s.id === id)?.name ?? id;

// Someone changed the station while you were out: what they say about it.
export const STATION_SWAP_LINES = [
  'I changed the station. Nobody was using the old one. Spiritually.',
  'Switched it to {station}. Think of it as a team-building exercise.',
  'The radio was on the wrong station, so I fixed it. You are welcome.',
];

// The occasional argument: a second person answers someone who loves the current station.
export const STATION_ARGUMENT_LINES = ['Some of us are trying to work over here.', 'Counterpoint: no.', 'I am putting a sign-up sheet on the dial.'];
