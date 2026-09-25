import { B } from '../sim/balance.js';
// Yak reply prompts: a staff post with two or three founder replies. Small stakes only; big ones are decisions.
//   on       what sets it off (see TRIGGERS in src/sim/prompts.js): strain, incident, launch, rival, late, agents
//   channel  the Yak channel it posts in; cooldown: weeks before this template can open again
//   eras     optional list of era ids; without it, the era text check keeps AI talk out of Classic
//   text     variants of the post; {product}, {project}, {rival} come from the trigger
//   options  label and hint (the hint states the effects); effects apply to the poster, productEffects to the
//            product; reply: the founder's line; answer: the poster's follow-up
//   ignored  what happens when nobody answers before it expires
const N = B.prompts;

export const PROMPTS = [
  {
    id: 'strain_vent', on: 'strain', channel: 'general', cooldown: 6,
    text: [
      'Is it just me or has this sprint been three sprints?',
      'I have had the same coffee cup on my desk since Monday. It might be next Monday.',
      'Quick poll: does anyone else hear the laptop fan in their sleep?',
    ],
    options: [
      { label: 'Take Friday off. Seriously.', hint: 'Their strain down a lot; their meaning up a little', effects: { strain: -N.restStrain, meaning: 2 },
        reply: ['Take Friday off. That is not a suggestion.', 'Log off Friday. If I see you online I am unplugging the router.'],
        answer: ['...okay. Thank you. I am going to sleep for a day and a half.', 'Is this a trap? I am taking it anyway.'] },
      { label: 'We ship Friday, then we rest', hint: 'Output up a little for 1 week; their strain up; their meaning down a little',
        effects: { modifier: { key: 'output', value: N.pushOutput, weeks: 1, label: 'Friday deadline' }, strain: N.pushStrain, meaning: -1 },
        reply: ['We ship Friday, then everyone rests. I promise.', 'Two more days. Then a real weekend. It is in the calendar.'],
        answer: ['Okay. Holding you to the calendar thing.', 'Friday. Sure. I have heard of Friday.'] },
    ],
    ignored: { effects: { meaning: -3 }, line: ['Cool. Cool cool cool.', 'Nobody replied, and that is fine, and I am fine.'] },
  },
  {
    id: 'incident_blame', on: 'incident', channel: 'incidents', cooldown: 16,
    text: [
      'Okay, who pushed to prod on a Friday?',
      'The pager went off at 3am and I have questions. Mostly for the pager.',
      'The status page says "degraded". I say "on fire". Can we agree on "warm"?',
    ],
    options: [
      { label: 'Blameless postmortem, please', hint: 'Institutional knowledge up; team meaning up a little', effects: { ik: 2, teamMeaning: 1 },
        reply: ['Nobody is in trouble. Postmortem Monday, blameless, with snacks.', 'We find the cause, not the culprit. Doc by Monday.'],
        answer: ['Starting the doc. Title: "Contributing Factors (Mostly Friday)".', 'Snacks noted. Blame retracted.'] },
      { label: 'Just fix it, talk later', hint: 'The product\'s health up a little; their strain up', effects: { strain: N.pushStrain }, productEffects: { health: 4 },
        reply: ['Fix first, feelings later. You have got this.', 'Heads down. We do the retro when the graphs are green.'],
        answer: ['On it. Feelings rescheduled to Tuesday.', 'Graphs trending green. Feelings still red.'] },
    ],
    ignored: { effects: { teamMeaning: -1 }, line: ['Great. I will just keep refreshing the dashboard alone, then.'] },
  },
  {
    id: 'launch_hype', on: 'launch', channel: 'wins', cooldown: 8,
    text: [
      '{product} is live! Can we get a founder post? A small one. Or a big one.',
      '{product} shipped and nothing caught fire. Founder hype post, please?',
      'We launched {product}. My mom liked the post. Can you like the post?',
    ],
    options: [
      { label: 'Hype post, everywhere', hint: 'The product\'s hype up a little; their meaning up a little', effects: { meaning: 2 }, productEffects: { hype: N.launchHype },
        reply: ['{product} is live and I am unreasonably proud of this team. Go look at it.', 'Posted. Reposted. Told my dentist about {product}.'],
        answer: ['THE FOUNDER POSTED. Screenshotting.', 'My mom liked your post too.'] },
      { label: 'Cake in the kitchen at 4', hint: `$${N.cakeCost}; team meaning up a little`, effects: { cash: -N.cakeCost, teamMeaning: 2 },
        reply: ['Cake in the kitchen at 4. Real cake, not a metaphor.', 'I ordered a cake. It says {product} and it is spelled right.'],
        answer: ['CAKE.', 'I have been looking forward to 4pm since 10am.'] },
      { label: 'Nice. Back to the roadmap', hint: 'Their meaning down a little', effects: { meaning: -1 },
        reply: ['Nice work. Next up: the roadmap.'],
        answer: ['Right. Yes. The roadmap. Of course.'] },
    ],
    ignored: { effects: { meaning: -2 }, line: ['No founder post. It is fine. The launch knows it is loved.'] },
  },
  {
    id: 'rival_itch', on: 'rival', channel: 'random', cooldown: 16,
    text: [
      '{rival} just shipped the thing we demoed last month. Should we say something?',
      '{rival} called us "legacy" on a podcast. Can I respond? I have a draft. It is long.',
      'Someone at {rival} is still joking about our last outage. Permission to engage?',
    ],
    options: [
      { label: 'Rise above it', hint: 'Team meaning up a little', effects: { teamMeaning: 1 },
        reply: ['We rise above it. Then we ship something better.', 'Let them talk. We will be busy.'],
        answer: ['Rising. Grudgingly.', 'Fine. I am drafting nothing. Angrily.'] },
      { label: 'One tasteful reply', hint: 'Brand up a little, with a small chance it backfires', effects: { brand: 1, gamble: { p: N.subtweetBackfire, effects: { brand: -3 } } },
        reply: ['One reply. Tasteful. Run it by me first.', 'Keep it classy. Keep it short.'],
        answer: ['Posted. It is extremely tasteful. It has a pun.', 'Drafted, deleted, drafted again. Posted.'] },
    ],
    ignored: { effects: { meaning: -1 }, line: ['Silence. Very mature. I hate it.'] },
  },
  {
    id: 'project_late', on: 'late', channel: 'general', cooldown: 6,
    text: [
      '{project} is going to slip. Do we cut scope or cut sleep?',
      'Status on {project}: "almost done", which is what I said three weeks ago.',
      'I have re-estimated {project}. The new estimate is a shrug.',
    ],
    options: [
      { label: 'Cut scope', hint: 'Their meaning up a little; nobody crunches', effects: { meaning: 2 },
        reply: ['Cut scope. Ship the core and save the rest for the next version.', 'We ship less, and we ship it well.'],
        answer: ['Deleting half the tickets feels incredible.', 'The backlog for next time just got very exciting.'] },
      { label: 'Cut sleep, just this once', hint: 'Output up for 1 week, which strains everyone',
        effects: { modifier: { key: 'output', value: N.crunchOutput, weeks: 1, label: 'A late-project push' } },
        reply: ['One week, all hands. Then everyone gets a real break.', 'Just this once. I will bring snacks. So many snacks.'],
        answer: ['"Just this once." Writing that down.', 'Snacks accepted as payment.'] },
    ],
    ignored: { effects: { meaning: -2 }, line: ['I will keep saying "almost done", then.'] },
  },
  {
    id: 'agent_prs', on: 'agents', channel: 'general', cooldown: 8, eras: ['agents', 'consolidation', 'plateau'],
    text: [
      'The coding agent opened 40 pull requests overnight. Do I review them all?',
      'An agent refactored the billing code "for clarity". It is not clearer. Merge?',
      'The agent left a comment on my code: "consider simplifying". I am considering a long walk.',
    ],
    options: [
      { label: 'Review every one', hint: 'Comprehension debt down; their strain up', effects: { debt: -N.reviewDebt, strain: N.pushStrain },
        reply: ['Review them all. Every line. We own it once it merges.', 'Read it like you wrote it. Because now you did.'],
        answer: ['Pouring a second coffee. And a third.', 'On number 3 of 40. Send help. And lunch.'] },
      { label: 'Merge the green ones', hint: 'Comprehension debt up; their meaning up a little', effects: { debt: N.mergeDebt, meaning: 1 },
        reply: ['If the tests pass, merge it.', 'Green means go. Mostly.'],
        answer: ['Merged 38. Two are "thinking".', 'Done. I understand none of it. Great.'] },
    ],
    ignored: { effects: { debt: 2 }, line: ['I will let the agent review its own work, then. What could go wrong.'] },
  },
  {
    id: 'newhire_lost', on: 'newhire', channel: 'general', cooldown: 4,
    text: [
      'First week question: is there a map of the codebase, or do I just walk in and hope?',
      'Hi all! Where do we keep the docs? Asking for a friend. I am the friend.',
      'Who do I ask about access to... everything?',
    ],
    options: [
      { label: 'Grab lunch with me', hint: `$${N.lunchCost}; their meaning up`, effects: { cash: -N.lunchCost, meaning: 4 },
        reply: ['Lunch, my treat. Bring every question you have.', 'Come find me at noon. I will draw you the map.'],
        answer: ['Bringing a notebook. A big one.', 'Best first week I have had anywhere.'] },
      { label: 'The docs are pinned in #general', hint: 'Their knowledge up a little', effects: { knowledge: 3 },
        reply: ['Pinned in #general. Start with the one called "READ THIS FIRST (really)".'],
        answer: ['Found it. There is a second one called "NO, READ THIS FIRST".', 'Reading. The docs have opinions.'] },
    ],
    ignored: { effects: { meaning: -2 }, line: ['Okay! I will just figure it out! Alone! Fun!'] },
  },
  {
    id: 'coasting_check', on: 'coasting', channel: 'general', cooldown: 6,
    text: [
      'Does anyone else feel like they are just moving tickets from one column to another?',
      'Real question: what are we building this for? I forgot. Asking gently.',
      'I closed nine tickets today and felt nothing. Is that growth?',
    ],
    options: [
      { label: 'Let us talk. Coffee?', hint: 'Their meaning up', effects: { meaning: 5 },
        reply: ['Coffee this afternoon? I want to hear it.', 'I have been there. Walk with me at 3.'],
        answer: ['Yeah. Okay. That would help.', 'See you at 3. I will bring the existential dread.'] },
      { label: 'Try something new next sprint', hint: 'Their meaning and knowledge up a little', effects: { meaning: 2, knowledge: 3 },
        reply: ['Pick something you have never touched next sprint. Your call.'],
        answer: ['Anything? Even the billing code? Especially the billing code.'] },
    ],
    ignored: { effects: { meaning: -3 }, line: ['Moving another ticket. Column to column. Such is life.'] },
  },
  {
    id: 'support_swamped', on: 'support', channel: 'general', cooldown: 6,
    text: [
      'The support queue just passed 300. I have started talking to the tickets.',
      'A customer wrote "please" eleven times. I would like to answer them. I need help.',
      'Support update: we are fine. We are not fine.',
    ],
    options: [
      { label: 'Everyone takes five tickets', hint: 'The product\'s health up a little; team meaning up a little',
        effects: { teamMeaning: 1 }, productEffects: { health: 3 },
        reply: ['All hands: everyone takes five tickets today. Yes, me too.'],
        answer: ['The queue is shrinking. I love you all.', 'Someone in design answered a ticket with a diagram. It worked.'] },
      { label: 'Write better canned replies', hint: 'Institutional knowledge up a little; their strain up a little', effects: { ik: 1, strain: N.pushStrain },
        reply: ['Can you turn the top ten questions into canned replies? I will review them.'],
        answer: ['Reply one: "Have you tried turning it off and on again". Reply two: the same, but kinder.'] },
    ],
    ignored: { effects: { meaning: -2 }, line: ['Answering ticket 301. Then 302. Then, presumably, 303.'] },
  },
  {
    id: 'lowcash_lunch', on: 'lowcash', channel: 'general', cooldown: 16,
    text: [
      'Should I still order the Friday team lunch, or are we a sandwich company now?',
      'Finance asked me to "be mindful" about the snack budget. Is it bad?',
      'Quick one: are we still allowed to buy the good coffee this month?',
    ],
    options: [
      { label: 'Keep the lunch', hint: `$${N.teamLunchCost}; team meaning up a little`, effects: { cash: -N.teamLunchCost, teamMeaning: 2 },
        reply: ['Keep the lunch. We are fine. We will be fine.'],
        answer: ['Ordering. Getting the cheaper dumplings, as a gesture.'] },
      { label: 'Sandwiches this month', hint: 'Team meaning down a little', effects: { teamMeaning: -1 },
        reply: ['Sandwiches this month. Just this month.'],
        answer: ['Understood. I will make them look festive.'] },
    ],
    ignored: { effects: { teamMeaning: -1 }, line: ['No answer. I will assume sandwiches.'] },
  },
  {
    id: 'desk_squeeze', on: 'crowded', channel: 'general', cooldown: 10,
    text: [
      'I am currently sharing a desk with the printer. The printer is winning.',
      'Can we get another desk? I have been working from the beanbag for a week.',
      'Is the meeting room a desk now? Asking because I live there.',
    ],
    options: [
      { label: 'A new desk is coming', hint: 'Their meaning up a little', effects: { meaning: 2 },
        reply: ['A new desk is coming. Guard the beanbag until then.'],
        answer: ['The beanbag and I will miss each other.'] },
      { label: 'Hot-desking builds character', hint: 'Their meaning down a little', effects: { meaning: -1 },
        reply: ['Hot-desking builds character.'],
        answer: ['My character is very built now. Thanks.'] },
    ],
    ignored: { effects: { meaning: -2 }, line: ['Beanbag, week two. We have an understanding now.'] },
  },
  {
    id: 'junior_pr', on: 'junior', channel: 'general', cooldown: 6,
    text: [
      'Could someone look at my pull request? It is small. It is one line.',
      'I think I broke the build, but I also think I fixed it? Can someone check?',
      'Is it normal for a test to pass only on Tuesdays?',
    ],
    options: [
      { label: 'I will review it now', hint: 'Their knowledge up; their meaning up a little', effects: { knowledge: 4, meaning: 1 },
        reply: ['Send it my way. Reviewing now.', 'On it. Good instinct to ask.'],
        answer: ['You left nine comments on one line. I learned so much.', 'It was, in fact, not fixed. Now it is.'] },
      { label: 'Ask the team, they are great', hint: 'Institutional knowledge up a little', effects: { ik: 1 },
        reply: ['Post it in #general. This team loves a small pull request.'],
        answer: ['Four people reviewed it. It is a group project now.'] },
    ],
    ignored: { effects: { meaning: -2 }, line: ['Merging it myself. Wish me luck. Actually, wish the build luck.'] },
  },
];

export const PROMPT_IDS = PROMPTS.map((p) => p.id);
