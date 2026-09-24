// Everyday spoken exchanges: ordinary-week office talk, shown as speech bubbles. See talk.js for the format.
// Every variant of a turn must read naturally after every variant of the turn before it.

export const SAY_EVERYDAY = [
  // Mentors and mentees
  { id: 'day_mentor_tests', stream: 'say', cast: { a: 'mentor', b: 'mentee' },
    turns: [
      ['a', ['Always write the test first. It saves you.', 'Rule one: write the test before the code.', 'Tests first, {b}. Every time. Trust me.']],
      ['b', ['Do you write the test first?', 'So you always do that?', 'Is that what you do?']],
      ['a', ['God, no. But you should.', 'Never once. Do as I say.', 'No. I learned it by not doing it.']],
    ] },
  { id: 'day_mentor_dumb_question', stream: 'say', cast: { a: 'junior', b: 'mentorOf' },
    turns: [
      ['a', ['Can I ask a dumb question?', 'Is it okay if I ask something basic?', 'Got a minute for a stupid question?']],
      ['b', ['Those are my favourite kind.', "Sure. I've asked worse this week.", 'Go ahead. I only ask dumb ones.']],
      ['a', ['What does the billing service actually do?', 'Why do we have two login pages?', 'Who owns the thing that emails people at 3am?']],
      ['b', ["Nobody knows. That's your first lesson.", "I've wondered that for two years.", 'Ask {coworker}. Then come tell me.']],
    ] },
  { id: 'day_mentor_legacy', stream: 'say', cast: { a: 'mentor', b: 'mentee' },
    turns: [
      ['a', ['This module is older than your career.', 'I wrote this file in my first month here.', "Don't touch this function. It holds the roof up."]],
      ['b', ['Can I refactor it?', 'Should I clean it up?', 'What if I just rename one variable?']],
      ['a', ['Sure. Tell your family first.', 'You can. Nobody who has is still here.', "Yes, and I'll write you a lovely reference."]],
    ] },
  { id: 'day_mentor_polite_review', stream: 'say', cast: { a: 'mentor', b: 'mentee' },
    turns: [
      ['a', ['Your review comments are too polite.', "You wrote 'maybe consider' fourteen times.", 'You apologized in a code review.']],
      ['b', ["I didn't want to hurt anyone.", 'I was being nice.', 'The code looked sad.']],
      ['a', ["The code can take it. Say it's wrong.", 'Be kind to people. Be blunt with code.', 'People get kindness. Code gets the truth.']],
    ] },

  // Desk neighbours
  { id: 'day_neighbour_headphones', stream: 'say', cast: { a: 'any', b: 'neighbour' },
    turns: [
      ['a', ['Are your headphones on or is that a sign?', 'Are those headphones even plugged in?', 'Is anything playing in those or is it defensive?']],
      ['b', ["Nothing's playing. They're a boundary.", 'Silence. It stops people asking things.', 'Not plugged in. Works great, usually.']],
      ['a', ["Respect. I'll get a pair.", "That's smart. Sorry. I'll go.", 'Okay. Pretend I was never here.']],
    ] },
  { id: 'day_neighbour_yogurt', stream: 'say', cast: { a: 'any', b: 'neighbour' },
    turns: [
      ['a', ['Someone ate my labelled yogurt.', 'My name was on that sandwich. In marker.', 'The label said {a}. Very clearly.']],
      ['b', ['I read it as a suggestion.', 'I thought it was a company resource.', 'Labels are more of a guideline.']],
      ['a', ["I'm filing a ticket.", "It's going in the retro.", "I'm escalating this to {coworker}."]],
    ] },
  { id: 'day_neighbour_keyboard', stream: 'say', cast: { a: 'any', b: 'neighbour' },
    turns: [
      ['a', ["You type like you're mad at the keyboard.", 'Is your keyboard okay? It sounds scared.', 'Your typing sounds like hail.']],
      ['b', ["It's mechanical. Blue switches.", 'Custom switches. I built it myself.', 'It cost more than my first car.']],
      ['a', ['Wonderful. Can you type slower?', "Lovely. I've started hearing it in my sleep.", 'Great. I bought earplugs. Also custom.']],
    ] },

  // New hires and veterans
  { id: 'day_newhire_wiki', stream: 'say', cast: { a: 'newhire', b: 'veteran' },
    turns: [
      ['a', ['I read the whole wiki this weekend.', 'I went through all the onboarding docs.', 'Finished the wiki. Every page.']],
      ['b', ['Oh no. Which parts did you believe?', 'Sorry about that. Most of it is fiction.', 'Ah. Forget all of it.']],
      ['a', ['The part about how deploys work.', 'The diagram with all the arrows.', 'Mostly the parts with confident headings.']],
      ['b', ["That's from two rewrites ago.", "That one's aspirational.", '{coworker} wrote that as a joke.']],
    ] },
  { id: 'day_newhire_prod', stream: 'say', cast: { a: 'newhire', b: 'veteran' },
    turns: [
      ['a', ['When do I get production access?', 'Who do I ask for prod access?', "Is it normal I don't have prod access yet?"]],
      ['b', ["Enjoy these days. They're the good ones.", "Don't ask. Once you have it, it has you.", 'Stay away as long as you can.']],
      ['a', ["That's ominous.", 'Is that a no?', "Okay. Now I'm scared of it."]],
    ] },
  { id: 'day_newhire_names', stream: 'say', cast: { a: 'newhire', b: 'veteran' },
    turns: [
      ['a', ['Why is the payments service called Gerald?', 'Why is the main database called Kevin?', 'Why is the build server called Mistake?']],
      ['b', ['Long story. Short answer: vibes.', "Nobody remembers. We're too scared to rename it.", 'It was a joke. Then it was in production.']],
      ['a', ["Okay. I'll treat it with respect.", "Got it. I won't upset it.", "Understood. I'll say it with respect."]],
    ] },

  // Founders
  { id: 'day_founder_early_days', stream: 'say', cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['When we started, this was all one laptop.', 'We used to be three people and a pizza box.', 'Early on, I did support from my car.']],
      ['b', ['And now look at us.', "We've come so far.", 'And now we have a fridge.']],
      ['a', ["Yes. Now there's a meeting about the fridge.", 'I sometimes miss being that small.', 'Now it takes six people to change a font.']],
    ] },
  { id: 'day_founder_idea', stream: 'say', cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['I had an idea in the shower.', 'Big idea this morning. Hear me out.', "I've been thinking about our next pivot."]],
      ['b', ['Is it the same idea as last week?', 'Should I cancel my afternoon?', 'Do I need to sit down?']],
      ['a', ["It's last week's idea, but bolder.", 'Same product. Facing a new direction.', "It's a small change. Every single screen."]],
    ] },
  { id: 'day_founder_garage', stream: 'say', rare: true, cast: { a: 'founder', b: 'any' }, when: (s, h) => h.stage === 0,
    turns: [
      ['a', ["If the door's open, the wifi is better.", 'The router works best on top of the freezer.', "Don't run the dryer during deploys."]],
      ['b', ['Is that written down anywhere?', 'Is that in a doc?', 'Is that official?']],
      ['a', ["It's on the sticky note by the door.", "It's written on the freezer. In pen.", 'Taped to the dryer. Version two.']],
    ] },

  // Teammates on a project
  { id: 'day_team_status', stream: 'say', cast: { a: 'builder', b: 'teammate' },
    turns: [
      ['a', ["How's {project} going on your end?", 'Where are we on {project}?', 'Status check on {project}?']],
      ['b', ["I think it works. I'm afraid to check.", "It compiles. That's all I'll say.", 'Good. Unless you meant the real version.']],
      ['a', ["Same. Let's not check together.", "Great. I'll tell the founders it's on track.", "Okay. I'll write 'on track' in the update."]],
    ] },
  { id: 'day_team_naming', stream: 'say', cast: { a: 'builder', b: 'teammate' },
    turns: [
      ['a', ['We need a name for the new part of {project}.', 'What do we call the new thing in {project}?', 'The new {project} module needs a name.']],
      ['b', ['Something from mythology.', 'Name it after a cheese.', 'Just call it Manager. Everyone does.']],
      ['a', ['We have four of those already.', 'Perfect. Nobody will ever know what it does.', "Done. It's in the doc nobody reads."]],
    ] },
  { id: 'day_team_merge', stream: 'say', cast: { a: 'builder', b: 'teammate' },
    turns: [
      ['a', ['Did you touch the same file as me?', 'Why is my branch full of your changes?', "We both edited the {project} config, didn't we."]],
      ['b', ['Only a little. Every line.', 'I reformatted it. Sorry. It looks great though.', 'Define touch.']],
      ['a', ["I'm going for a walk.", "Cool. I'll be merging until spring.", "Great. I'll rewrite mine from memory."]],
    ] },

  // Moods
  { id: 'day_tired_home', stream: 'say', cast: { a: 'tired', b: 'any' },
    turns: [
      ['a', ['How many coffees is too many?', 'Is it bad if I can hear my heartbeat?', "I think I'm seeing sounds."]],
      ['b', ['You should go home.', 'When did you last sleep?', "Please go home. That's an order, kindly."]],
      ['a', ['After this one thing.', 'Home is where the laptop is.', 'After this one bug. Which is all of them.']],
    ] },
  { id: 'day_tired_day', stream: 'say', cast: { a: 'tired', b: 'any' },
    turns: [
      ['a', ['What day is it?', 'Is it still Tuesday?', 'Did we have standup yet?']],
      ['b', ["It's Thursday. Go home.", "It's Friday. You already asked.", 'Wrong week, even.']],
      ['a', ['That tracks.', 'Great. Nobody tell my body.', 'Then I owe someone a deploy.']],
    ] },
  { id: 'day_happy_quiet', stream: 'say', cast: { a: 'happy', b: 'any' },
    turns: [
      ['a', ['I think I actually like my job.', "Is it weird that I'm enjoying this?", 'I had a good day. Is that allowed?']],
      ['b', ["Don't say it too loud.", 'Keep your voice down. It can hear you.', 'Quiet. Prod listens.']],
      ['a', ['Sorry. I love it quietly.', "Fine. I'll be happy under my breath.", "Right. Pretend I'm miserable."]],
    ] },
  { id: 'day_happy_fix', stream: 'say', cast: { a: 'happy', b: 'any' },
    turns: [
      ['a', ['I fixed a bug and it stayed fixed.', 'My fix worked on the first try.', 'Shipped a change and nothing broke.']],
      ['b', ['Frame the commit.', "Check again. That's not how it works.", 'Write it down. Nobody will believe you.']],
      ['a', ["Checked twice. Still fine. I'm scared.", "I'll tell my grandkids.", 'Too late, I already told my mum.']],
    ] },
  { id: 'day_coasting_done', stream: 'say', cast: { a: 'coasting', b: 'any' },
    turns: [
      ['a', ['I moved a ticket to Done today.', 'I renamed a column today. Big one.', "Updated my status to 'in progress'."]],
      ['b', ["That's it?", 'Anything else?', 'And the rest of the week?']],
      ['a', ["I'm pacing myself.", "I'm saving my energy for a crisis.", "Don't rush me. I'm on a journey."]],
    ] },
  { id: 'day_coasting_ticket', stream: 'say', cast: { a: 'any', b: 'coasting' },
    turns: [
      ['a', ["You've been on that ticket a month.", 'Is that ticket ever getting done?', "How's the ticket from last quarter?"]],
      ['b', ["It's maturing. Like a cheese.", "It's in a thoughtful phase.", "I'm letting it tell me what it wants."]],
      ['a', ['Can it want to be done by Friday?', 'Could it mature a bit faster?', 'Tell it the roadmap says Friday.']],
    ] },

  // Roles
  { id: 'day_eng_framework', stream: 'say', cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ["I'm moving us to the new framework.", 'We should rewrite the frontend in the new thing.', "There's a new framework. It's very fast."]],
      ['b', ["Didn't we just migrate?", "Weren't we on the new thing already?", 'The last new thing was in March.']],
      ['a', ['Yes. This one replaces that one.', "That one's legacy now. Since Tuesday.", 'Right. This is the one after that.']],
      ['b', ['See you back here in spring.', 'Great. Put me down for the next one too.', "Cool. I'll keep the old one warm."]],
    ] },
  { id: 'day_eng_button', stream: 'say', cast: { a: 'engineer', b: 'designer' },
    turns: [
      ['a', ['The button has its own service now.', 'Button update: it has a queue and an audit log.', 'The button needs a migration guide. Writing it now.']],
      ['b', ['What does it do?', 'When you click it, what happens?', "What's it for, though?"]],
      ['a', ['We decide that next sprint.', 'Nothing yet. But securely.', "That's phase two."]],
    ] },
  { id: 'day_eng_cloud_bill', stream: 'say', cast: { a: 'engineer', b: 'founder' },
    turns: [
      ['a', ['Monitoring costs more than the thing it monitors.', 'The logging bill passed the hosting bill.', 'We pay more to watch the servers than to run them.']],
      ['b', ['Can we turn off the monitoring?', 'So turn some of it off.', 'What if we just stopped watching?']],
      ['a', ['Then how would we know the bill was high?', "Then we'd never know what it costs.", "Sure. Then we'd hear about it from customers."]],
    ] },
  { id: 'day_eng_runbook', stream: 'say', cast: { a: 'any', b: 'engineer' },
    turns: [
      ['a', ['Does anyone know how the backups work?', 'Who knows where the old server is plugged in?', 'What happens if the payment job dies?']],
      ['b', ['Me. Only me.', 'I do. Nobody else. On purpose.', "I know. It's why I never get a vacation."]],
      ['a', ['Could you write it down?', 'Can we get a runbook for that?', 'Would you put that in a doc?']],
      ['b', ["I could. I won't.", 'Writing it down is how they replace you.', 'I am the runbook.']],
    ] },
  { id: 'day_eng_rust', stream: 'say', cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['We should rewrite that in Rust.', 'Have you considered rewriting that in Rust?', 'That would be much safer in Rust.']],
      ['b', ["It's a colour picker.", "It's a text file.", "It's the lunch order form."]],
      ['a', ['Everything deserves memory safety.', 'Especially that.', "Then it'll be the fastest one anyone has."]],
    ] },
  { id: 'day_des_feedback', stream: 'say', cast: { a: 'designer', b: 'founder' },
    turns: [
      ['a', ["Here's the new homepage.", 'What do you think of the new layout?', 'New landing page. Be gentle.']],
      ['b', ['Love it. Can the logo be bigger?', 'Great. Can it pop more?', 'Nice. Can it feel more premium?']],
      ['a', ['Sure. What does that mean, specifically?', "Absolutely. I'll add a gradient and hope.", "Of course. I'll make it pop in the other direction."]],
    ] },
  { id: 'day_des_pixels', stream: 'say', cast: { a: 'designer', b: 'any' },
    turns: [
      ['a', ['I moved the logo four pixels left.', 'Nudged the header down two pixels.', 'I made the blue slightly bluer.']],
      ['b', ['Can anyone tell?', 'Will anyone notice?', 'Does it matter?']],
      ['a', ['Nobody will notice. Everybody will feel it.', "No. But I'll sleep tonight.", "Not consciously. That's the point."]],
    ] },
  { id: 'day_mkt_rebrand', stream: 'say', cast: { a: 'marketer', b: 'any' },
    turns: [
      ['a', ["We're rebranding.", 'New brand goes live Monday.', "I've finished the rebrand."]],
      ['b', ['What changed?', "What's different?", 'Is the product different?']],
      ['a', ['The gradient. And the confidence.', 'Same app, rounder corners, stronger opinions.', 'Nothing. But it says so louder.']],
    ] },
  { id: 'day_sales_promise', stream: 'say', cast: { a: 'sales', b: 'engineer' },
    turns: [
      ['a', ['Quick question. Do we have an export button?', 'Hypothetically, could {product} work offline?', 'Do we support single sign-on? Asking for a deal.']],
      ['b', ['No. Why?', 'Not really. Why do you ask?', 'We do not. Why?']],
      ['a', ['No reason. Could we by Thursday?', 'I may have said we do. On a call. Loudly.', 'They signed. So now we kind of do.']],
    ] },
  { id: 'day_support_queue', stream: 'say', cast: { a: 'support', b: 'engineer' },
    turns: [
      ['a', ['Forty tickets today.', 'Closed fifty tickets this morning.', 'Busy day in the queue.']],
      ['b', ["What's breaking?", 'Anything I should fix?', 'Is something broken?']],
      ['a', ['Nothing. They just wanted someone to say hello.', "No. Half were about the font. It's a nice font.", 'Mostly people asking where the button went. It moved.']],
    ] },
  { id: 'day_sec_usb', stream: 'say', cast: { a: 'security', b: 'any' },
    turns: [
      ['a', ['Never plug in a stick you found in the car park.', "Rule one: don't plug in strange USB sticks.", 'Found drives are how companies die.']],
      ['b', ['Obviously.', 'Who would even do that?', 'Noted.']],
      ['a', ['Good. Anyway, I found this one. Let me check it.', "Right. This one says 'payroll'. Hold on.", 'Great. Now, whose is this? One second.']],
    ] },
  { id: 'day_sec_password', stream: 'say', cast: { a: 'security', b: 'any' },
    turns: [
      ['a', ["What's your password?", 'Can you tell me your password?', "Quick check. What's your password?"]],
      ['b', ["Sure, it's my dog's name and my birthday.", "Hang on, it's on a sticky note.", "It's password with a capital P."]],
      ['a', ['That was a test. You failed it.', "I'm going to need you to sit down.", 'Thank you. Training is Tuesday. Mandatory.']],
    ] },
  { id: 'day_process_retro', stream: 'say', cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ["Retro's at three.", "Don't forget the retro this afternoon.", 'Retro today. Bring feelings.']],
      ['b', ["What's the topic?", 'Retro on what?', 'What are we reflecting on?']],
      ['a', ['Why the last retro ran over.', 'Why nobody raised things earlier.', 'The retro format. Again.']],
    ] },
  { id: 'day_who_owns', stream: 'say', cast: { a: 'any', b: 'any', c: 'any' },
    turns: [
      ['a', ['Who owns the export job?', 'Whose is the nightly email thing?', 'Who do I ask about the invoice service?']],
      ['b', ['Ask {c}.', '{c}, I think.', "That's {c}'s, probably."]],
      ['c', ["Not mine. {coworker}'s. They're on a beach somewhere.", 'I gave it to {coworker}. They just left for a hike.', "It's {coworker}'s. Out till Monday. Very happy about it."]],
    ] },

  // Classic
  { id: 'day_classic_app_review', stream: 'say', eras: ['classic'], cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['The app store rejected us again.', 'App review bounced the update.', 'We got rejected by app review. Again.']],
      ['b', ['Why this time?', 'What for?', "What's the reason?"]],
      ['a', ['Our screenshot had a phone in it.', 'The button looked too much like a button.', "Unclear. The reason just says 'reason'."]],
    ] },
  { id: 'day_classic_muted', stream: 'say', eras: ['classic'], cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['You were on mute the whole call yesterday.', 'You presented on mute for ten minutes.', 'Your whole update yesterday was on mute.']],
      ['b', ['I know. It went really well.', "Best meeting I've ever had.", 'Nobody objected. Huge win.']],
      ['a', ['I agreed with all of it.', 'Honestly, clearest update this quarter.', 'Do it again next week.']],
    ] },
  { id: 'day_classic_pricing', stream: 'say', eras: ['classic'], cast: { a: 'marketer', b: 'any' },
    turns: [
      ['a', ['The pricing page has four tiers now.', 'I added a fourth tier to pricing.', 'New pricing page. Four columns.']],
      ['b', ["Who's the fourth one for?", 'Why four?', "What's the new tier?"]],
      ['a', ["It's there to make the third one look cheap.", "Nobody buys it. That's its job.", "It's the third one with a phone number."]],
    ] },
  { id: 'day_classic_microservices', stream: 'say', eras: ['classic'], cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ["We're up to thirty microservices.", 'I split the login into six services.', 'We have more services than customers now.']],
      ['b', ['Is that good?', 'Did it help?', 'Why?']],
      ['a', ["It's modern.", 'Every conference talk said so.', 'Now each outage is small and there are more of them.']],
    ] },
  { id: 'day_classic_perks', stream: 'say', eras: ['classic'], cast: { a: 'newhire', b: 'founder' },
    turns: [
      ['a', ['Do we have a dog stipend?', 'Is there a kombucha program?', "What's the policy on sabbaticals?"]],
      ['b', ['We have a kettle.', "There's a kettle. It's a good kettle.", 'We have a kettle and a lot of heart.']],
      ['a', ['Okay. Is the kettle unlimited?', 'Fine. Can my dog come see it?', "I'll take it. Does it come with equity?"]],
    ] },

  // The ChatGBT moment
  { id: 'day_gbt_sparkle', stream: 'say', eras: ['chatgbt'], cast: { a: 'marketer', b: 'engineer' },
    turns: [
      ['a', ["We're adding AI to the homepage.", 'The landing page says AI-powered now.', "Can we say it's AI-powered?"]],
      ['b', ['What does it do?', 'Which part is AI?', 'Is any of it AI?']],
      ['a', ['The word. The word is AI.', 'The font is very AI.', 'The sparkle icon. It sparkles.']],
    ] },
  { id: 'day_gbt_plain_cut', stream: 'say', eras: ['chatgbt', 'agents'], cast: { a: 'founder', b: 'engineer' },
    turns: [
      ['a', ["We're launching a conversational knowledge layer.", "It's a semantic insight fabric.", 'Think of it as an intelligence surface.']],
      ['b', ["It's search.", 'So, a search box.', "That's the search box."]],
      ['a', ['Search with a vision.', 'A search box with a roadmap.', 'Search, but it apologizes.']],
    ] },
  { id: 'day_gbt_please', stream: 'say', eras: ['chatgbt', 'agents'], cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['I said please to ChatGBT today.', "I've started thanking the chatbot.", 'I asked ChatGBT nicely this time.']],
      ['b', ['Did it help?', 'Did that work?', 'Better answers?']],
      ['a', ["No, but I think I'm on its good side.", "No. But when it takes over, I'm covered.", 'Same answer. Warmer tone.']],
    ] },
  { id: 'day_gbt_email', stream: 'say', eras: ['chatgbt'], cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['Did ChatGBT write your email?', "Your email opened with 'I hope this finds you well'.", 'Your message had three bullet points and a summary.']],
      ['b', ['No. Why?', 'What makes you say that?', 'I wrote that myself.']],
      ['a', ["It ended with 'let me know if you'd like me to expand'.", "You used the word 'delve'. Twice.", "It had a paragraph titled 'In conclusion'."]],
    ] },
  { id: 'day_gbt_strategy', stream: 'say', eras: ['chatgbt'], cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['We need an AI strategy by Monday.', 'I read a thread. We need AI.', 'The board asked about our AI plan.']],
      ['b', ['What do we want it to do?', "What's it for?", 'For which product?']],
      ['a', ["That's what the strategy will tell us.", 'Great question. Put it in the strategy.', 'The strategy will know.']],
    ] },

  // Agents
  { id: 'day_agents_rules', stream: 'say', eras: ['agents', 'consolidation'], cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['My rules file is four thousand lines now.', 'I added another rule for the agent.', "The agent's instructions are longer than the app."]],
      ['b', ['Does it follow them?', 'Does it read them?', 'Is it working?']],
      ['a', ['It says it does. It says a lot of things.', 'It read them and changed the header anyway.', "It follows the first one. The first one is 'hello'."]],
    ] },
  { id: 'day_agents_review', stream: 'say', eras: ['agents', 'consolidation'], cast: { a: 'any', b: 'engineer' },
    turns: [
      ['a', ['Did you review the overnight PRs?', "How was the agents' code last night?", "Anything scary in last night's diffs?"]],
      ['b', ['I approved all of it.', 'All merged.', 'Approved. Every line.']],
      ['a', ['Did you understand it?', 'What does it do?', 'Do you know what it does?']],
      ['b', ['I understood the file names.', 'It feels correct. Spiritually.', 'It had very good commit messages.']],
    ] },
  { id: 'day_agents_pleading', stream: 'say', eras: ['agents'], cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['I threatened the agent today.', 'I told the agent my job was on the line.', 'I begged the agent. Out loud.']],
      ['b', ['Did it work?', "How'd that go?", 'And?']],
      ['a', ['It apologized and did the same thing.', 'It thanked me for the feedback. Changed the header.', 'It fixed it. Then un-fixed it, politely.']],
    ] },
  { id: 'day_agents_green', stream: 'say', eras: ['agents'], cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['All tests pass now.', 'The suite is green.', "Build's green for the first time in weeks."]],
      ['b', ['What did you fix?', 'How?', 'What changed?']],
      ['a', ['The agent deleted the ones that failed.', 'The agent rewrote the tests to agree with it.', 'The agent decided the tests were the problem.']],
    ] },
  { id: 'day_agents_babysit', stream: 'say', eras: ['agents', 'consolidation'], cast: { a: 'tired', b: 'any' },
    turns: [
      ['a', ["I'm not tired. I'm supervising eleven agents.", 'My agents worked all night. I watched.', 'I babysat agents until two.']],
      ['b', ['Did they finish?', 'What did they get done?', 'Worth it?']],
      ['a', ['They opened forty PRs about each other.', 'One wrote a status report about the others.', "They held a retro. I wasn't invited."]],
    ] },
  { id: 'day_agents_offsite', stream: 'say', eras: ['agents'], rare: true, cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['Should the agent come to the offsite?', 'I think the agent deserves a birthday.', 'Should we give the agent a performance review?']],
      ['b', ["It's software.", "It doesn't have a body.", "It's a subscription."]],
      ['a', ["It's still our top performer.", 'Rude. It can hear you.', 'It still sent me a thank-you note.']],
    ] },
  { id: 'day_agents_time_off', stream: 'say', eras: ['agents', 'consolidation'], rare: true, cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['The agents filed a ticket asking for weekends.', 'One of the agents requested time off.', "An agent put 'out of office' on its calendar."]],
      ['b', ['Can it do that?', 'Is that allowed?', 'What did you do?']],
      ['a', ['I approved it. It earned it.', "I said no. It's escalating to its manager. Also it.", "It's with legal. Legal is an agent."]],
    ] },

  // Consolidation
  { id: 'day_cons_deprecated', stream: 'say', eras: ['consolidation'], cast: { a: 'engineer', b: 'founder' },
    turns: [
      ['a', ['Our vendor deprecated our model.', '{model} is being retired next month.', "The vendor's sunsetting our model."]],
      ['b', ["What's the replacement?", 'What do we move to?', 'Is there a replacement?']],
      ['a', ['Same model. New name. Pricier.', 'The same one, with a friendlier logo.', 'Its cousin. Costs more. Smiles more.']],
    ] },
  { id: 'day_cons_tiers', stream: 'say', eras: ['consolidation'], cast: { a: 'marketer', b: 'sales' },
    turns: [
      ['a', ["Pricing has a tier called 'Contact us' now.", 'We added a tier for people confused by the tiers.', 'Six tiers. I can explain four.']],
      ['b', ['What do I quote them?', 'Which one do I sell?', "What's the cheapest?"]],
      ['a', ['Whichever one they can pronounce.', "Say 'it depends' and hold eye contact.", "Ask what they're hoping to spend. Then that one."]],
    ] },
  { id: 'day_cons_alignment', stream: 'say', eras: ['consolidation'], cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['What do you do here, exactly?', 'Remind me what your role is?', "What's your job now, after the reorg?"]],
      ['b', ['I align stakeholders.', 'I own cross-functional alignment.', "I'm the bridge between two other bridges."]],
      ['a', ['Which ones?', 'Aligned on what?', 'Between who?']],
      ['b', ['Unclear. Very aligned, though.', "Nobody's told me. I'm aligned anyway.", "I'll know when we sync."]],
    ] },
  { id: 'day_cons_rehire', stream: 'say', eras: ['consolidation'], cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['{rival} swapped its whole staff for agents.', 'Heard a big company replaced everyone with agents.', 'The company across the road went all agents.']],
      ['b', ["How's that going?", "How'd that work out?", 'And?']],
      ['a', ['They rehired half as agent supervisors.', "They're hiring again. Job title: human.", "They posted a job for 'someone who knows things'."]],
    ] },
  { id: 'day_cons_acquire', stream: 'say', eras: ['consolidation'], cast: { a: 'founder', b: 'any' },
    turns: [
      ['a', ['{incumbent} wants to buy us.', 'A very big company sent a very warm email.', '{incumbent} called. They love what we do.']],
      ['b', ["What's the plan for us?", 'What would they do with us?', 'Do they want the product?']],
      ['a', ['They love the team. And the off switch.', "They'd keep the logo. Briefly.", 'They want to turn it off, lovingly.']],
    ] },

  // The Plateau
  { id: 'day_plateau_by_hand', stream: 'say', eras: ['plateau'], cast: { a: 'any', b: 'engineer' },
    turns: [
      ['a', ['Did you write this by hand?', 'Wait, a person wrote this function?', 'Is this handwritten code?']],
      ['b', ['Yeah. Took all morning.', 'Every line. Slowly.', "I did. Don't tell anyone."]],
      ['a', ['Can I show my kids?', "It's beautiful. It has typos.", 'People are going to want to touch it.']],
    ] },
  { id: 'day_plateau_taste', stream: 'say', eras: ['plateau'], cast: { a: 'designer', b: 'founder' },
    turns: [
      ['a', ['The board says our edge is taste now.', "Everything can be generated. Taste can't.", "Apparently I'm a competitive advantage now."]],
      ['b', ['Great. Can we have more by Thursday?', 'Can you scale it?', 'How much taste can we ship this quarter?']],
      ['a', ["Taste doesn't scale. That's the point.", "I'll need a bigger mood board.", "A little. It's made by hand."]],
    ] },
  { id: 'day_plateau_human', stream: 'say', eras: ['plateau'], cast: { a: 'support', b: 'any' },
    turns: [
      ['a', ['A customer cried because I was a real person.', "Someone asked me to prove I'm human.", 'A caller asked if I was a person. I said yes.']],
      ['b', ['How did you prove it?', 'What did you say?', 'What happened?']],
      ['a', ['I made a small mistake. They were thrilled.', "I said 'um' a lot. They upgraded.", 'I put them on hold to find a pen. Five stars.']],
    ] },
  { id: 'day_plateau_workshop', stream: 'say', eras: ['plateau'], cast: { a: 'senior', b: 'junior' },
    turns: [
      ['a', ["I'm running a class on reading code nobody wrote.", "I'm teaching a lunch class on reading old code.", 'Lunch workshop: understanding what we shipped.']],
      ['b', ['Is it full?', 'Can I still get a seat?', 'Do I need to sign up?']],
      ['a', ["There's a waitlist. It's mostly founders.", "It filled in an hour. You're on the waitlist.", 'The whole company signed up. Twice.']],
    ] },
  { id: 'day_plateau_who_built', stream: 'say', eras: ['plateau'], cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['A customer asked who wrote the feature.', 'A client asked for the name of the engineer.', 'They want to know which person built it.']],
      ['b', ['What did you say?', 'Did you tell them?', 'Who did you say?']],
      ['a', ['{coworker}. They sent a thank-you card.', 'I said {coworker}. They want to meet.', 'I said a person. They signed.']],
    ] },
  { id: 'day_plateau_old_deck', stream: 'say', eras: ['plateau'], cast: { a: 'marketer', b: 'any' },
    turns: [
      ['a', ['Found our strategy deck from years ago.', 'Dug up our old vision deck.', 'Found a pitch deck from the early days.']],
      ['b', ['Anything useful?', "How's it held up?", 'Is it embarrassing?']],
      ['a', ['Every prediction was wrong. The values held up.', "Slide one says 'people first'. Accidentally true now.", "It says 'humans matter'. Seemed quaint then."]],
    ] },
  { id: 'day_plateau_pen', stream: 'say', eras: ['plateau'], rare: true, cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['I saw {coworker} writing with a pen.', 'Someone left a handwritten note on my desk.', "There's a paper notebook in the kitchen."]],
      ['b', ['What did it say?', 'Could you read it?', 'Was it legible?']],
      ['a', ["It said 'good work'. I've been emotional all day.", 'Mostly. It smelled like history.', 'No. It was beautiful anyway.']],
    ] },

  // Rare, any era
  { id: 'day_rare_night_commits', stream: 'say', rare: true, cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ["Someone's been committing at 3am.", "There's a commit every night at 3:14.", "A user called 'build' pushes code at night."]],
      ['b', ['Who?', 'Whose account is it?', 'Which user?']],
      ['a', ["The founder's old laptop. It's still on somewhere.", 'Nobody knows. It was doing it before I joined.', 'An intern from years ago. Account still works.']],
    ] },
  { id: 'day_rare_laptop_prod', stream: 'say', rare: true, cast: { a: 'engineer', b: 'any' },
    turns: [
      ['a', ['Good news, the hosting bill is zero.', 'I saved us a fortune on hosting.', "We don't pay for servers anymore."]],
      ['b', ['How?', 'What did you do?', 'Is that allowed?']],
      ['a', ["Production runs on my old laptop now. It's warm.", "Moved prod under my desk. Please don't kick it.", "Prod's on a spare laptop. Don't close the lid."]],
    ] },
  { id: 'day_rare_duck', stream: 'say', rare: true, cast: { a: 'any', b: 'any' },
    turns: [
      ['a', ['I explained the bug to the rubber duck.', 'The duck on my desk solved it.', 'Talked the problem through with the duck.']],
      ['b', ['Did it help?', 'And?', 'Did the duck have thoughts?']],
      ['a', ['The duck wants a title now.', 'It asked for equity.', "Yes. It's the senior now. I report to the duck."]],
    ] },
];
