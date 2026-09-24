// Standup lines, picked by what each person is actually doing this week.
// Placeholders: {project} {pct} (their project and its progress), {mentee}, {product}, {coworker}.
// Coasting people give flat answers; burnt-out people say nothing (an empty line, not from this file).

export const STANDUP = {
  projectEarly: [
    'Yesterday: sketched {project}. Today: argue about the sketch. No blockers.',
    'Started on {project}. The first commit is a README and a lot of hope.',
    '{project} is at {pct}%. Mostly boxes and arrows so far, but good boxes.',
    'Spiking the hard part of {project} first. If I go quiet, send snacks.',
  ],
  projectMid: [
    '{project} is at {pct}%. On track, which is suspicious.',
    'Grinding through {project}. {pct}% done. The middle is always the longest part.',
    'Pairing with {coworker} on {project} today. We are at {pct}%.',
    '{project}: {pct}%. One blocker, and it is me, and I am working on it.',
    'Rewrote a chunk of {project}. Net progress: {pct}%. Net lines: negative. Good day.',
  ],
  projectLate: [
    '{project} is at {pct}%. Polishing the last corners. Nobody touch anything.',
    'Almost there on {project}, {pct}%. Writing the launch notes in my head already.',
    '{project} at {pct}%. Just bugs, copy, and one button that will not center.',
  ],
  mentor: [
    'Pairing with {mentee} all morning. They asked a question I had to look up. Proud.',
    'Walking {mentee} through the deploy pipeline. It is making more sense to both of us.',
    '{mentee} shipped their first test this week. I did a small dance.',
    'Mentoring {mentee}. No blockers, just a lot of whiteboard.',
  ],
  mentee: [
    'Learning the billing service with my mentor. It is less scary now.',
    'Yesterday I broke staging. Today I know why. Progress.',
    'Reading code with my mentor. I understand about 60% of it, up from 20%.',
  ],
  hardProblem: [
    'Still deep in the hard problem. I have three theories and two of them are wrong.',
    'The hard problem is fighting back. I am enjoying it more than I should.',
    'Whiteboard is full. The problem is not solved. I have never been happier.',
  ],
  oversight: [
    'Watched the agents all week. One tried to rename prod. Stopped it.',
    'Agent logs look calm. Too calm. Staying on it.',
    'Reviewed 40 agent changes. Sent 3 back. One was a haiku.',
  ],
  outage: [
    '{product} is still down. I am in the logs. Please do not ask for an ETA.',
    'Working the {product} outage. Coffee count: high. Answers: medium.',
    'We found the {product} bug. We have not found the person who understands it.',
  ],
  migration: [
    '{product} needs its model migration before the deadline. It is on my list, near the top.',
    'Migrating {product} to the new model version. The new version has opinions.',
  ],
  maintenance: [
    'Keeping the lights on. Patched two things, broke zero. Yet.',
    'Maintenance week. Upgraded a dependency and nothing exploded.',
    'On call. Quiet night. I do not trust it.',
  ],
  support: [
    'Support queue is down to a manageable panic. Customers mostly love us.',
    'Answered a ticket that just said "why". I explained why.',
    'Three customers asked for the same feature. Passing that along. Loudly.',
  ],
  sales: [
    'Two demos this week. One of them asked if we are "real AI". I said very.',
    'The pipeline looks good. The pipeline always looks good on Mondays.',
    'Chasing a big account. They want SSO, a discount, and a hug.',
  ],
  marketing: [
    'Drafting the next launch post. It has a pun in the title. Sorry in advance.',
    'Community is growing. Someone made a meme about us. It is a good meme.',
    'Planning the next campaign. The budget is small and the dreams are large.',
  ],
  security: [
    'Rotated keys, reviewed access, told someone to stop sharing passwords in chat.',
    'Nobody breached us this week. That I know of. Staying paranoid.',
    'Ran a phishing test. Four people clicked. We are having a fun meeting later.',
  ],
  idle: [
    'Between things. Happy to help anyone who needs a hand.',
    'Reading docs and waiting for the next project. Point me somewhere.',
  ],
  coasting: [
    'Same as yesterday.',
    'Working on stuff. No blockers.',
    'Still on it.',
    'Nothing new.',
    'Yeah, all good. Next.',
  ],
};
