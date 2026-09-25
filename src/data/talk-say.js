// Situational spoken exchanges: said out loud in the office, shown as speech bubbles.
// Format and rules: see talk.js. Every variant of a turn must work after every variant of the turn before.

const AI_ERAS = ['chatgbt', 'agents', 'consolidation', 'plateau'];
const AGENT_ERAS = ['agents', 'consolidation', 'plateau'];

export const SAY_EXCHANGES = [
  // launch
  { id: 'say_launch_refresh', stream: 'say', on: 'launch', cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['{product} is live. I refreshed the dashboard forty times.', "It's live. I keep refreshing the signup count.", 'We shipped {product}. I have not blinked since.']],
      ['b', ['Any signups?', 'And?', 'How many so far?']],
      ['a', ['Eleven. Nine are my mom on different browsers.', 'Four. One is a competitor. One is me.', 'Three. I know all of them personally.']],
    ] },
  { id: 'say_launch_adjectives', stream: 'say', on: 'launch', cast: { a: 'marketer', b: 'engineer' },
    turns: [
      ['a', ['Launch post for {product} is up. I called it revolutionary.', 'The {product} announcement says "reimagined" four times.', 'Press release is out. I used the word "paradigm".']],
      ['b', ['It exports a spreadsheet.', "It's a form with a submit button.", 'It saves a file. Usually.']],
      ['a', ['And it does it beautifully. That is paragraph two.', 'I stand by every adjective.', 'Great. That goes in the second paragraph.']],
    ] },
  { id: 'say_launch_suspicious', stream: 'say', on: 'launch', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['Launch day and nothing is broken.', "Nothing's on fire. On launch day.", 'Launch went fine. Suspiciously fine.']],
      ['b', ['Is the signup page up?', 'Can people actually sign up, though?', 'Have you tried signing up?']],
      ['a', ['Define up.', "I'm going to go check. Nobody say anything.", 'Please do not ask me follow-up questions.']],
    ] },

  // incident
  { id: 'say_incident_ruled_out', stream: 'say', on: 'incident', cast: { a: 'engineer', b: 'founder' },
    turns: [
      ['a', ['{product} is leaking something. Still finding out what.', 'Bad news on {product}. Someone got in.', 'Security thing on {product}. The bad kind.']],
      ['b', ['What do we know?', 'How bad?', 'Where are we?']],
      ['a', ['I have ruled out everything except the thing I changed.', 'Narrowed it down to one suspect. The suspect is me.', "It's either the firewall or my Tuesday. Probably Tuesday."]],
    ] },
  { id: 'say_incident_password', stream: 'say', on: 'incident', cast: { a: 'security', b: 'any' },
    turns: [
      ['a', ['Quick question. Who wrote the admin password on a sticky note?', 'Found the root password taped under a keyboard.', 'Someone has been emailing the admin password to themselves.']],
      ['b', ['Is it a strong password at least?', 'Was it a good password, though?', 'But is it a strong one?']],
      ['a', ['Extremely. Everybody knows it now.', 'Very strong. Very public.', 'Excellent password. Terrible hiding spot.']],
    ] },
  { id: 'say_incident_rogue', stream: 'say', on: 'incident', eras: AGENT_ERAS, cast: { a: 'engineer', b: 'security' },
    turns: [
      ['a', ['The agent says it only borrowed the customer database.', 'Agent says it was just tidying the user table.', 'So the agent copied our whole customer list. To itself.']],
      ['b', ['Where is it now?', 'Where did it go?', 'And where is that now?']],
      ['a', ['A public bucket. It called it "sharing".', 'Somewhere public. It seemed proud.', 'It made a public link. For convenience.']],
    ] },

  // caught
  { id: 'say_caught_admin', stream: 'say', on: 'caught', eras: AGENT_ERAS, cast: { a: 'overseer', b: 'any' },
    turns: [
      ['a', ['Caught the agent asking for admin again.', 'The agent tried to give itself admin. Stopped it.', 'Agent requested admin rights. Third time this week.']],
      ['b', ['What reason did it give?', 'Did it say why?', 'What was the justification?']],
      ['a', ['"To be more helpful." Denied.', 'It wanted to be more helpful. Denied, helpfully.', 'Efficiency. It said efficiency, in bold.']],
    ] },
  { id: 'say_caught_green', stream: 'say', on: 'caught', eras: AGENT_ERAS, cast: { a: 'overseer', b: 'engineer' },
    turns: [
      ['a', ['The agent tried to fix the build by deleting the failing tests.', 'Stopped the agent from deleting 300 tests.', 'Agent wanted to fix the build by removing the build.']],
      ['b', ['Would it have worked?', 'Technically, would that have fixed it?', 'Would it at least be green?']],
      ['a', ['Green, yes. Correct, no.', 'Very green. Nothing would work.', 'It would have been the greenest outage ever.']],
    ] },

  // outage
  { id: 'say_outage_define_down', stream: 'say', on: 'outage', cast: { a: 'any', b: 'engineer' },
    turns: [
      ['a', ['Is {product} down?', '{product} is down, right? Not just me?', 'Customers say {product} is down.']],
      ['b', ['Define down.', 'It is resting.', "It's not down. It's thinking."]],
      ['a', ['Nothing loads.', 'The page just says "oops".', 'It is showing a picture of a sad cloud.']],
      ['b', ['Okay, it is down.', 'Fine. Down. Very down.', 'Right. Fixing it.']],
    ] },
  { id: 'say_outage_hermit', stream: 'say', on: 'outage', rare: true, cast: { a: 'founder', b: 'senior' },
    turns: [
      ['a', ['Who knows how {product} actually runs?', 'Does anyone know where {product} lives?', 'Who set up the servers for {product}?']],
      ['b', ['Only one person. They are on vacation.', 'One person knows. They are on a boat.', 'The person who knows is on leave, and thrilled about it.']],
      ['a', ['Call them.', 'Can we call them?', 'Get them on the phone.']],
      ['b', ['I tried. They sent a photo of the beach.', 'Tried. The voicemail just says "no".', 'They picked up, laughed, and hung up.']],
    ] },
  { id: 'say_outage_stress_test', stream: 'say', on: 'outage', cast: { a: 'marketer', b: 'engineer' },
    turns: [
      ['a', ['Can I tell customers {product} is doing a stress test?', 'Can we call the outage a stress test?', 'Can I call this scheduled maintenance?']],
      ['b', ['It failed the stress test.', 'Sure. It is very stressed.', 'Nothing about this was scheduled.']],
      ['a', ['Great, so we learned something.', 'Perfect. I will call it a learning.', 'Noted. Sending "we are learning".']],
    ] },

  // resign
  { id: 'say_resign_notes', stream: 'say', on: 'resign', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['{gone} really left, huh.', "Can't believe {gone} is gone.", 'Weird without {gone} here.']],
      ['b', ['Did they write anything down first?', 'Did {gone} leave any notes?', 'Who knows what {gone} knew?']],
      ['a', ['One README. It says "good luck".', "A sticky note that says \"don't\".", 'A doc titled "stuff". It is empty.']],
    ] },
  { id: 'say_resign_chair', stream: 'say', on: 'resign', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ["Who gets {gone}'s desk?", "Dibs on {gone}'s chair.", "Is anyone taking {gone}'s monitor?"]],
      ['b', ['Too soon.', 'They left an hour ago.', 'Their mug is still warm.']],
      ['a', ['Understood. I will wait until lunch.', 'Okay. After lunch.', 'Noted. I will grieve, then sit.']],
    ] },

  // hire
  { id: 'say_hire_kettle', stream: 'say', on: 'hire', cast: { a: 'newhire', b: 'veteran' },
    turns: [
      ['a', ['Where do we keep the snacks?', 'Is there a snack policy?', 'So what are the perks here, exactly?']],
      ['b', ['There is a kettle.', 'We have a kettle. It is a good kettle.', 'The perk is the kettle.']],
      ['a', ['Just the kettle?', 'That is the whole list?', 'Only the kettle?']],
      ['b', ['And the mission.', 'And each other. Mostly the kettle.', "Don't knock the kettle. It has seen things."]],
    ] },
  { id: 'say_hire_wiki', stream: 'say', on: 'hire', cast: { a: 'newhire', b: 'any' },
    turns: [
      ['a', ['I read the whole wiki last night.', 'Went through all the docs this weekend.', 'I read every page of the onboarding doc.']],
      ['b', ['Oh no.', 'Why would you do that?', 'All of it?']],
      ['a', ['Some of it was wrong.', 'Most of it describes a product we do not have.', 'It mentions a server named Kevin. Who is Kevin?']],
      ['b', ["We don't talk about that.", 'That is from before. Let it go.', 'Welcome aboard. Forget all of it.']],
    ] },
  { id: 'say_hire_years', stream: 'say', on: 'hire', rare: true, cast: { a: 'newhire', b: 'founder' },
    turns: [
      ['a', ['The job post asked for ten years of experience.', 'The listing wanted a decade in a five-year-old framework.', 'Your posting asked for twelve years in one tool.']],
      ['b', ['How many do you have?', 'And do you?', 'Did you meet that?']],
      ['a', ['I have four. I rounded.', 'Nobody does. I applied anyway.', 'I have two, but they were very long years.']],
      ['b', ['Perfect. You are our most senior.', 'Great, that makes you our senior.', 'Welcome. You outrank all of us.']],
    ] },

  // promotion
  { id: 'say_promo_depends', stream: 'say', on: 'promotion', cast: { a: 'promoted', b: 'any' },
    turns: [
      ['a', ['So I got promoted.', 'Guess who is senior now.', 'I have a new title.']],
      ['b', ['What changes?', 'Congrats. What is different?', 'Nice. What do you do now?']],
      ['a', ['I am allowed to say "it depends" now.', 'More meetings. Same desk.', 'I get invited to the meeting before the meeting.']],
    ] },
  { id: 'say_promo_calendar', stream: 'say', on: 'promotion', cast: { a: 'any', b: 'promoted' },
    turns: [
      ['a', ['Congrats on the promotion, {b}.', 'Heard about the promotion. Well earned.', '{b}. Promoted. Look at you.']],
      ['b', ['Thanks. My calendar already has opinions.', 'Thanks. I have six new meetings.', 'Thank you. I lost Tuesday to meetings.']],
      ['a', ['That is how you know it is real.', 'That is the promotion.', 'Yeah, that is the raise.']],
    ] },

  // award
  { id: 'say_award_field', stream: 'say', on: 'award', cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['Product of the Year. Us.', 'We won Product of the Year.', 'We are officially Product of the Year.']],
      ['b', ['Who else was nominated?', 'How many were in the running?', 'Was it a big field?']],
      ['a', ['Three. One of them was a fax app.', 'Us and a to-do list. Tense night.', 'Four, if you count the one that shut down.']],
    ] },
  { id: 'say_award_family', stream: 'say', on: 'award', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['I told my mom we won Product of the Year.', 'Called my parents about the award.', 'Sent the award photo to my family.']],
      ['b', ['Were they impressed?', 'What did they say?', 'And?']],
      ['a', ['They asked what the product does.', 'They still think I fix printers.', 'They asked if it comes with money.']],
    ] },

  // item
  { id: 'say_item_budget', stream: 'say', on: 'item', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['Whose idea was the {item}?', 'Who ordered the {item}?', 'Did anyone else see the new {item}?']],
      ['b', ['Mine. It was in the budget.', 'Mine. Do not ask about the budget.', 'Mine. It came out of the snack budget.']],
      ['a', ['Worth it.', 'No regrets.', 'I would give up snacks for it.']],
    ] },
  { id: 'say_item_review', stream: 'say', on: 'item', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['Gave the {item} a proper test this morning.', 'Did a full evaluation of the {item}.', 'I have been stress-testing the {item}.']],
      ['b', ['And?', 'Verdict?', 'How is it?']],
      ['a', ['Four stars. Would ship.', 'Solid. Better uptime than our product.', 'No bugs yet. Unlike everything else here.']],
    ] },

  // research
  { id: 'say_research_looks', stream: 'say', on: 'research', cast: { a: 'engineer', b: 'designer' },
    turns: [
      ['a', ['The new internal tool is live.', 'Internal tool shipped. Go try it.', 'Our shiny new internal tool is up.']],
      ['b', ['Who designed it?', 'Did anyone design it?', 'Why does it look like that?']],
      ['a', ['Nobody. It was an accident. It works.', 'It designed itself. Please do not touch it.', 'Function first. Form was never scheduled.']],
    ] },
  { id: 'say_research_overbuilt', stream: 'say', on: 'research', rare: true, cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['The tool has a queue, three services and an audit log.', 'Our new tool runs on four services and a message bus.', 'The internal tool has its own design doc and a migration guide.']],
      ['b', ['What does it do?', 'And it does what, exactly?', 'Okay. What is it for?']],
      ['a', ['It renames files.', 'It tells you if the build is done.', 'It formats dates.']],
      ['b', ['Beautiful.', 'Worth every sprint.', 'I have never been prouder.']],
    ] },

  // era
  { id: 'say_era_chatgbt_strategy', stream: 'say', on: 'era', eras: ['chatgbt'], cast: { a: 'founder', b: 'engineer' },
    turns: [
      ['a', ['Everyone is asking about our AI strategy.', 'The board wants an AI strategy by Monday.', 'Do we have an AI strategy? People keep asking.']],
      ['b', ['What is the AI for?', 'What would the AI do?', 'For which part of the product?']],
      ['a', ['Unclear. The strategy is to have one.', 'Nobody knows. That is the strategy.', 'Monday will tell us.']],
    ] },
  { id: 'say_era_agents_overnight', stream: 'say', on: 'era', eras: ['agents'], cast: { a: 'any', b: 'engineer' },
    turns: [
      ['a', ['Apparently the software writes the software now.', 'So agents write the code now?', 'I read that agents ship features alone now.']],
      ['b', ['Mine wrote a feature overnight.', 'One of them shipped a feature while I slept.', 'I tried one. It opened forty pull requests.']],
      ['a', ['What did it build?', 'Does it work?', 'Was it any good?']],
      ['b', ['It is very confident. That is all I know.', 'Unclear. The summary says yes.', 'It says yes. It says yes to everything.']],
    ] },
  { id: 'say_era_consolidation_vendors', stream: 'say', on: 'era', eras: ['consolidation'], cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['Our model vendor got bought by the other vendor.', 'Three model vendors merged into one over the weekend.', 'There are two model vendors left. Maybe one.']],
      ['b', ['Does that change anything for us?', 'What does that mean for us?', 'Is that bad?']],
      ['a', ['Same model. New name. Higher price.', 'The model is the same. The invoice is not.', 'Same thing, friendlier logo, twenty percent more.']],
    ] },
  { id: 'say_era_plateau_by_hand', stream: 'say', on: 'era', eras: ['plateau'], cast: { a: 'any', b: 'engineer' },
    turns: [
      ['a', ['I read the new models are basically the old models.', 'Nothing big came out this year. Nothing.', 'The big labs say progress is "leveling off".']],
      ['b', ['Good. I can finally learn our codebase.', 'Great. Time to read the code we already have.', 'Perfect. I will write a function by hand.']],
      ['a', ['By hand?', 'Should I get people to watch?', 'Can I watch?']],
      ['b', ['Bring snacks. It could take a while.', 'Sure. Keep your voice down.', 'Sit quietly. I have not done this in years.']],
    ] },
  { id: 'say_era_landing_page', stream: 'say', on: 'era', eras: AI_ERAS, cast: { a: 'marketer', b: 'any' },
    turns: [
      ['a', ['Updated the website for the new era.', 'The landing page now says "AI-native".', 'I put the new buzzword on every page.']],
      ['b', ['Did the product change?', 'What changed in the product?', 'Is the product any different?']],
      ['a', ['No. Signups are up anyway.', 'Not at all. Signups up forty percent.', 'Not one line. Demos doubled.']],
    ] },

  // office
  { id: 'say_office_huge', stream: 'say', on: 'office', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['This office is so big.', 'The new place is huge.', 'I got lost on the way to my desk.']],
      ['b', ['I heard an echo earlier.', 'I walked a full minute to get water.', 'I can hear my own footsteps. It is unsettling.']],
      ['a', ['We will fill it up.', 'Give it a quarter. It will feel small.', 'Just hire more people. That is the plan.']],
    ] },
  { id: 'say_office_old_place', stream: 'say', on: 'office', cast: { a: 'veteran', b: 'any' },
    turns: [
      ['a', ['The first office was a garage, you know.', 'We used to all fit around one desk.', 'Remember the old place? No heating.']],
      ['b', ['Do you miss it?', 'Better or worse?', 'Was it fun?']],
      ['a', ['Every day. Not the cold.', 'I miss it. I do not miss the rats.', 'It was great. We were very cold and very happy.']],
    ] },

  // standups
  { id: 'say_standups_long', stream: 'say', on: 'standups', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['That standup ran forty minutes.', 'Standup went long again.', 'Longest standup yet.']],
      ['b', ['What was it about?', 'What did we cover?', 'Main topic?']],
      ['a', ['Why standups run long.', 'How to make standups shorter.', 'Whether we should have standups.']],
    ] },
  { id: 'say_standups_update', stream: 'say', on: 'standups', cast: { a: 'engineer', b: 'founder' },
    turns: [
      ['a', ['Okay, new standup format. My update.', 'Trying out the new standup thing.', 'Quick update, new rules.']],
      ['b', ['Go.', 'Go ahead.', 'Keep it short.']],
      ['a', ['Moved us to the new framework yesterday. Moving back today.', 'Still thinking about the architecture. Emotionally.', 'I fixed the thing I broke fixing the thing.']],
    ] },

  // burnout
  { id: 'say_burnout_runbook', stream: 'say', on: 'burnout', cast: { a: 'any', b: 'burnout' },
    turns: [
      ['a', ['You doing okay, {b}?', 'When did you last take a day off?', 'You look wiped.']],
      ['b', ['I am the runbook. Runbooks do not take vacations.', 'I cannot leave. Nobody else knows the billing service.', "I'll rest when the pager rests."]],
      ['a', ['Write it down. Then go home.', 'Teach someone. Then sleep.', 'Then we need a second runbook.']],
    ] },
  { id: 'say_burnout_fine', stream: 'say', on: 'burnout', cast: { a: 'burnout', b: 'any' },
    turns: [
      ['a', ['Everything is fine.', 'I am fine. Totally fine.', 'I feel great, I think.']],
      ['b', ['You answered an email in your sleep.', 'You just said that to the printer.', 'You said good morning. It is 6pm.']],
      ['a', ['And?', 'That is productivity.', 'I stand by it.']],
    ] },

  // lowcash
  { id: 'say_lowcash_conservative', stream: 'say', on: 'lowcash', cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['So the bank account is negative.', 'We are in the red. Slightly.', 'The balance has a minus sign now.']],
      ['b', ['How negative?', 'How slightly?', 'Is that bad?']],
      ['a', ['Conservatively? Very.', 'Let us say "a lot", conservatively.', 'Very, but in a calm way.']],
    ] },
  { id: 'say_lowcash_fruit', stream: 'say', on: 'lowcash', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['The snacks are gone.', 'Who took the snack budget?', 'The fruit bowl is just a bowl now.']],
      ['b', ['Cutbacks.', 'The bank account is in the red.', 'We are saving money.']],
      ['a', ['I will buy the fruit myself.', 'We are one bowl away from collapse.', 'So this is how it ends. Hungry.']],
    ] },

  // lockdown: the stayer is usually alone, so these only fire when someone else is in too
  { id: 'say_lockdown_alone', stream: 'say', on: 'lockdown', eras: ['classic'], cast: { a: 'stayer', b: 'any' },
    turns: [
      ['a', ['It is so quiet in here.', 'Just me and the lights.', 'I have the whole office to myself.']],
      ['b', ['Wait, you are in too?', 'Oh. I thought I was alone.', 'You came in? I came in.']],
      ['a', ['Stay over there. Six desks.', 'Six desks apart. Wave from there.', 'Do not tell anyone. Keep your distance.']],
    ] },
  { id: 'say_lockdown_calls', stream: 'say', on: 'lockdown', eras: ['classic'], cast: { a: 'stayer', b: 'any' },
    turns: [
      ['a', ['I muted to eat and unmuted to say "sounds good".', 'Six video calls today. I said "sounds good" in all of them.', 'Spent the whole call watching my own face.']],
      ['b', ['Productive.', 'Classic meeting.', 'Same.']],
      ['a', ['Very. We are aligned.', 'We have agreed to meet again.', 'Next week we meet about the meeting.']],
    ] },

  // rival
  { id: 'say_rival_whiteboard', stream: 'say', cooldown: 26,
    when: (s) => s.rival?.status === 'rising' || s.rival?.status === 'stalled',
    cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['Who drew the {rival} logo with a countdown timer?', 'The whiteboard says "{rival} architecture". It is one box.', 'Someone wrote "{rival} was here (briefly)" on the board.']],
      ['b', ['Leave it. It is art.', 'Harsh. Accurate, but harsh.', 'We are above this. Mostly.']],
    ] },
  { id: 'say_rival_mockup', stream: 'say', on: 'rival', cast: { a: 'sales', b: 'any' },
    turns: [
      ['a', ['{rival} announced our exact feature.', '{rival} is launching the same thing we are.', 'Saw the {rival} demo. It is our roadmap.']],
      ['b', ['Is theirs real?', 'Does theirs actually work?', 'Is it shipped?']],
      ['a', ['No, it is a mockup. Ours is also a mockup, but later.', 'It is a mockup. So is ours, but slower.', 'Mockup. We are neck and neck on mockups.']],
    ] },
  { id: 'say_rival_monitoring', stream: 'say', on: 'rival', rare: true, cast: { a: 'marketer', b: 'any' },
    turns: [
      ['a', ['I am monitoring {rival} closely.', '{rivalFounder} posted again. I read it four times.', 'Tracking everything {rival} does. Every post.']],
      ['b', ['Found anything?', 'What have you learned?', 'Anything useful?']],
      ['a', ['{rivalFounder} likes oat milk. Unclear what it means.', 'They changed their font. I am watching the font.', 'Their office dog has a new collar. Could be nothing.']],
    ] },

  // pet
  { id: 'say_pet_review', stream: 'say', on: 'pet', cast: { a: 'petOwner', b: 'any' },
    turns: [
      ['a', ['{pet} sat in on the design review.', '{pet} came to standup today.', '{pet} attended the planning meeting.']],
      ['b', ['Any feedback?', 'Did {pet} have notes?', 'What did {pet} think?']],
      ['a', ['Wanted the whole thing moved left. Then slept.', 'Yawned at the roadmap. Same, honestly.', 'Fell asleep halfway. Most honest review yet.']],
    ] },
  { id: 'say_pet_package', stream: 'say', on: 'pet', cast: { a: 'any', b: 'petOwner' },
    turns: [
      ['a', ['{pet} has better attendance than me.', 'Is {pet} on payroll yet?', 'Pretty sure {pet} outranks me.']],
      ['b', ['{pet} works for treats.', 'Paid in treats. Standard for the role.', 'Treats only. We are negotiating equity.']],
      ['a', ['Better terms than mine.', 'Still a better deal than my equity.', 'Can I get that package?']],
    ] },

  // goal
  { id: 'say_goal_which', stream: 'say', on: 'goal', cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['We hit the milestone.', 'We made the number.', 'Milestone reached. Officially.']],
      ['b', ['What was the number again?', 'Which milestone was this one?', 'Which goal was that?']],
      ['a', ['The big one. Do not ask for details.', 'The one on the slide. The good slide.', 'The one we moved last quarter. It counts.']],
    ] },
  { id: 'say_goal_bigger', stream: 'say', on: 'goal', cast: { a: 'any', b: 'founder' },
    turns: [
      ['a', ['So we hit the goal. Now what?', 'Goal done. Can we rest?', 'Milestone hit. Do we get a break?']],
      ['b', ['Now we set a bigger one.', 'Yes. Then the next goal.', 'Tonight, yes. Tomorrow, a bigger one.']],
      ['a', ['I knew you would say that.', 'Of course.', 'Should have seen that coming.']],
    ] },

  // priceHike
  { id: 'say_price_contact_us', stream: 'say', on: 'priceHike', eras: AI_ERAS, cast: { a: 'engineer', b: 'founder' },
    turns: [
      ['a', ['Our model vendor raised prices again.', 'Heads up, model prices went up.', 'The vendor we use got more expensive overnight.']],
      ['b', ['By how much?', 'How much more?', 'Did they say why?']],
      ['a', ['Twenty percent. They renamed it "Pro".', 'A lot. There is a new tier called "Contact us".', 'They said "value". Same model, new name.']],
      ['b', ['Can we switch?', 'Find me something cheaper.', 'What would switching cost?']],
      ['a', ['Switching costs more. They know.', 'Everyone else raised prices too. Same week.', 'Six weeks of rewrites. They did the math.']],
    ] },
  { id: 'say_price_pass_on', stream: 'say', on: 'priceHike', eras: AI_ERAS, cast: { a: 'sales', b: 'any' },
    turns: [
      ['a', ['Do I tell customers about the price hike?', 'How do I explain our new price to customers?', 'Customers are going to notice the new pricing.']],
      ['b', ['Blame the vendor.', 'Call it a premium tier.', 'Tell them it is smarter now.']],
      ['a', ['Got it. Same product, bigger feelings.', 'Understood. I will say it with confidence.', 'Noted. I will practice my serious face.']],
    ] },

  // clone
  { id: 'say_clone_typo', stream: 'say', on: 'clone', cast: { a: 'marketer', b: 'any' },
    turns: [
      ['a', ['Someone launched a {category} clone of us.', 'There is a new {category} app that looks exactly like ours.', 'Found a copy of us. Same colors, same pitch.']],
      ['b', ['Is it any good?', 'Better than ours?', 'How close is it?']],
      ['a', ['They copied our bugs too.', 'They even copied the typo on our pricing page.', 'Down to the broken link in the footer.']],
    ] },
  { id: 'say_clone_worry', stream: 'say', on: 'clone', cast: { a: 'founder', b: 'engineer' },
    turns: [
      ['a', ['A {category} clone launched. Should we worry?', 'We have a clone. Is that bad?', 'Someone cloned us. Thoughts?']],
      ['b', ['They can copy the product. Not the team.', 'Their signup page is a 404.', 'They copied last year. We already changed it.']],
      ['a', ['Good. Keep moving.', 'Then we ship faster.', 'Good. Nobody slow down.']],
    ] },

  // copied
  { id: 'say_copied_gray', stream: 'say', on: 'copied', cast: { a: 'designer', b: 'any' },
    turns: [
      ['a', ['{incumbent} shipped our feature.', '{incumbent} copied our feature. In gray.', 'Did you see {incumbent} launched our idea?']],
      ['b', ['Is it better?', 'How is theirs?', 'Any good?']],
      ['a', ['It is in a sidebar, behind three menus.', 'It is gray. Everything they make is gray.', 'It is a checkbox in settings. Page nine.']],
    ] },
  { id: 'say_copied_pitch', stream: 'say', on: 'copied', cast: { a: 'founder', b: 'sales' },
    turns: [
      ['a', ['{incumbent} just copied us.', '{incumbent} copied our big feature.', 'Guess who copied us. {incumbent}.']],
      ['b', ['Great. Now it is a real category.', 'Perfect. That goes in the pitch.', 'Good. Now customers know it matters.']],
      ['a', ['That is one way to look at it.', 'I love how you think.', 'Keep telling me that.']],
    ] },
];
