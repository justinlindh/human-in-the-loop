import { B } from '../sim/balance.js';
// The founders' quick posts in Yak. Whether a post lands, falls flat or backfires follows from the moment
// (see OUTCOMES in src/sim/posts.js); the text below only varies how it reads.
//   text     the founder's post
//   replies  staff replies by outcome; `tired` lines are for repliers who are burnt out or coasting
//   who      roles that tend to reply first
const N = B.posts;

export const POSTS = [
  {
    kind: 'pep_talk', label: 'Pep talk', icon: 'megaphone', channel: 'general',
    hint: 'Team meaning up a little. Backfires during an outage or when morale is low.',
    text: [
      'Proud of this team. Seriously. Keep going.',
      'Quick reminder that you are all doing great work and I notice.',
      'Big week. We have got this. I believe in every one of you.',
    ],
    who: ['designer', 'marketer', 'engineer'],
    replies: {
      landed: ['Needed that today, thank you.', 'Right back at you.', 'Okay, I am a little moved.', 'Printing this and putting it on the fridge.'],
      flat: ['Thanks. Again.', 'Appreciate it. Same as last time.', 'Noted, with love.'],
      backfired: ['Read the room.', 'Respectfully, the servers are on fire.', 'Believing is not the bottleneck right now.'],
      tired: ['Thanks. I am going to go lie down for a minute.', 'I will believe it after a nap.'],
    },
  },
  {
    kind: 'who_broke_prod', label: 'Who broke prod?', icon: 'siren', channel: 'incidents',
    hint: 'During an outage, the product\'s health up a little and team meaning down a little. With nothing broken, it just scares people.',
    text: [
      'Okay. Who broke prod?',
      'Not mad, just asking: who broke prod?',
      'Quick one: who touched production?',
    ],
    who: ['engineer', 'security', 'support'],
    replies: {
      landed: ['On it. It was a config change. Rolling back.', 'Found it. Fix is going out now.', 'It was me. Fixing it. Please stop looking at me.'],
      flat: ['Still on it, same as an hour ago.', 'Nobody new broke it, if that helps.'],
      backfired: ['Nothing is broken? Is something about to be broken?', 'Prod is fine. Is it? Now I am checking.', 'Why are you asking. What do you know.'],
      tired: ['I did not break it. I am too tired to break anything.'],
    },
  },
  {
    kind: 'meme', label: 'Share a meme', icon: 'laugh', channel: 'random',
    hint: 'Team meaning up a little. Backfires during an outage.',
    text: [
      '[a picture of a dog at a laptop, captioned "me in standup"]',
      '[a chart going up and to the right, labelled "number of tabs I have open"]',
      '[a cat knocking a mug off a desk, captioned "me, merging on a Friday"]',
    ],
    who: ['designer', 'marketer', 'sales'],
    replies: {
      landed: ['I am crying.', 'This is going in the all-hands deck.', 'Too real.', 'Saving this for later. For morale.'],
      flat: ['Seen it.', 'Classic. Still classic.'],
      backfired: ['Is now really the time?', 'We are mid-outage.', 'Love this, will laugh once prod is back.'],
      tired: ['Ha. Ha. Ha. I am so tired.'],
    },
  },
  {
    kind: 'pizza', label: 'Pizza\'s here', icon: 'pizza', channel: 'general',
    hint: `$${N.pizzaPerHead} per person in the office; team meaning and stamina up.`,
    text: [
      'Pizza is in the kitchen. Go. Go now.',
      'I ordered pizza. There is a vegetarian one, and it is being guarded.',
      'Pizza has arrived. This is not a drill.',
    ],
    who: ['engineer', 'support', 'sales', 'designer'],
    replies: {
      landed: ['Running.', 'The vegetarian one is already gone. Sorry.', 'Best company. Best founder. Best pizza.', 'I was about to cry and then pizza.'],
      flat: ['Pizza again? Not complaining. Mostly.', 'I will have one slice. For morale.'],
      backfired: ['Pizza during an outage is a vibe, I guess.'],
      tired: ['Eating it at my desk. Do not talk to me.'],
    },
  },
  {
    kind: 'announcement', label: 'Announcement', icon: 'bullhorn', channel: 'general',
    hint: 'With real news to share, team meaning up. With none, it just makes everyone nervous.',
    text: [
      'Company update: {news}. Thank you all.',
      'A quick announcement: {news}. You made that happen.',
      'Some news for everyone: {news}. More soon.',
    ],
    vague: [
      'Company update at 4pm. Please attend.',
      'Can everyone jump on a quick call? Nothing bad. Probably.',
      'Big announcement coming. Stay tuned.',
    ],
    who: ['engineer', 'marketer', 'support', 'sales'],
    replies: {
      landed: ['Let us go!', 'Amazing news.', 'Proud to be here.', 'Screenshotting this for my mom.'],
      flat: ['We heard. Still great.', 'Yep, still celebrating.'],
      backfired: ['Is this a layoffs thing?', 'Why is my heart rate up.', 'Updating my resume, just in case.'],
      tired: ['Cool. Cool.'],
    },
  },
];

export const POST_KINDS = POSTS.map((p) => p.kind);
