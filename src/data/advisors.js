// The three advisors and what they say. Each topic has lines per tier (1 mild, 2 worse, 3 worst);
// placeholders: {weeks} {name} {count} {policy} {months} {product} {pct} {era}.
// They observe and price a trade-off. They never give orders, never know anything a panel doesn't show,
// and never lecture.
export const ADVISORS = {
  cfo: { name: 'Marge Tally', title: 'CFO' },
  people: { name: 'Otto Nwosu', title: 'People lead' },
  tech: { name: 'Rory Halloran', title: 'Tech lead' },
};

export const ADVICE_LINES = {
  runway: {
    1: [
      "At this burn we have {weeks} weeks. I've started pricing smaller chairs.",
      "{weeks} weeks of runway. Revenue could fix that. So could fewer of us. I'd rather revenue.",
      "We're spending faster than we earn. It's a bold strategy with a short shelf life.",
    ],
    2: [
      "{weeks} weeks. I've stopped buying the good coffee. Nobody noticed, which is the only good news.",
      '{weeks} weeks left. Cutting costs hurts now; raising prices hurts later. Pick your hurt.',
      "{weeks} weeks. I've started saying the number quietly, as if that helps.",
    ],
    3: [
      "{weeks} weeks. Whatever we do, we're doing it this month.",
      "{weeks} weeks of cash. I've drafted two emails: one to customers, one to a bank. Neither is fun.",
    ],
    red: [
      "We're in the red. The bank has started calling me by my first name.",
      "We're below zero. Every losing week from here is one we can't take back.",
    ],
  },
  burnout: {
    1: [
      "{name} is burnt out. They're still showing up, which is somehow worse.",
      'One person on empty. Rest costs a few weeks of output. Losing them costs more.',
    ],
    2: [
      '{count} people are running on fumes. The coffee machine has noticed.',
      '{count} people burnt out. Crunch buys this week and borrows from every week after.',
    ],
    3: [
      "A third of the team is burnt out. I'm out of jokes, and I'm the one with the jokes.",
      '{count} people on empty. At this point the output graph is a pulse check.',
    ],
  },
  debt: {
    1: [
      "Tech debt is creeping up. Nobody's panicking. Nobody can explain the billing code either.",
      "We're shipping faster than we're understanding. Fine for now. Now is a short word.",
    ],
    2: [
      'Nobody can explain how billing works anymore. Including billing.',
      'Tech debt is high enough that incidents feel personal. A refactor costs a project. An outage costs a weekend.',
    ],
    3: [
      'The codebase has become folklore. People tell stories about it at lunch.',
      "Fixing one thing now breaks two. I've started keeping a list. The list has bugs.",
    ],
  },
  busFactor: {
    1: [
      'Most of what we know lives in {name}\'s head. It\'s a nice head. It\'s one head.',
      "If {name} wins the lottery, we win nothing.",
    ],
    2: [
      "{name} holds almost all of it. Mentoring slows them down. Losing them stops us.",
      "{name} is the only one who knows why the scheduler works. {name} isn't sure either.",
    ],
  },
  unusedPolicy: {
    1: [
      "We unlocked {policy} {months} months ago. Nobody's tried it. That's either fine or telling.",
      '{policy} has been sitting there for {months} months. It costs money. So does whatever it would fix.',
    ],
  },
  era: {
    dotcom: [
      'Ship a small website before planning the IPO. The bills are real; the eyeball valuation is a presentation.',
      'The boom brings attention. A working product gives it somewhere to go. Keep enough cash for the quieter years.',
    ],
    chatgbt: [
      'The chatbots are here. Half the team is excited. The other half updated their CVs.',
      "Every product has a chat box now. Ours can have one too, or be the one that doesn't.",
    ],
    agents: [
      'The agents are here. They work nights, never complain, and delete production with total confidence.',
      'Agents can do a week of work overnight. Someone still has to read what they did.',
    ],
    consolidation: [
      "The big companies are buying everyone. Being small just became a negotiating position.",
    ],
    plateau: [
      "The hype has settled. What's left is whether people actually like using our stuff.",
    ],
    any: ["{era} has arrived. The old playbook still works. It just works a little less every month."],
  },
  oneProduct: {
    1: [
      '{product} pays for almost everything. I\'d like it to have a friend.',
      '{pct}% of our revenue comes from {product}. Great product. Terrible diversification strategy.',
    ],
  },
  migration: {
    1: [
      "{product} needs a migration soon. Doing it now costs a project. Not doing it costs a Tuesday we won't enjoy.",
      "{product}'s migration is coming due. The old stack sends its regards and its invoices.",
    ],
    2: [
      "{product}'s migration is overdue. The old version runs on optimism and one cron job.",
      "{product} is past its migration date. Every week it gets a little more haunted.",
    ],
  },
  squadIdle: {
    1: [
      "{squad} has been playing foosball since the launch. Impressive, but not billable.",
      '{squad} is between projects. So far that means a very organised snack drawer.',
      "Nobody has told {squad} what's next, so {squad} has started a podcast. Please give them a project.",
    ],
  },
  juniors: {
    1: [
      "{count} juniors are teaching themselves. Mentoring costs a senior's time. Not mentoring costs a junior's first year.",
      "{count} juniors, no mentors. They're learning. Mostly from each other, which is how rumours work.",
    ],
  },
  fine: {
    cfo: ['Things are fine. I hate it when things are fine.', 'The numbers are boring this week. Boring is my favourite.'],
    people: ["Nobody's burnt out and nothing's on fire. I'm going to go stand near the plant.", 'Everyone seems okay. I checked twice, casually.'],
    tech: ['No fires. I checked twice. I\'m checking again.', "Nothing's broken that I know about. It's a very careful sentence."],
  },
};
