<!-- Generated from src/data and src/sim/balance.js by `npm run effects`. Do not edit by hand. -->

# Decisions

Every event, in the order of src/data/events.js. "Weight" is its share of the weekly random roll; events with no weight are raised by a rule (a calendar date, a follow-up, a threshold).

## A senior has concerns `senior_grumble`

staff · weight 3 · cooldown 20 weeks · about a senior whose work is at least half automated

When: `(s) => s.automation.engineering.level >= 0.5`

| Choice | Effects |
|---|---|
| Give them a hard problem | their meaning +6; they move to a hard problem |
| Talk it through over lunch | cash -$500; their meaning +8 |
| Tell them to embrace the future | their meaning -6 |

## Can someone show me how this works? `junior_asks_mentor`

staff · weight 3 · cooldown 16 weeks · about a junior without a mentor

| Choice | Effects |
|---|---|
| Pair them with a senior | their meaning +5; a free senior starts mentoring them; requires a mentor is free for them |
| Point them at the docs | their meaning -4 |

## A letter on your desk `resignation_letter`

staff · weight 4 · cooldown 12 weeks · about someone burnt out · staged: envelope

| Choice | Effects |
|---|---|
| Counter-offer | their meaning +20; their salary +15% |
| Suggest a sabbatical | they go on sabbatical; requires the Sabbatical Program is on |
| Accept it gracefully | they leave the company |

## Warning signs `burnout_warning`

staff · weight 2 · cooldown 10 weeks · about someone burnt out

Happens: team meaning -1

## A recruiter is circling `poached_by_bigco`

staff · weight 2 · cooldown 26 weeks · about a senior

When: `(s) => s.week >= 26`

| Choice | Effects |
|---|---|
| Match the offer | their meaning +3; their salary +20% |
| Wish them well | they leave the company |

## First feature shipped `junior_first_feature`

staff · weight 2 · cooldown 20 weeks · about a junior

Happens: their meaning +10; team meaning +1

## A little side project `senior_side_project`

staff · weight 2 · cooldown 30 weeks · about a senior · arrives as a Yak prompt

| Choice | Effects |
|---|---|
| Greenlight a craft project | their meaning +5; a craft project starts, if none is running; requires no craft project is running |
| Not now | their meaning -3 |

## Hackathon weekend? `hackathon`

staff · weight 2 · cooldown 40 weeks · staged: pizza_boxes

When: `(s) => s.staff.length >= 4`

| Choice | Effects |
|---|---|
| Host it | cash -$3,000; team meaning +6; tech debt +2; leaves pizza_boxes for 2 weeks |
| Skip it | nothing |

## Team offsite `team_offsite`

staff · weight 1 · cooldown 52 weeks · staged: brochure

When: `(s) => s.staff.length >= 6`

| Choice | Effects |
|---|---|
| Book the cabin | cash -$12,000; team meaning +10; leaves photo_lake for 52 weeks |
| Maybe next quarter | nothing |

## Bootcamp graduation `bootcamp_grads`

staff · weight 2 · cooldown 26 weeks

Happens: new candidates (juniorBatch)

## Industry layoffs `industry_layoffs`

staff · weight 1 · cooldown 52 weeks

When: `(s) => s.week >= 52`

Happens: team meaning -3; new candidates (seniorBatch)

## The office debate `remote_debate`

staff · weight 1 · cooldown 52 weeks

When: `(s) => s.staff.length >= 5`

| Choice | Effects |
|---|---|
| Go hybrid | team meaning +2 |
| Five days in the office | team meaning -5; know-how +2 |

## A speech at all-hands `ai_skeptic_speech`

staff · weight 2 · cooldown 30 weeks · about a senior

When: `(s) => Object.values(s.automation).some((a) => a.level > 0)`

| Choice | Effects |
|---|---|
| Listen and take notes | their meaning +6; remembers "heardSkeptic" |
| Wave it off | their meaning -4 |

## A proud mentor `mentor_pride`

staff · weight 2 · cooldown 20 weeks · about a mentor

Happens: their meaning +8

## Where is [name]? `no_show`

staff · weight 2 · cooldown 40 weeks · about someone at work (not a founder) · staged: sticky_notes

When: `(s) => s.staff.length >= 4`

| Choice | Effects |
|---|---|
| Check in kindly | team meaning +1; they're away 2 weeks; after 3 weeks: their meaning +15 |
| Dock their pay | cash +$1,500; their meaning -15; team meaning -3; their salary -10%; they're away 2 weeks |
| Say nothing | they're away 3 weeks; "[name] vanished again" follows in 10 weeks |

## [name] vanished again `no_show_again`

staff · raised by a rule

| Choice | Effects |
|---|---|
| Have a real conversation | cash -$1,000; their meaning +12 |
| Let them go | they leave the company |

## Exactly what the ticket says `quiet_quitter`

staff · weight 2 · cooldown 30 weeks · about someone coasting

| Choice | Effects |
|---|---|
| Give them something to own | their meaning +8; after 4 weeks: their meaning +6 |
| Performance plan | their meaning -10; Output +5% for 6 weeks ("Performance plan pressure"); after 6 weeks: their meaning -8, team meaning -2 |
| Leave it | nothing |

## A post on LinkedOut `public_complaint`

staff · weight 2 · cooldown 39 weeks · about anyone in

When: `(s) => Object.values(s.automation).some((a) => a.level >= 0.5)`

| Choice | Effects |
|---|---|
| Respond publicly with real changes | cash -$3,000; brand +2; their meaning +6; team meaning +2 |
| Ask them to take it down | brand -3; their meaning -10 |
| Ignore it | 50% chance of brand -5; otherwise nothing |

## A question about pay `pay_equity_question`

staff · weight 2 · cooldown 52 weeks · about anyone in

When: `(s) => s.stats.hires >= 2`

| Choice | Effects |
|---|---|
| Fix it across the team | their meaning +10; team meaning +4; everyone's salary +8% |
| Explain the market | their meaning -8; after 8 weeks: their meaning -6, team meaning -2 |

## Fourteen tabs of docs `junior_overwhelmed`

staff · weight 2 · cooldown 26 weeks · about a junior · staged: sticky_notes

| Choice | Effects |
|---|---|
| Pair them with a mentor | their meaning +5; a free senior starts mentoring them; requires a mentor is free for them |
| Give them a smaller task | their meaning +3 |
| Sink or swim | their meaning -8; their knowledge +5 |

## [name] has an idea `ceo_replace_support`

leadership · weight 2 · cooldown 100000 weeks · about a founder

When: `(s, h) => h.live.length > 0 && s.automation.support.level < 1`

| Choice | Effects |
|---|---|
| Do it | automation set by the choice; "Customers noticed the support bot" follows in 10 weeks |
| Trial it on half the tickets | automation set by the choice |
| Talk them down | their meaning -3 |

## Customers noticed the support bot `ceo_support_fallout`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Keep the bot | brand -3; customers -6% |
| Bring humans back | cash -$5,000; brand +1; automation set by the choice |

## What about a four-day week? `four_day_week`

leadership · weight 2 · cooldown 100000 weeks · about a founder

When: `(s) => s.staff.length >= 5`

| Choice | Effects |
|---|---|
| Run an 8-week trial | Output -10% for 8 weeks ("Four-day week trial"); Meaning recovery +50% for 8 weeks ("Four-day week trial"); "Four-day week: keep going?" follows in 8 weeks |
| Not now | team meaning -2 |

## Four-day week: keep going? `four_day_week_review`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Keep it | Output -10% for 52 weeks ("Four-day week"); Meaning recovery +40% for 52 weeks ("Four-day week"); "Four-day week: keep going?" follows in 52 weeks |
| Back to five days | team meaning -4 |

## "We are an AI-first company now" `ai_first_mandate`

leadership · weight 2 · cooldown 100000 weeks · about a founder

When: `(s) => s.week >= 26`

| Choice | Effects |
|---|---|
| Announce it | hype on your newest product +10; Meaning drain +40% for 26 weeks ("AI-first mandate"); automation level +1 (0.25); "Twelve weeks of AI-first" follows in 12 weeks |
| Make agents optional | team meaning +1 |
| Kill the slide | their meaning -3 |

## Twelve weeks of AI-first `ai_first_review`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Double down | team meaning -4; automation level +1 (0.25) |
| Roll it back quietly | brand -1; team meaning +3; automation level +1 (-0.25) |

## Time for a rebrand? `rebrand`

leadership · weight 1 · cooldown 100000 weeks · about a founder

When: `(s) => s.week >= 52 && s.cash >= 30000`

| Choice | Effects |
|---|---|
| Go bold | cash -$20,000; after 6 weeks: 60% chance of brand +8; otherwise brand -4 |
| Refresh the logo | cash -$3,000; brand +1 |
| Keep it | nothing |

## [name] wants to pivot `pivot_pitch`

leadership · weight 1 · cooldown 104 weeks · about a founder · staged: whiteboard_scrawl

When: `(s, h) => h.live.length >= 2`

| Choice | Effects |
|---|---|
| Pivot | your newest product pivots; leaves sticky_notes for 8 weeks |
| Stay the course | team meaning +1 |

## Knock down the walls? `open_plan_office`

leadership · weight 1 · cooldown 100000 weeks · about a founder · staged: sledgehammer

When: `(s) => s.officeStage >= 1`

| Choice | Effects |
|---|---|
| Knock them down | cash -$2,000; Output +8% for 26 weeks ("Open-plan buzz"); Meaning recovery -30% for 26 weeks ("Open-plan noise") |
| Keep the walls | nothing |

## A whole hackathon week `hackathon_week`

leadership · weight 1 · cooldown 52 weeks · about a founder · staged: pizza_boxes

When: `(s, h) => s.staff.length >= 5 && h.live.length > 0`

| Choice | Effects |
|---|---|
| Stop everything for a week | cash -$2,000; team meaning +5; hype on your newest product +8; Output -50% for 1 weeks ("Hackathon week"); leaves pizza_boxes for 2 weeks |
| Not this quarter | team meaning -1 |

## Even founders run out `founder_burnout`

leadership · weight 3 · cooldown 52 weeks · about a founder · staged: mug_pile

When: `(s) => s.staff.some((p) => p.founder && p.meaning < 40 && p.mood !== 'away')`

| Choice | Effects |
|---|---|
| Take a real break | their meaning +10; they're away 4 weeks |
| Push through | Output +10% for 8 weeks ("Founder hustle"); after 8 weeks: their meaning -20, team meaning -3; leaves mug_bucket for 26 weeks |

## Suspiciously familiar `incumbent_copies_flavor`

market · weight 2 · cooldown 30 weeks · about one of your live products

When: `(s, h) => h.live.length > 0`

| Choice | Effects |
|---|---|
| Lean into taste | cash -$5,000; hype on your newest product +10 |
| Ignore it | hype on your newest product -5 |

## Clone wave `clone_wave`

market · weight 2 · cooldown 26 weeks · about one of your live products

When: `(s, h) => h.live.some((p) => p.score >= 6)`

Happens: 2 copycat products appear

## An enterprise RFP `enterprise_rfp`

market · weight 2 · cooldown 26 weeks · about one of your live products · staged: binder

When: `(s, h) => h.live.length > 0 && s.week >= 30`

| Choice | Effects |
|---|---|
| Bid for it | if the product runs on a compliance-friendly model: brand +2, customers +15%; otherwise brand -1 |
| Pass | nothing |

## Your biggest customer is unhappy `big_customer_threat`

market · weight 2 · cooldown 26 weeks · about one of your live products

When: `(s, h) => h.live.some((p) => p.customers > 500)`

| Choice | Effects |
|---|---|
| Offer a discount | cash -$8,000 |
| Call their bluff | 50% chance of customers -8%; otherwise nothing |

## The press is laughing `press_wrapper_mockery`

market · weight 2 · cooldown 30 weeks · about one of your live products

When: `(s, h) => h.live.some((p) => p.score < 6)`

| Choice | Effects |
|---|---|
| Laugh along in the comments | brand +1; hype on your newest product +5 |
| Send a cease and desist | cash -$2,000; brand -3 |

## Gone viral `viral_post`

market · weight 2 · cooldown 20 weeks · about one of your live products

When: `(s, h) => h.live.length > 0`

Happens: hype on your newest product +20

## An acquisition offer `acquisition_offer`

market · weight 4.5 · cooldown 52 weeks

When: `(s, h) => h.offerReady`

| Choice | Effects |
|---|---|
| Accept and retire | you win by acquisition: the offer opens |
| Keep it on the table | an acquisition offer opens |
| Decline | brand +2 |

## The bank account is red `bridge_loan`

market · raised by a rule · staged: screens_red

| Choice | Effects |
|---|---|
| Take a bridge loan | cash +$60,000; brand -1; after 26 weeks: cash -$72,000 |
| Cut costs | cash +$10,000; Output -10% for 12 weeks ("Cost cutting"); Meaning recovery -30% for 12 weeks ("Cost cutting") |
| Ride it out | nothing |

## A venture capitalist calls `vc_offer`

market · weight 3 · cooldown 100000 weeks

When: `(s) => !s.flags.diluted && (s.week >= 26 || s.cash < 20000)`

| Choice | Effects |
|---|---|
| Take the money | cash +$500,000; remembers "diluted" |
| Stay bootstrapped | team meaning +2 |

## Product of the Day `product_hunt_top`

market · weight 2 · cooldown 26 weeks · about one of your live products

When: `(s, h) => h.live.some((p) => p.score >= 6)`

Happens: brand +2; hype on your newest product +15

## Analyst quadrant `analyst_report`

market · weight 2 · cooldown 39 weeks

When: `(s, h) => h.live.length > 0`

Happens: if a live product scores 7 or more: brand +3; otherwise brand -2

## A new frontier model `vendor_new_version`

vendor · weight 2 · cooldown 26 weeks · arrives as a Yak prompt

| Choice | Effects |
|---|---|
| Let the team play with it | cash -$1,500; team meaning +3 |
| Stay focused | nothing |

## A friendly pricing update `vendor_price_hike`

vendor · weight 1 · cooldown 39 weeks

When: `(s, h) => h.live.length > 0`

Happens: one of your model vendors raises prices

## Vendor outage `vendor_outage`

vendor · weight 2 · cooldown 26 weeks

When: `(s, h) => h.live.length > 0`

Happens: products on one of your vendors' models lose 20 health

## Grokk said something `grokk_pr_scandal`

vendor · weight 3 · cooldown 39 weeks

When: `(s, h) => h.usesModel('grokk')`

| Choice | Effects |
|---|---|
| Ride it out | brand -4 |
| Switch vendors now | brand +1; products on Grokk need a migration within 26 weeks |

## New open weights `open_weights_release`

vendor · weight 1 · cooldown 52 weeks

Happens: Llamarama capability +5

## GPU shortage `gpu_shortage`

vendor · weight 1 · cooldown 52 weeks

When: `(s) => Object.values(s.automation).some((a) => a.level > 0)`

Happens: automation costs +50% for 8 weeks

## The agent dropped the production database `agent_db_wipe`

incident · raised by a rule

| Choice | Effects |
|---|---|
| Roll back and eat the cost | cash -$15,000 |
| Blame the vendor | if the last incident was on a trusted vendor: nothing; otherwise brand -3 |
| Publish a public postmortem | know-how +3; if Blameless Postmortems is on: brand +3; otherwise brand -1 |

## The cloud bill has feelings `agent_runaway_spend`

incident · raised by a rule · staged: rack_hot

| Choice | Effects |
|---|---|
| Pay it and apologize to finance | cash -$25,000 |
| Beg the cloud provider for credits | 50% chance of cash -$30,000; otherwise nothing |
| Publish a public postmortem | cash -$12,000; know-how +3; if Blameless Postmortems is on: brand +3; otherwise brand -1 |

## Every customer got an email `agent_mass_email`

incident · raised by a rule

| Choice | Effects |
|---|---|
| Send an apology email | brand -1; customers -3% |
| Blame the vendor | if the last incident was on a trusted vendor: nothing; otherwise brand -3 |
| Publish a public postmortem | know-how +3; if Blameless Postmortems is on: brand +3; otherwise brand -1 |

## The agent followed the wrong instructions `agent_prompt_injection_leak`

incident · raised by a rule

| Choice | Effects |
|---|---|
| Rotate every secret tonight | cash -$12,000; team meaning -2 |
| Blame the vendor | if the last incident was on a trusted vendor: nothing; otherwise brand -3 |
| Publish a public postmortem | know-how +3; if Blameless Postmortems is on: brand +3; otherwise brand -1 |

## The agent fixed pricing `agent_pricing_rewrite`

incident · raised by a rule

| Choice | Effects |
|---|---|
| Honor the deals | cash -$18,000; brand +2 |
| Cancel the free plans | customers -6% |
| Publish a public postmortem | cash -$8,000; know-how +3; if Blameless Postmortems is on: brand +3; otherwise brand -1 |

## The support bot promised refunds `support_refund_hallucination`

incident · raised by a rule

| Choice | Effects |
|---|---|
| Pay the refunds | cash -$15,000 |
| Blame the vendor | customers -4%; if the last incident was on a trusted vendor: nothing; otherwise brand -3 |
| Publish a public postmortem | cash -$6,000; know-how +3; if Blameless Postmortems is on: brand +3; otherwise brand -1 |

## Nobody here can debug this `outage_unfixable`

incident · raised by a rule

| Choice | Effects |
|---|---|
| Call in consultants | consultants clear the outage for $45,000; requires you can afford the consultants |
| Hire an emergency contractor | cash -$15,000; tech debt +3; after 2 weeks: the outage clears |
| Keep trying ourselves | nothing |

## Credential stuffing `credential_stuffing`

cyber · raised by a rule

| Choice | Effects |
|---|---|
| Force password resets | brand +1; customers -3% |
| Patch it quietly | 40% chance of brand -6; otherwise nothing |

## Ransomware `ransomware`

cyber · raised by a rule · staged: screens_skull

| Choice | Effects |
|---|---|
| Pay the ransom | you pay the ransom |
| Restore from backups | if know-how is 40 or more: know-how +2; otherwise brand -4, customers -20% |

## Supply chain compromise `supply_chain`

cyber · raised by a rule

| Choice | Effects |
|---|---|
| Audit every dependency | cash -$15,000; tech debt -3 |
| Remove it and move on | 50% chance of brand -5, tech debt +3; otherwise nothing |

## Data exfiltration `data_exfiltration`

cyber · raised by a rule

| Choice | Effects |
|---|---|
| Disclose it publicly | cash -$10,000; brand -3 |
| Say nothing | 50% chance of cash -$30,000, brand -12; otherwise nothing |

## The CEO wants gift cards `phishing_ceo`

cyber · raised by a rule · staged: gift_cards

| Choice | Effects |
|---|---|
| Mandatory security training | cash -$4,000; team meaning -1 |
| Laugh it off | 30% chance of cash -$25,000; otherwise nothing |

## The ChatGBT moment `era_chatgbt`

era · raised by a rule

| Choice | Effects |
|---|---|
| Try copilots | team meaning +2; hype on your newest product +15; Learning speed +20% for 26 weeks ("Copilot experiments") |
| Wait and see | Customer churn -10% for 26 weeks ("Steady hands"); after 13 weeks: brand -2 |
| The board wants an AI strategy | brand +4; team meaning -3; Customer acquisition +15% for 26 weeks ("AI strategy buzz") |

## The agents are here `era_agents`

era · raised by a rule

| Choice | Effects |
|---|---|
| Go all in | hype on your newest product +15; Meaning drain +40% for 26 weeks ("Agent gold rush"); automation level +1 (0.25) |
| Humans stay in the loop | brand +2; Meaning recovery +30% for 26 weeks ("Humans in the loop") |
| Pilot with oversight | cash -$10,000; Oversight hours +30% for 52 weeks ("Agent pilot program"); Rogue agent risk -30% for 52 weeks ("Agent pilot program") |

## Consolidation `era_consolidation`

era · raised by a rule

| Choice | Effects |
|---|---|
| Hire a compliance lead | cash -$25,000; Customer churn -15% for 52 weeks ("Compliance lead") |
| Lobby a little | cash -$10,000; 50% chance of brand +5; otherwise brand -6 |
| Keep your head down | Customer acquisition -10% for 26 weeks ("Price war") |

## The Plateau `era_plateau`

era · raised by a rule

| Choice | Effects |
|---|---|
| Lean into craft | brand +3; Meaning recovery +30% for 52 weeks ("The craft turn") |
| Automate to the floor | Meaning drain +40% for 26 weeks ("Automate to the floor"); automation level +1 (0.25) |
| Become the trusted one | cash -$20,000; Customer churn -15% for 52 weeks ("Trust program") |

## The first user test `first_user_test`

staff · raised by a rule · staged: visitor_chair

| Choice | Effects |
|---|---|
| Watch in silence | team meaning -1; Learning speed +15% for 8 weeks ("Lessons from the user test") |
| Explain everything as they go | team meaning +3 |
| Skip it and keep building | Output +5% for 4 weeks ("Heads down") |

## The office closes `lockdown_start`

world · raised by a rule · staged: moving_boxes

| Choice | Effects |
|---|---|
| Laptops and a stipend for everyone | cash -$5,000; team meaning +3 |
| Keep calm and ship | Output +5% for 10 weeks ("Lockdown sprint"); Meaning drain +30% for 10 weeks ("Lockdown sprint") |
| A daily video call for everyone | team meaning -2; know-how +5 |

## How do we work now? `work_policy`

world · raised by a rule

| Choice | Effects |
|---|---|
| Back to the office | team meaning -2; work policy: office |
| Hybrid | team meaning +1; work policy: hybrid |
| Remote-first | team meaning +1; work policy: remote |

## A dog on Fridays? `pet_request`

staff · weight 3 · cooldown 52 weeks · about someone at work (not a founder) · arrives as a Yak prompt · staged: photos_laminated

When: `(s) => s.workPolicy !== null && s.workPolicy !== 'remote' && s.staff.length >= 6 && !s.pets.some((p) => p.species === 'dog')`

| Choice | Effects |
|---|---|
| Yes, dogs welcome | team meaning +2; a dog joins the office |
| Not in the office | their meaning -5 |

## A cat, apparently `cat_request`

staff · weight 2 · cooldown 78 weeks · about someone at work (not a founder) · staged: pet_carrier

When: `(s) => s.workPolicy !== null && s.staff.length >= 8 && !s.pets.some((p) => p.species === 'cat') && s.week >= (s.flags.workPolicyAsked ?? 9999) + 52`

| Choice | Effects |
|---|---|
| Fine. One cat. | team meaning +1; a cat joins the office |
| Absolutely not | nothing |

## Pet incident `pet_mishap`

misc · weight 2 · cooldown 52 weeks · staged: cable_chewed

When: `(s) => s.pets.length > 0`

| Choice | Effects |
|---|---|
| Laugh it off | brand +1; Output -3% for 2 weeks ("Chewed cable") |
| Pets stay home on demo days | team meaning -1 |

## A rival appears `rival_appears`

market · raised by a rule

| Choice | Effects |
|---|---|
| Ignore them | nothing |
| Fire back online | 50% chance of brand +3, the rival takes a hit (10); otherwise brand -2 |
| Out-ship them | Output +6% for 8 weeks ("Rivalry"); Meaning drain +20% for 8 weeks ("Rivalry") |

## Another jab from [rival] `rival_jab`

market · weight 2 · cooldown 52 weeks

When: `(s) => s.rival?.status === 'rising' || s.rival?.status === 'stalled'`

| Choice | Effects |
|---|---|
| Rise above it | team meaning +1; leaves sign_rival_copied |
| Poach one of their people | cash -$10,000; new candidates (seniorBatch); the rival takes a hit (15) |

## Merge with [rival]? `rival_merge`

market · raised by a rule

| Choice | Effects |
|---|---|
| Merge | you buy the rival (priced by its strength); the rival merged |
| Let them fall | the rival shuts down |

## The agent bill `agent_bill`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Audit every agent | an agent audit: 8 weeks of agent spend, rogue risk -30% for 52 weeks |
| Cap the spend | every automation is capped at level 0.5 |
| It is fine | "The invoice arrived" follows in 26 weeks |

## The invoice arrived `agent_invoice`

leadership · raised by a rule · staged: invoice

| Choice | Effects |
|---|---|
| Pay it | pay 20 weeks of agent spend |
| Dispute it | 50% chance of pay 0.5× 20 weeks of agent spend; otherwise brand -2, pay 20 weeks of agent spend |

## [rival] raised a mega-round `rival_megaround`

market · raised by a rule

| Choice | Effects |
|---|---|
| Match their offers | everyone's salary +8%; Outside offers taken -50% for 26 weeks ("Matched offers") |
| Remind them why they are here | team meaning +4; Outside offers taken +25% for 26 weeks ("Recruiters circling") |
| Let them try | Outside offers taken +50% for 26 weeks ("Recruiters circling") |

## The floor next door is empty `floor_next_door`

leadership · raised by a rule · staged: tape_measure

| Choice | Effects |
|---|---|
| Knock through | the office expands now; requires the expansion is open |
| Not yet | nothing |

## Small companies are for sale `deals_open`

market · raised by a rule

| Choice | Effects |
|---|---|
| Make an offer on [deal] | you buy the best company for sale; requires a deal is open to you |
| Just looking | nothing |

## What are we for? `mission_statement`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Make software people love | team meaning +3; your mission becomes "craft"; leaves mug_typo for 52 weeks |
| A place where people grow | team meaning +4; your mission becomes "people" |
| The company customers trust | brand +2; your mission becomes "trust" |
| Grow as fast as the tools allow | hype on your newest product +10; your mission becomes "growth" |

## Humans on the phones? `mission_test_support`

leadership · weight 2 · cooldown 104 weeks · staged: printout

When: `(s) => !!s.purpose && s.staff.some((p) => p.role === 'support')`

| Choice | Effects |
|---|---|
| Keep humans on support | cash -$20,000; team meaning +2 |
| Hand support to the agents | automation set by the choice |

## Ship it for the demo? `mission_test_demo`

market · weight 2 · cooldown 78 weeks · about one of your live products

When: `(s) => !!s.purpose`

| Choice | Effects |
|---|---|
| Ship it for the demo | hype on your newest product +15 |
| Wait until it is right | hype on your newest product -5 |

## The AI Summit `ai_summit`

annual · raised by a rule

| Choice | Effects |
|---|---|
| Skip it | hosts a skip summit |
| A talk in a side room | brand +2; hype on your newest product +10; hosts a small summit |
| A live demo on the main stage | hosts a big summit; 60% chance of brand +6, hype on your newest product +30; otherwise brand -3, hype on your newest product +10; requires you have the Office Floor |

## The AI Summit: the big panel `ai_summit_panel`

annual · raised by a rule

| Choice | Effects |
|---|---|
| Decline the panel | hosts a skip summit |
| Send someone thoughtful | brand +3; hosts a small summit |
| Go for the viral moment | hosts a big summit; 50% chance of brand +8, hype on your newest product +20; otherwise brand -4 |

## The AI Summit: the hackathon `ai_summit_hackathon`

annual · raised by a rule

| Choice | Effects |
|---|---|
| Pass | hosts a skip summit |
| Sponsor a prize | hype on your newest product +15; new candidates (juniorBatch); hosts a small summit; leaves giant_cheque for 26 weeks |
| Put your whole API on the table | hosts a big summit; 55% chance of brand +5, know-how +2, hype on your newest product +25; otherwise brand -2, 1 copycat product appear; leaves giant_cheque for 26 weeks |

## Invited to testify `hearing_summons`

world · raised by a rule · staged: envelope_thick

| Choice | Effects |
|---|---|
| Send a founder | "The committee report" follows in 13 weeks; 55% chance of brand +6; otherwise brand -5 |
| Send the lawyers | cash -$30,000; "The committee report" follows in 13 weeks |
| Decline politely | brand -3; "The committee report" follows in 13 weeks |

## The committee report `hearing_report`

world · raised by a rule

| Choice | Effects |
|---|---|
| Comply early | cash -$40,000; Customer churn -10% for 52 weeks ("Early compliance") |
| Wait for the final rules | Customer acquisition -8% for 26 weeks ("Regulatory fog") |

## A note from [alum] `alumni_referral`

staff · weight 1 · cooldown 104 weeks

When: `(s) => (s.flags.alumni?.length ?? 0) >= 1`

| Choice | Effects |
|---|---|
| Take the introductions | team meaning +1; new candidates (seniorBatch) |
| Invite [alum] to lunch | cash -$500; know-how +3 |

## [alum] started something `alumni_competitor`

market · weight 1 · cooldown 104 weeks · about one of your live products

When: `(s, h) => (s.flags.alumni?.length ?? 0) >= 2 && h.live.length > 0`

| Choice | Effects |
|---|---|
| Congratulate them publicly | brand +1; 1 copycat product appear |
| Offer to acquire them | cash -$120,000; new candidates (seniorBatch) |

## The alumni reunion `alumni_reunion`

staff · weight 1 · cooldown 156 weeks

When: `(s) => (s.flags.alumni?.length ?? 0) >= 3`

| Choice | Effects |
|---|---|
| Host it | cash -$8,000; brand +1; team meaning +3; know-how +2; leaves old_sign for 26 weeks |
| Let them organise it | nothing |

## The hosting bill `cloud_bill`

misc · weight 2 · cooldown 52 weeks · staged: invoice

When: `(s, h) => h.live.length > 0`

| Choice | Effects |
|---|---|
| Spend a sprint optimizing | Output -10% for 4 weeks ("Cost-cutting sprint"); after 8 weeks: cash +$8,000 |
| Just pay it | cash -$6,000 |

## Rejected by the app store `app_store_rejection`

market · weight 2 · cooldown 39 weeks · about one of your live products · arrives as a Yak prompt

When: `(s, h) => h.live.length > 0`

| Choice | Effects |
|---|---|
| Appeal politely | after 4 weeks: hype on your newest product +8 |
| Complain loudly online | 45% chance of brand +3, hype on your newest product +15; otherwise brand -3 |

## Have you considered the blockchain? `blockchain_pitch`

leadership · weight 1 · cooldown 104 weeks · about a founder

When: `(s, h) => s.week >= 26 && h.live.length > 0`

| Choice | Effects |
|---|---|
| Politely decline | team meaning +2 |
| Mint a coin | 30% chance of brand +2, hype on your newest product +25; otherwise brand -5, team meaning -3 |

## A bank wants it on their servers `onprem_bank`

market · weight 2 · cooldown 52 weeks · about one of your live products · staged: binder

When: `(s, h) => s.week >= 30 && h.live.length > 0`

| Choice | Effects |
|---|---|
| Do the install | cash +$20,000; Output -10% for 8 weeks ("The bank install") |
| Say no | nothing |

## The ping pong question `ping_pong`

misc · weight 2 · cooldown 104 weeks · staged: picture_pingpong

When: `(s) => s.staff.length >= 3 && s.officeStage >= 1 && !s.office.placed.some((i) => i.itemId === 'ping_pong_table')`

| Choice | Effects |
|---|---|
| Buy one | cash -$1,500; grants Ping Pong Table |
| Not yet | leaves picture_pingpong_ball |

## Dinner, with questions `family_dinner`

leadership · weight 2 · cooldown 52 weeks · about a founder

When: `(s) => s.week >= 20`

| Choice | Effects |
|---|---|
| Show them the dashboard | brand +1; their meaning +5 |
| Promise big news next year | Output +6% for 12 weeks ("Family expectations"); Meaning drain +30% for 12 weeks ("Family expectations") |

## Your cousin would like an update `family_checkin`

leadership · weight 2 · cooldown 52 weeks

When: `(s) => s.week >= 30`

| Choice | Effects |
|---|---|
| Start a monthly newsletter | brand +1; Output -3% for 8 weeks ("Investor newsletter") |
| Pay them back early | cash -$10,000; team meaning +2 |

## An internship for the nephew `family_intern`

staff · weight 2 · cooldown 78 weeks · about a founder

When: `(s) => s.week >= 26`

| Choice | Effects |
|---|---|
| Sure, one summer | team meaning +1; new candidates (juniorBatch) |
| Politely decline | their meaning -4 |

## The board wants growth `investor_growth_push`

leadership · weight 3 · cooldown 39 weeks

When: `(s, h) => h.live.length > 0`

| Choice | Effects |
|---|---|
| Push for growth | Customer acquisition +20% for 13 weeks ("Growth push"); Meaning drain +30% for 13 weeks ("Growth push") |
| Push back | brand -1; team meaning +3 |

## Demo day `investor_demo_day`

market · weight 2 · cooldown 52 weeks · staged: smoothie

When: `(s, h) => h.live.length > 0`

| Choice | Effects |
|---|---|
| Pitch the newest product | brand +1; hype on your newest product +20 |
| Skip it | nothing |

## Why so many humans? `investor_automation_push`

leadership · weight 3 · cooldown 52 weeks

When: `(s) => s.staff.length >= 6`

| Choice | Effects |
|---|---|
| Automate harder | Meaning drain +40% for 26 weeks ("Headcount pressure"); automation level +1 (0.25) |
| Defend the team | team meaning +4; Customer acquisition -10% for 13 weeks ("Investor sulking") |

## Pick the genre `music_night_genre`

staff · raised by a rule

| Choice | Effects |
|---|---|
| Corporate Synthwave | a music night (corporate synthwave) |
| Motivational Polka | a music night (motivational polka) |
| Aggressive Bossa Nova | a music night (aggressive bossa nova) |
| Sad Lo-fi | a music night (sad lofi) |

## Project [moonshot] `moonshot_pitch`

leadership · raised by a rule · staged: printout

| Choice | Effects |
|---|---|
| Fund the moonshot | the moonshot: start; leaves curtain |
| Not now | nothing |

## Project [moonshot]: the check-in `moonshot_checkin`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Keep going | the moonshot: continue |
| Pull the plug | the moonshot: stop |

## Project [moonshot]: the unveiling `moonshot_result`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| Pull back the curtain | the moonshot: resolve |
| Give them six more months | the moonshot: continue |

## The founders' last big bet `last_bet`

leadership · raised by a rule

| Choice | Effects |
|---|---|
| One last moonshot | the last bet: moonshot; leaves whiteboard_scrawl for 26 weeks |
| Start a foundation | the last bet: foundation |
| Hand over the keys | the last bet: keys |

## SaaSCon is next week `conference_expo`

annual · raised by a rule · staged: printout

| Choice | Effects |
|---|---|
| Skip it | nothing |
| Small booth | cash -$15,000; brand +2; hype on your newest product +10; leaves swag_box for 4 weeks |
| Big booth | cash -$40,000; brand +5; hype on your newest product +25; requires you have the Office Floor; leaves swag_box for 4 weeks |

## The Saasies `awards_show`

annual · raised by a rule

Happens: nothing

## Year in review `year_summary`

annual · raised by a rule

Happens: nothing

## The coffee machine is dead `coffee_machine_broke`

misc · weight 2 · cooldown 104 weeks · staged: smoke_puff

When: `(s) => s.office.placed.some((i) => i.itemId === 'espresso')`

| Choice | Effects |
|---|---|
| Buy the fancy one | team meaning +3; upgrades Espresso Machine; requires the espresso machine can be upgraded |
| Get it repaired | cash -$800 |
| Live with it | team meaning -2 |

## The team wants a coffee machine `coffee_wanted`

misc · weight 2 · cooldown 52 weeks · arrives as a Yak prompt · staged: french_press

When: `(s) => s.week >= 8 && !s.office.placed.some((i) => i.itemId === 'espresso' || i.itemId === 'coffee_corner')`

| Choice | Effects |
|---|---|
| Buy an espresso machine | team meaning +2; buys Espresso Machine; requires an espresso machine can be bought |
| Not yet | team meaning -1; leaves french_press |

## The coffee corner has been reviewed `coffee_wanted_corner`

misc · weight 2 · cooldown 52 weeks · arrives as a Yak prompt · staged: printout

When: `(s) => s.week >= 8 && !s.office.placed.some((i) => i.itemId === 'espresso') && s.office.placed.some((i) => i.itemId === 'coffee_corner')`

| Choice | Effects |
|---|---|
| Buy an espresso machine | team meaning +2; buys Espresso Machine; requires an espresso machine can be bought |
| Not yet | team meaning -1; leaves printout |

## A new banner `banner_company`

leadership · weight 2 · cooldown 100000 weeks · about anyone in · staged: banner_company

When: `(s) => s.staff.length >= N.bannerStaff`

| Choice | Effects |
|---|---|
| Hang it | Output +2% for 26 weeks ("The banner"); Meaning drain +5% for 26 weeks ("The banner, looming"); leaves banner_company for 104 weeks |
| Hang it, ironically | team meaning +2; 20% chance of brand -1; otherwise nothing; leaves banner_company for 104 weeks |
| Send it back | cash -$300 |

## The new cover sheets `cover_sheets`

leadership · weight 2 · cooldown 100000 weeks · about someone at work (not a founder) · staged: cover_sheets

When: `(s) => s.staff.length >= N.coverStaff`

| Choice | Effects |
|---|---|
| Mandate it | know-how +3; Output -2% for 26 weeks ("TPS cover sheets"); after 1 weeks: nothing; after 2 weeks: nothing; after 3 weeks: nothing |
| Quietly lose the memo | team meaning +1 |

## The red stapler `the_stapler`

staff · weight 2 · cooldown 100000 weeks · about a long-serving person · staged: stapler

| Choice | Effects |
|---|---|
| Standardize the staplers | cash +$200; their meaning -25; after 13 weeks: their meaning +10 |
| Let them keep it | their meaning +5; they become its owner; leaves stapler |

## The consultants `efficiency_consultants`

leadership · weight 2 · cooldown 100000 weeks · staged: visitor_chair

When: `(s) => s.staff.length >= N.consultantStaff && cuttable(s).length >= N.consultantMinEligible && s.week - (s.flags.layoffWeek ?? -ONCE) >= N.layoffGapWeeks`

| Choice | Effects |
|---|---|
| Let them work | cash -$60,000; team meaning -4; Output +5% for 26 weeks ("Post-consultant hustle"); the 2 lowest-rated people are let go |
| Take the report, file it | cash -$60,000 |
| Send them home | brand -1 |

## PC LOAD LETTER `printer_jam`

misc · weight 2 · cooldown 100000 weeks · about anyone in · staged: printer_jammed

When: `(s) => s.officeStage >= 1`

| Choice | Effects |
|---|---|
| Take it out back | cash -$2,500; team meaning +6; leaves printer_wrecked for 4 weeks |
| Call the repair line | cash -$300 |
| Print less | Output -1% for 13 weeks ("Paperless, grudgingly"); after 1 weeks: nothing |

## About Saturday `saturday_ask`

leadership · weight 2 · cooldown 100000 weeks · about a senior

When: `(s) => s.staff.length >= N.saturdayStaff`

| Choice | Effects |
|---|---|
| Saturday it is | team meaning -3; team strain +10; Output +8% for 2 weeks ("Saturdays") |
| No. Mmkay? | their meaning -3; team meaning +2 |

## The incubator house `incubator_house`

leadership · weight 3 · cooldown 100000 weeks · staged: house_sign

When: `(s) => s.officeStage === 0 && s.week >= N.incubatorFrom && s.week <= N.incubatorUntil`

| Choice | Effects |
|---|---|
| Move in | cash +$12,000; remembers "incubatorCut"; after 52 weeks: nothing; leaves house_sign for 52 weeks |
| Keep the garage | nothing |
| Counter at five percent | 50% chance of cash +$12,000, remembers "incubatorCut"; otherwise nothing |

## The Box `the_box`

market · weight 2 · cooldown 100000 weeks · about a senior · staged: box_poster

When: `(s) => !!s.rival && ['rising', 'stalled'].includes(s.rival.status)`

| Choice | Effects |
|---|---|
| Build our own box | cash -$40,000; tech debt +4; hype on your newest product +12; leaves box_cube for 26 weeks |
| Stay software | brand +1; after 30 weeks: brand +1 |
| Mock it | 55% chance of brand +3; otherwise brand -2 |

## Four thousand pounds of oat milk `oat_milk`

vendor · weight 2 · cooldown 100000 weeks · staged: oat_milk

When: `(s) => s.automation.ops.level >= N.oatOpsLevel && s.staff.length >= N.oatStaff && s.week >= s.eraSchedule.agents && s.week < s.eraSchedule.agents + N.oatWindowWeeks`

| Choice | Effects |
|---|---|
| Send it back | cash -$3,000 |
| Keep it | Stamina drain -10% for 52 weeks ("The oat milk reserve"); leaves oat_milk for 26 weeks |
| Donate it | brand +2 |

## Is it kielbasa? `is_it_kielbasa`

staff · weight 2 · cooldown 100000 weeks · about a junior

When: `(s) => s.staff.length >= N.kielbasaStaff`

| Choice | Effects |
|---|---|
| Ship it | team meaning +2; hype on your newest product +15; after 6 weeks: hype on your newest product -8 |
| Sell the tech | cash +$25,000 |
| Keep it as a demo | their meaning +6; team meaning +2 |

## Tabs or spaces `tabs_or_spaces`

staff · raised by a rule · cooldown 100000 weeks · about anyone in

| Choice | Effects |
|---|---|
| Set a company standard | their meaning +4; team meaning -1 |
| Let the linter decide | team meaning -1; know-how +2 |
| Ban the topic | team meaning -1 |
