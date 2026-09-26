# Feature inventory

This file catalogues everything Human in the Loop does today, with the fun details (animations, staged moments, props, jokes, sounds) first, so the team remembers them and can plan highlight reels and trailers. Every PR that adds or changes a player-visible feature updates it.

Conventions:
- A star at the start of a bullet marks a reel-worthy highlight.
- "How to see it" hints: `?mock=<scenario>` is a canned scene (`garage`, `floor`, `hq`, `incident`, `night`, `ending`); `find.js <event> --choice N` is `node scripts/events/find.js`, whose snapshot `scene.mjs --moment '<query>'` stages; `capture <id>` is `npm run capture -- --only <id>`.
- A bullet backed by data ends with its ids, one code span each: Spoken: "It has paper. I checked its demands." `id: printer_jam`.

## Company and progression

- **Founding**: name the company, pick a logo colour and tagline, choose two founders and a funding source; a pair with no builder gets a plain warning. `capture 1-2-founding`
- **Founder archetypes**: the Engineer, the Designer, the Hustler, the Operator, the Researcher and the Seller, each with a starting trait and two strong skills. `id: engineer` `id: designer` `id: hustler` `id: operator` `id: researcher` `id: seller`
- **Funding**: Bootstrapped (full score, no net), Friends and Family (dinner-table questions later), Pre-seed VC (two senior intros, a board that pushes for growth, then automation). `id: bootstrapped` `id: family` `id: preseed`
- **Family and investor check-ins**: funded companies get their own decisions, from a cousin wanting an update to a board asking "why so many humans?". `id: family_dinner` `id: family_checkin` `id: family_intern` `id: investor_growth_push` `id: investor_automation_push`
- **Building products**: pick a category and an approach (later an AI angle and a model vendor); some pairings fit much better than others, and a dice button suggests a name.
- **Launches and reviews**: a launch popup with a review score and quotes from TechCrunchy, The Vergence, Hacker Olds and Wired-ish, plus shortcuts to start the next version with the same team or rerun the last campaign; launches that land together share one card with each product's score, best quote and shortcuts. `capture 5-1-first-launch`
- **Marketing campaigns**: from a blog and Product Hunch Day up to an influencer deal and a conference booth; Consolidation adds fame campaigns (The Documentary, The Big Game Ad, Stadium Naming Rights) priced in weeks of revenue. `id: documentary` `id: big_game_ad` `id: stadium`
- **Market trends**: timed trends such as Agents Are Hot, AI Fatigue, Mobile Rush and Made by Humans lift or sink angles and categories; the HUD shows the current one with its flavour line.
- **Hiring, training and careers**: hire from candidates, send people to a workshop, conference or course, and let freshly promoted seniors pick a career path (Architect, AI Wrangler, Community Manager, Incident Commander and more).
- **Traits**: people arrive with traits (Vibe Coder, Old Guard, Job Hopper, Night Owl, Caffeinated) and earn some by doing the work (Natural Mentor, Paranoid, Visionary).
- **Meaning, strain and Purpose**: automation drains meaning, load builds strain, and a mission picked in the Agents era sets a Purpose that later decisions test. Spoken: "The spreadsheet does not have to answer the phone." `id: mission_statement` `id: mission_test_support` `id: mission_test_demo`
- **Automation and oversight**: from the ChatGBT era, dial automation per function and pick the model that runs it; from Agents, overseers watch the agents and catch rogue behaviour.
- **Rogue agent incidents**: from the Agents era, each ends in a decision that offers a public postmortem.
  - "The agent dropped the production database". `id: agent_db_wipe`
  - "Every customer got an email". `id: agent_mass_email`
  - "The agent followed the wrong instructions". `id: agent_prompt_injection_leak`
  - "The agent fixed pricing". `id: agent_pricing_rewrite`
  - "The support bot promised refunds". `id: support_refund_hallucination`
  - "The cloud bill has feelings", staged with a hot rack (see Fumes). `id: agent_runaway_spend`
- **Security incidents**: credential stuffing, supply chain, exfiltration, ransomware and CEO phishing, with a security posture to build in Ops. `id: credential_stuffing` `id: supply_chain` `id: data_exfiltration`
- **Outages**: a live product can go down; when nobody on staff can debug it, the game asks whether to call consultants. `id: outage_unfixable`
- **Research**: internal tools (Eval Harness, Agent Sandbox, Observability, CI/CD, Design System, Docs Culture, Onboarding Kit, Red Team Suite) built as projects.
- **Policies**: switched on in the Policies panel, some in pairs that exclude each other.
  - **Standups**: daily in person (see Standups under People) or async in #standup, where the quiet ones stop posting. `id: daily_standups` `id: async_standups`
  - **Culture policies**: AI as Pair, Craft Fridays, Blameless Postmortems, Code Comprehension Reviews, Apprenticeships and Sabbaticals. `id: pair` `id: craft_fridays` `id: blameless` `id: comprehension_reviews` `id: apprenticeship` `id: sabbatical`
  - **Crunch or not**: Crunch Mode trades later exhaustion for output now; No Crunch halves how fast exhaustion builds. `id: crunch` `id: no_crunch`
  - **HQ perks**: Top-of-Market Pay and Office Upkeep ("chairs that do not squeak"). `id: top_pay` `id: office_upkeep`
  - **Incentives Program**: the reward ladder under Staged moments. `id: incentives`
- **Unlocks**: Marketing, Ops, Research, Models, Automation, Meaning, Career Paths and Standups each arrive with a one-time explainer card. `capture 4-6-unlock-card`
- **Goals and trophies**: milestones from "Place two desks" to "Ten years", each with a small reward; trophy goals fill a shelf. The goals card and list say "3 of 5 done", and a count goal shows a thin bar with how far along it is.
- **The rival**: a named rival company appears, jabs at you in Yak, may raise a mega-round, and can die, be acquired or merge with you. `id: rival_appears` `id: rival_merge` `id: rival_megaround` `capture 2-6-rival`
- **Buying small companies**: from Agents, @dealbot lists small companies for sale (Tidybox, Clerkwise, Brisket...) and you can make an offer. `id: deals_open`
- **The moonshot**: at HQ in Consolidation, a secret project behind a curtain with check-ins and an unveiling. `id: moonshot_checkin` `id: moonshot_result`
- **Annual calendar**: yearly beats.
  - **The Saasies**: awards (Product of the Year, later Best AI Feature, Best Place to Work and Most Trusted) announced by @saasies, with confetti and a party. `id: awards_show`
  - **SaaSCon**: skip it, or book a small or big booth. `id: conference_expo`
  - **The AI Summit**: a side-room talk or a live main-stage demo, a big panel, or a hackathon prize. `id: ai_summit` `id: ai_summit_panel` `id: ai_summit_hackathon`
  - **The hearing**: a summons to testify, then the committee report. `id: hearing_summons` `id: hearing_report`
  - **Year in review**: a summary of the year. `id: year_summary`
- **Alumni**: long-tenured people sometimes leave on good terms, then send referrals, start competitors or come back for a reunion. `id: alumni_referral` `id: alumni_competitor`
- **Endings**: each ends with a score and an epilogue that retells the run. `?mock=ending`
  - **Retire**: take an IPO ("rang the opening bell") or an open acquisition offer. `id: acquisition_offer`
  - **Out of runway**: the epilogue opens "The money ran out on a Tuesday."
  - **Collapse**: an outage nobody can fix hits the main product.
  - **The 20th anniversary**: the natural end of a career, with the option to play on. `capture 5-6-anniversary`

## The office (stages, items, perks)

- ★ **The office move**: the next office drops from above onto the old one, presses it flat, squashes on landing and puffs dust; a stinger plays. `capture 2-2-office-move`
- **Garage**: a suburban lot with lawn, driveway, picket fences, houses behind, a roll-up garage door and a water heater in the corner. `?mock=garage`
- **Office Floor**: a storey of a tower above a plaza among neighbouring buildings, with structural columns that fade when someone stands behind them. `?mock=floor`
- **HQ Building**: a campus plaza with planters, trees, lamps, a road and a skyline. `?mock=hq`
- **HQ expansions**: Knock-through (old wall lines become metal thresholds), Roof Terrace (plank decking, glass balustrade, string lights; outdoor-friendly items only) and The Annex (a carpeted extra wing); each swaps the shell in place with a dust puff. Spoken: "They have measured that wall more than our product." `id: floor_next_door`
- **Build mode**: a tile grid and a tinted ghost; R rotates, adjacency previews glow under what an item would boost, and "Place for me" works without aiming. On touch a tap aims the ghost, a drag that starts on it carries it (any other drag pans), Rotate turns it in place, and a tap on it or the Place button puts it down. `capture 2-1-build-mode`
- **New toys**: something to use (a table game, a couch, the coffee corner, an arcade) that's just been placed draws the nearest free people straight away: a pair table's first game starts within a second, even during a standup.
- **Desk sets**: one person each; a team mat under each set is tinted by the sitter's role, and neighbouring desks butt into a bench. `id: desk`
- **Meeting table**: standups gather round it and tuck the chairs in. `id: meeting_table`
- **Whiteboard**: boosts inventiveness nearby; hard-problem people stand at it thinking. `id: whiteboard`
- **Coffee corner**: a kettle, a drip machine and a "World's Okayest Dev" mug in the description; people stop by to sip. `id: coffee_corner` `id: coffee`
- **Potted plant, bookshelf, couch**: small recovery and learning boosts; people browse the shelf and sit on the couch. `id: plant` `id: bookshelf` `id: couch`
- ★ **Foosball**: two people play head to head. An orange ball runs between the rods, the rods slide after it and whip round when a man kicks it back, and now and then it drops into a goal and a new one pops out at the centre. At the end the winner celebrates with a sparkle and the loser groans. `id: foosball`
- ★ **Ping pong**: a real volley, the ball arcing paddle to paddle and bouncing once each side, then a winner's cheer and a loser's groan; a ping pong sound plays. `id: ping_pong_table` `id: pingpong`
- **Espresso machine**: a drip pot on a cart, then a prosumer machine and grinder, then a chrome bar. `id: espresso`
- **Plant wall**: two pots, a ladder shelf, then a living wall with a grow light; people water it. `id: plant_wall`
- **Nap pod**: a beanbag (lounge in it, awake and humming), a couch with a blanket, then a sleep pod with a glass canopy (lie down with a zzz). `id: nap_pod`
- **Arcade**: a handheld on cushions (sprawl and play), a cabinet with a stool, then two cabinets and a neon sign; players cheer in their seat with sparkles, over arcade sounds. `id: arcade`
- **Standing desks**: a box on a desk, a motorised desk, then a treadmill desk. `id: standing_desk`
- **Whiteboard wall**: a mobile board, a wide board with sticky notes, then a wall-sized kanban. `id: whiteboard_wall`
- **Library nook**: a bookshelf, then an armchair for reading, then a reading nook with lamp and rug. `id: library`
- **Monitoring wall** (Agents era): one screen, then a console, then a tiled video wall with a bar per automation function that flashes red on alarm; overseers stand in front of it. `id: monitoring_wall`
- **Server racks**: one rack, two with a cable tray, then a glass-door row with a cold-aisle glow; blinking LEDs. `id: server_rack`
- **Trophy case**: a low shelf, a glass case, then a lit display wall for the Saasies. `id: trophy_case`
- **Desk screens**: code, UI, charts and games by desk; grey for coasting or burnt-out sitters, red during an outage, off when empty.

## People (characters, poses, emotes, moods, traits)

- **Chibi staff**: big-head characters with varied hair, builds, accessories (glasses, headphones, beanie, cap) and role garments (hoodie, blazer, headset, vest); a role-coloured ring under each. `capture 3-1-lineup`
- **Portraits**: menus show each person as a portrait rendered from their 3D character. `capture 3-2-portraits`
- **Moods**: typing when fine, slumped when coasting, head down when burnt out; tired people droop, and sometimes nod off at the desk.
- **Emotes**: sweat, sparkle, storm, lightbulb, heart, zzz, exclamation, music notes, typing dots and tired, popping over heads so state reads without the UI.
- **Arrivals and departures**: a hire walks in from the door with a sparkle; a leaver waves goodbye with a heart, or a storm cloud when fired, and walks out.
- **Assignments you can see**: mentors stand at their mentee's desk with hearts; hard-problem people think at the whiteboard; people away, remote or on sabbatical leave by the door, and a desk gets an "ON SABBATICAL" sign.
- **Legends**: someone who reaches level 20 wears a gold halo.
- **Conversations**: a spoken exchange turns two people to face each other (a far speaker walks over) while the listener types "..." until the reply; people also mutter solo lines to nobody. Ordinary speech, including standups, shares one bubble slot, a quiet beat between lines and a cooldown for each person. Reading time stays long enough at every game speed; moment lines bypass the ambient cooldowns and take turns in a queue. Launches, awards and company celebrations draw their own spoken pools.
- **Yak typing**: posting in Yak shows a short typing emote, never a bubble.
- **Standups**: everyone gathers round the meeting table or whiteboard, the most interesting few speak (blockers, silences, jokes), the rest nod and wave. `capture 3-5-standup` `id: daily_standups`
- **Incident rush**: the nearest few people sprint to the servers with exclamation marks; a caught incident sends just one. `?mock=incident` `capture 5-2-incident`
- **Launch and award parties**: confetti bursts and everyone with room celebrates on the spot. People talk about the launch or award, such as "We shipped it. I am taking my hands off the keyboard."
- **Pets**: a dog makes rounds leaving hearts, naps in a sunny spot or on a couch and chases the cat; a cat sleeps on a rack or a desk, knocks a pen off a desk and only visits its favourite person. Names include Kernel, Waffles, Null and Sudo. `capture 2-4-pets` Spoken: "The dog has a laminated portfolio." Spoken: "The carrier is conducting a silent interview." `id: pet_request` `id: cat_request`
- **Voice barks**: clicking a person plays a short voice bark with an emotion that fits their state.

## Staged moments

Staged decisions have short spoken pools in `src/data/moment-talk.js`: the subject, the staged reader and nearby colleagues discuss the prop while its card or Yak prompt is open, then respond to the chosen outcome. Lines play one at a time even while the decision holds the clock. A spotlight drops unrelated bubbles nearby and on screen, and halves distant ambient chatter. Skip discards its queued dialogue.

- ★ **Pizza**: pizza boxes on a desk draw two or three idle people to eat round them, some with hearts; the boxes stay two weeks after "Host it". Spoken: "The pizza has a clearer roadmap than we do." Spoken: "A whole week. We could finish naming the prototype." `id: pizza` `id: hackathon` `id: hackathon_week` `find.js hackathon --choice 0`
- ★ **Screen takeover**: every monitor turns red (bridge loan) or shows a bobbing skull with "PAY 12 BTC TO 0xDEADBEEF..." (ransomware), and seated staff recoil with exclamation marks. Spoken: "The red screens are being unusually consistent." Spoken: "The skull has better animation than our loading screen." `id: screen` `id: bridge_loan` `id: ransomware`
- ★ **Sledgehammer**: someone fetches the sledgehammer, shoulders it and sizes up the back wall; on "Knock them down" they swing and dust bursts off the wall; otherwise they carry nothing back. Spoken: "That is a very physical collaboration tool." `id: hammer` `id: open_plan_office` `find.js open_plan_office --choice 0`
- **Pet carrier**: the requester bends over the carrier by the door and peers in; on "Fine. One cat." the cat steps out of it. `id: carrier` `id: cat_request`
- ★ **The printer**: on "Take it out back", two people carry the jammed printer low between them while a third follows with a bat on the shoulder, all in time with a music cue; they set it down, the bat lands on each shouted word, and the wreck is left outside (just inside the door on the Office Floor). The camera follows it and a caption runs. The relief line waits for the final blow. `id: printer` `id: printer_jam` `find.js printer_jam --choice 0 --stage floor` `capture nods-printer`
- ★ **The first user test**: halfway through the first product a stranger sits at a desk trying it while the two founders crouch out of sight, peeking; "Watch in silence" makes them flinch together, "Explain everything" sends one bursting out to point at the screen, "Skip it" sends them back. Camera and caption follow. Spoken: "They found a button we forgot about." `id: visitor` `id: first_user_test` `find.js first_user_test --snapshot`
- ★ **The consultants**: two consultants in suits and glasses, one seated interviewing, one standing with a clipboard, with a nervous colleague in front of them. Spoken: "Both clipboards are writing the same thing." `id: visitor` `id: efficiency_consultants` `capture nods-consultants`
- **The letter**: its named reader leaves a walk, standup or celebration to sit at their desk, then gets up, reads the sheet (red stamp showing through), slumps, and sits back down, chair rolling out and in. Tight desk rows use a clear spot behind the chair or nearby. Pending reader claims release when the envelope disappears or the Low-quality emote starts. Staff the simulation marks away leave the letter and stay away. Spoken: "That envelope looks heavier than paper." Spoken: "That paper has its own legal department." `id: resignation_letter` `id: hearing_summons`
- **Fumes**: smoke from the coffee machine or a server rack glowing orange with rising heat brings someone over to fan it frantically. Spoken: "That rack is working harder than our business model." Spoken: "That is not steam with a positive outlook." `id: coffee_machine_broke` `id: agent_runaway_spend`
- ★ **The Waffle Party**: the top incentive reward; a cart rolls in, the room goes dark round one warm pool of light, the winner eats a towering stack alone under bunting while colleagues crowd in to watch, whisper, point and shake their heads; their whispers and the winner's thank-you take turns in bubbles; a stinger and group cheer play, and the winner's caricature goes up after. `id: waffle_party` `capture 5-4-waffle-party-real`
- ★ **Music night**: a speaker cart rolls in, the room dims under a pool of the genre's colour pulsing on the beat, the winner commits fully to the genre's dance while others bob or shuffle stiffly, the winner and onlookers take turns speaking about the music, and the dance ends when the track does. `id: music_night` `id: music_night_genre` `capture 5-4b-music-night-real`
- **Minor incentive rewards**: the Incentives Program climbs a ladder every couple of months. `id: incentives`
  - **Finger traps**: a quick cheer, a sparkle and a puff of confetti ("I cannot get my fingers out. Thank you, though."). `id: finger_traps`
  - **Balloons**: tied to the winner's desk until the next award. `id: balloons`
  - **Caricature**: a framed big-head portrait of the winner on the wall under a picture light ("I look like a tired walnut. I love it."). `id: caricature`
  - **Melon bar**: a cheer and confetti; Yak warns everyone off the honeydew. `id: melon_bar`
- **Moment camera**: during the printer, the user test, the consultants, the walls coming down and the incentive parties, the camera glides in and back out, and lets go as soon as the player steers.
- **Spotlight**: the fun staged moments (the printer taken out back, the user test, the consultants, the walls coming down, the waffle party, music night) hold the game clock while they play, so no week slips by behind them; the office and the sound carry on. Routine life (standups, coffee, pair games) never holds it. Its caption carries a Skip button that ends the moment and lets the clock run; at the fastest speed a spotlight skips itself and leaves its caption as a toast.

## Decisions that show up in the office

Props appear on the desk, wall, floor, kitchen or door while a decision is open; some choices leave a prop behind.

- **The resignation letter**: an envelope on the burnt-out person's desk. `id: resignation_letter`
- **The hackathon**: pizza boxes; "Host it" leaves them two weeks. `id: hackathon` `id: hackathon_week`
- **Team offsite**: a lakeside cabin brochure ("zero wifi. zero Yak."); "Book the cabin" leaves a lake photo of the team, one mid-splash, captioned "best offsite ever", for a year. Spoken: "The lake has no status indicator." `id: team_offsite`
- **The no-show and the overwhelmed junior**: sticky notes on the desk. Spoken: "The sticky note is doing all the communicating." Spoken: "Those notes could use another pair of eyes." `id: no_show` `id: junior_overwhelmed`
- **The pivot**: marker boxes, arrows and a circled "?!" on the whiteboard; "Pivot" leaves sticky notes. Spoken: "The whiteboard has changed industries again." `id: pivot_pitch`
- **Open plan**: a sledgehammer on the floor by the wall. `id: open_plan_office`
- **Founder burnout**: a leaning tower of mugs on the founder's desk; "Push through" leaves one absurd bin-sized mug on the floor for months. Spoken: "That is too many mugs for one person." `id: founder_burnout`
- **Enterprise RFP and the bank install**: a thick binder on the desk. Spoken: "The questionnaire needs its own onboarding." Spoken: "The bank sent a binder with hosting requirements." `id: enterprise_rfp` `id: onprem_bank`
- **Red screens and the skull**: office-wide screen takeovers. `id: bridge_loan` `id: ransomware`
- **The cloud bill has feelings**: a server rack running hot. `id: agent_runaway_spend`
- **The CEO wants gift cards**: a stack of gift cards on the desk. Spoken: "The gift cards are a strange enterprise feature." `id: phishing_ceo`
- **The first user test and the consultants**: a visitor chair pulled up. `id: first_user_test` `id: efficiency_consultants`
- ★ **Lockdown**: moving boxes by the door, a monitor peeking out, then the office empties. Spoken: "My monitor is coming home before my desk." `id: lockdown_start`
- **Pets**: laminated dog photos on a desk; a cat carrier by the door; a chewed network cable after a pet mishap. Spoken: "The network cable lost a very short argument." `id: pet_request` `id: cat_request` `id: pet_mishap`
- **Days since the rival copied us**: "Rise above it" hangs a sign with the rival's name and a flip counter stuck on 0, until the rival is gone. `id: rival_jab`
- **The invoices**: an itemised agent invoice stamped PAST DUE with a total of "$$$$$$"; the classic-era hosting bill uses the same sheet. Spoken: "The invoice has an appendix for thinking." Spoken: "The bill charges us for leaving." `id: agent_invoice` `id: cloud_bill`
- **The floor next door**: a tape measure run out across the floor. `id: floor_next_door`
- **The mission**: "Make software people love" hangs a shelf mug reading SOFTWEAR, the swapped letters in red, for a year. `id: mission_statement`
- **The printout**: a one-star review with a red bar chart, taped up for the support test, the moonshot pitch, SaaSCon and the coffee corner review. Spoken: "The logo is ahead of the feasibility study." Spoken: "The expo flyer lists coffee as a strategic opportunity." Spoken: "The coffee review is harsher than our product reviews." `id: mission_test_support` `id: moonshot_pitch` `id: conference_expo` `id: coffee_wanted_corner`
- **SaaSCon booth**: a box of swag with a folded banner, for a few weeks. `id: conference_expo`
- **The hackathon prize**: sponsoring the AI Summit hackathon hangs a giant novelty cheque made out to "Winner". `id: ai_summit_hackathon`
- **The hearing**: a very thick envelope. `id: hearing_summons`
- **The reunion**: hosting it hangs the old pre-rebrand sign, "the old logo. we miss it." `id: alumni_reunion`
- ★ **Ping pong**: a taped-up print, "PING PONG? morale +100%* (*citation needed)"; "Buy one" grants a real table, "Not yet" adds a ball someone drew on in marker until one arrives. Spoken: "The table in the picture is very quiet." `id: ping_pong`
- **Demo day**: a smoothie for courage on the desk. Spoken: "The blender is rehearsing louder than the pitch." `id: investor_demo_day`
- **The moonshot**: "Fund the moonshot" puts up a curtain on a rod until the unveiling. `id: moonshot_pitch`
- **The last bet**: "One last moonshot" covers the whiteboard in scrawl. `id: last_bet`
- **Coffee**: a smoking coffee machine (the fancy option upgrades the espresso machine); a French press "with a guard" that stays until an espresso machine arrives; a one-star coffee review. Spoken: "The French press has a dedicated security team." `id: coffee_machine_broke` `id: coffee_wanted` `id: coffee_wanted_corner`
- ★ **Office Space set**: the banner, the TPS cover sheets, the red stapler, the consultants and the jammed printer (see Nods). Spoken: "The banner has a question and no answer box." Spoken: "The cover sheet has acquired a cover memo." Spoken: "That stapler has a stronger sense of belonging than I do." `id: banner_company` `id: cover_sheets` `id: the_stapler` `id: efficiency_consultants` `id: printer_jam`

## Yak

- **Picture meme art**: six office parodies in Fredoka: This is fine, Two buttons, Tabs chart, Always config, Reject/approve tests and Expanding review. Renderer captures live in `public/memes/` at 480x360 and 1200x900; regenerate them with `scripts/reels/memes.mjs`.

- **Feed pacing**: messages arrive with reading time between them at every game speed. Important posts take priority; prompts and the player's own replies arrive immediately. Stale ambient backlog is skipped in the live feed, with the full recent history kept in the save.
- **Channels**: #general, #incidents, #wins, #random and #standup, with unread badges; threads stay together, reactions show counts, names are clickable to find the person.
- **Layout**: drag the top edge to resize, maximise into a large overlay, or collapse it (collapsed by default on phones).
- **Mentions**: "@channel" and "@here" render as mention pills.
- **Bots**: @launchbot, @pagerbot (SEV lines), @vendorbot, @newsbot, @dealbot, @saasies, @facilities, @officebot, @buildbot and @hackerspewsbot ("Show HS: Notes but with AI").
- **Image memes**: a Yak post that carries a picture shows it framed in the message, larger in the big Yak; a tap opens it over the game and a tap or Esc closes it. A picture that fails to load reads as its caption instead.
- **Reply prompts**: a staff post with two or three founder replies, each with its effect hint; a flag on the Yak header points to an open one, and ignoring it has its own consequence.
  - **Strain vent**: "Is it just me or has this sprint been three sprints?" Friday off, or ship Friday then rest. `id: strain_vent`
  - **Incident blame**: "Okay, who pushed to prod on a Friday?" A blameless postmortem, or fix it and talk later. `id: incident_blame`
  - **Launch hype**: "We launched {product}. My mom liked the post. Can you like the post?" A hype post, cake at 4, or back to the roadmap. `id: launch_hype`
  - **Rival itch**: the rival shipped last month's demo; rise above it or one tasteful reply. `id: rival_itch`
  - **Project late**: "Do we cut scope or cut sleep?" `id: project_late`
  - **Agent PRs**: "The coding agent opened 40 pull requests overnight." Review every one, or merge the green ones. `id: agent_prs`
  - **New hire lost**: "is there a map of the codebase, or do I just walk in and hope?" `id: newhire_lost`
  - **Coasting check**: "just moving tickets from one column to another?" `id: coasting_check`
  - **Support swamped**: "I have started talking to the tickets." `id: support_swamped`
  - **Low-cash lunch**: "are we a sandwich company now?" `id: lowcash_lunch`
  - **Desk squeeze**: "I am currently sharing a desk with the printer. The printer is winning." `id: desk_squeeze`
  - **Junior PR**: "It is small. It is one line." `id: junior_pr`
  - **Low-stakes events in Yak**: six small decisions arrive as officebot posts with the event's own choices instead of pausing popups: the two coffee-machine requests, the dog on Fridays, a new model dropping, a senior's weekend side project and the app store rejection. Their staged props show while the prompt is open, and left unanswered, the mildest choice happens (never one that brings in an item or a pet).
- **Quick posts**: a Post button at the foot of Yak opens a picker; each post lands, falls flat or backfires depending on the moment, and the team's replies thread under it. The office reacts too: a backfire gets a facepalm from whoever faces you, the two nearest turn to look and a couple more sweat; a post that lands gets a sparkle or two.
  - **Pep talk**: backfires mid-outage ("Respectfully, the servers are on fire."). `id: pep_talk`
  - **Who broke prod?**: helps during an outage; with nothing broken it just scares people ("Why are you asking. What do you know."). `id: who_broke_prod`
  - **Share a meme**: "[a cat knocking a mug off a desk, captioned "me, merging on a Friday"]". `id: meme`
  - **Pizza's here**: costs per head, lifts meaning and stamina ("There is a vegetarian one, and it is being guarded."). `id: pizza`
  - **Announcement**: with real news it lands; with none, "Is this a layoffs thing?". `id: announcement`
- ★ **The @channel offender**: one over-notifier per run pings everyone about their yogurt, "happy friday" on a Thursday or a typo at 2 a.m.; once, during a real outage, it is warranted.
- **Running jokes**: slow callbacks weeks apart with the same cast. The framework migration that circles back to the first framework; the sandwich bet ledger; the unclaimed "World's Okayest Boss" mug; the sock project that gets an acquisition offer from the company; "good news" from the engineer hosting the database at home. `id: joke_framework_circle` `id: joke_sandwich_bet` `id: joke_okayest_mug` `id: joke_sock_project` `id: joke_ten_x_good_news`
- **Running jokes in Yak**: the fridge sign that grows a changelog; the lunch place that will not stop sending olives; the coding assistant rules file that reaches 900 lines before "please" works. `id: joke_fridge_sign` `id: joke_no_olives` `id: joke_rules_file`
- **Chatter**: mood-driven lines in #general ("Reviewed 40 PRs. Understood 6.", "My therapist knows our deploy schedule.").
- **Incentive speculation**: each incentive reward gets a Yak post and replies ("I touched the honeydew.").
- **Office Space follow-ups**: @facilities chases the cover sheet memo three weeks running; @officebot reports the red stapler found in the lost and found.

## Nods and parodies

- ★ **"Is this good for the company?"**: a corporate-blue banner high on the wall; hang it, hang it ironically (a visiting investor may post it sincerely), or send it back. `id: banner_company` `capture nods-banner`
- ★ **TPS reports**: a squared stack of cover sheets with the memo on top; mandating them brings three weeks of @facilities reminders. `id: cover_sheets` `capture nods-cover-sheets`
- ★ **The red stapler**: a red stapler on a veteran's desk; letting them keep it leaves it until they leave. `id: the_stapler` `capture nods-stapler`
- ★ **The two Robs**: "So what would you say you do here?" `id: efficiency_consultants`
- ★ **PC LOAD LETTER**: a printer with a blinking light and a screen reading PC LOAD LETTER that beeps on a loop while it sits in the kitchen; "Print less" puts up an OUT OF ORDER. FOREVER. sign. `id: printer_jam` `npm run capture -- --group nods`
- **"Yeahhh, Saturday"**: a senior leans on your desk with a mug; the refusal is "No. Mmkay?". `id: saturday_ask` `capture nods-saturday`
- ★ **The incubator house**: early on, a would-be mentor offers free rent in his house for a cut of the company; a hand-painted INCUBATOR sign by the door; move in (and a year later he's on a podcast calling himself your founder), keep the garage, or counter. Spoken: "The sign says mentor. The fine print says equity." `id: incubator_house`
- ★ **The Box**: the rival's brushed-aluminium cube that does less for four times the price; build your own (a little cube lands on a desk), stay software (the Box gets recalled), or mock it. Spoken: "The poster makes software look very heavy." `id: the_box`
- ★ **Four thousand pounds of oat milk**: during the first 26 weeks of the Agents era, a company with at least eight staff and 25% ops automation can get pallets in the lobby when its procurement agent fixes the Thursday shortage; once per run, send it back, keep it, or donate it. Spoken: "The lobby has become a dairy alternative." `id: oat_milk`
- ★ **Tabs or spaces**: a running joke between two engineers that escalates over weeks to two whiteboards and ends in a ruling. `id: tabs_or_spaces`
- **Is it kielbasa?**: a junior's weekend app that is extremely confident and right half the time; ship it, sell it, or keep it as the office party trick. `id: is_it_kielbasa`
- **The Squish Score**: a compression research node whose launch post cites a score of 5.2 on a scale nobody can explain. `id: squish`
- **Model vendors**: Claudius (declines to delete prod, at length), ChatGBT ("Great question!"), Gemenai, Grokk, Llamarama, DeepSleep and Mistrale (comes with a small baguette). `id: claudius` `id: chatgbt` `id: gemenai` `id: grokk` `id: llamarama` `id: deepsleep` `id: mistrale`
- **Incumbents**: Notian, Gmale, Jirra, Zendisk, Salesfarce, Lookerish, Figmo, GitHug, Workdai, LinkedOut, Quickbucks, Adobo Premiere, LexisNaxis and CrowdStrife. `id: notian` `id: gmale` `id: jirra` `id: zendisk` `id: salesfarce` `id: lookerish` `id: figmo` `id: githug` `id: workdai` `id: linkedout` `id: quickbucks` `id: adobo` `id: lexisnaxis` `id: crowdstrife`
- **Industry parody**: Product Hunch Day, Hacker Spews, SaaSCon, the Saasies, a Grokk PR scandal, the blockchain pitch and "Mint a coin". `id: grokk_pr_scandal` `id: blockchain_pitch`
- **Rival jabs**: a dartboard with the rival's logo as the bullseye (three darts in it) and "beat <rival>" underlined twice on the whiteboard, crossed out once they are gone. `capture 2-6-rival`
- **The pandemic**: the office closes, everyone takes a monitor home, and the video call runs the classics ("You are on mute.", "We can see your inbox.", "You froze mid-sneeze. That is your portrait now."). `id: lockdown_start` `id: work_policy`
- **The incentive ladder**: finger traps, balloons, a caricature, a melon bar, a music night and THE WAFFLE PARTY ("No. We watch."). `id: finger_traps` `id: balloons` `id: caricature` `id: melon_bar` `id: music_night` `id: waffle_party`

## Eras and time of day

- ★ **Era arrival**: a big era card, a stinger, a group cheer, a swell of window light, and the office redresses itself piece by piece. `capture 2-5-era-arrival`
- **Classic SaaS**: boxy pre-AI monitors, a "HANG IN THERE" cat poster, an employee-of-the-month board ("still you, Dave") and a wall clock. `id: classic`
- **The ChatGBT Moment**: prompt sticky notes on desks, a "TRY AI (*results may vary)" poster, a glowing "now with AI!" sign, and a "PROMPT OF THE DAY" poster with a tip jar for tokens. `id: chatgbt` `id: era_chatgbt`
- **Agents**: green status lights on desks, a lit "AGENTS ONLINE: 128" board, "LET THE AGENTS COOK" and "IS A HUMAN STILL IN THE LOOP?" posters. `id: agents` `id: era_agents`
- **Consolidation**: compliance binders on desks, lawyer-grey boardrooms, a "TWO COMPANIES. ONE SYNERGY." banner ("please stop asking about layoffs"), "All ideas now require legal review.", and a "NEW ORG CHART" ("you are here, probably"). `id: consolidation` `id: era_consolidation`
- **The Plateau**: notebooks and hand-thrown cups on desks, a pinboard of sketches joined by yarn, a shelf of pottery, and a "TOUCH GRASS: handmade here" poster; warmer light. `id: plateau` `id: era_plateau`
- **Era colour**: each era adds a wainscot band and emblem in its colour, a faint floor wash, a tint on the skyline and its own light tone.
- **Day and night**: a real-time day cycle; the sky gradient shifts, windows show a skyline blended by daylight, lit windows appear across the city at night, and interior lamps come on. `?mock=night` `?time=night`
- **Surroundings**: drifting clouds, trees, cars and street lamps round the diorama board, placed so a turned view never hides the office.
- **Lockdown light**: the office dims, plants wilt over the weeks and recover after, and one stayer wanders and naps on the couch. `capture 5-3-lockdown`

## Sound and music

- **Music per era**: a title theme, then several beds per era rotating as a playlist with bar-synced crossfades; an era change waits for its card. `id: classic` `id: chatgbt` `id: agents` `id: consolidation` `id: plateau` `capture 6-1-music-title`
- **Music mood**: a low-pass filter when paused, a muffled mix during lockdown, tension during an outage, a slight lift in a crunch.
- ★ **Music night genres**: Corporate Synthwave (a robot dance), Motivational Polka, Aggressive Bossa Nova and Sad Lo-fi, each with its own track and dance. `id: corporate_synthwave` `id: motivational_polka` `id: aggressive_bossa_nova` `id: sad_lofi`
- **Stingers**: launch, era, office move, waffle party, win and game over, ducking the music. `capture 6-1-stingers`
- **The printer cue**: a music cue timed to the printer carry and smash; on Low, where the moment does not play, a smash sound marks the wreck.
- **Office Space sounds**: a stapler click, a memo, a banner unfurl, and the jammed printer's beep loop.
- **World sounds**: foosball, arcade and ping pong when in use, the coffee machine and pets now and then, a typing bed that follows how many people are working, a door for arrivals and departures. `capture 6-2-sfx`
- **Voices**: short barks from a cast of voices, with emotions (happy, excited, laughing, questioning, annoyed, tired, sighing); staggered group cheers over a crowd bed for launches, waffle parties, music nights and eras; a sigh for a burnout exit, a warm goodbye for a friendly one. `capture 6-3-voices`
- **Event sounds**: alarms for incidents, a save sound for caught ones, outage and fixed cues, hire and resign, awards, rewards, and a soft ping for Yak prompts.
- **Growth sounds**: a soft chime when someone levels up (spaced out, and skipped at top speed and on Low), a brighter stinger for a promotion,, which replaces the chime for the level-up that caused it, and a small pop for an earned trait or a trained skill.

## Interface

- **Title screen**: New Game, Continue, Settings over the live diorama; several save slots with export and a two-tap delete. `capture 1-1-title-saves`
- **Welcome back**: Continue opens a recap of where the company stands and what happened last. `capture 1-1-continue-recap`
- **HUD**: cash with the weekly change, the date with the era emblem, brand, know-how, debt and (late) fame meters, speed buttons (1x, 2x, 4x) and a quick mute. `capture 4-1-hud`
- **Needs strip**: things waiting on the player, most urgent first, each with a click-to-fix and sometimes a one-tap fix.
- **Panels**: Build, Staff, Marketing, Model Vendors, Automation, Policies, Ops and Security, Office and Reports, unlocking left to right as the game goes. `capture 4-3-build-panel` `capture 4-4-reports`
- **Decisions and toasts**: decision cards dock right with a light dim; toasts stack top right and dock inside an open panel so they never cover its controls. A toast too long for its box shows a "more" cue and opens in full on a tap.
- **Moment captions**: a single fading line near the bottom while the printer, the first user test or the consultants play.
- **Scene tips**: hover (or long-press) a person or item in the office for a tooltip; clicking a person opens them in Staff, clicking an item opens its card to move, upgrade or sell.
- **Coach marks**: dismissible tips for the HUD and speed controls.
- **Game over**: a headline, a score breakdown and epilogue lines revealed one at a time. `?mock=ending`
- **Settings**: Auto, Low or High quality, tilt-shift, pause while menus are open, pause on focus loss, "Camera follows big moments", default speed, how much Yak asks for attention, and volume per bus (music, ambience, effects, interface, voices). `capture 4-7-settings`
- **Yak level**: All, Important or Off, in Settings and on a button in Yak's header. Important counts only incidents, wins and bot posts as new; Off keeps Yak shut with no unread count. A reply prompt still shows its Reply mark at every level.
- **Camera**: drag to pan, wheel to zoom, Q and E to turn the view in 90 degree steps.
- **Growth**: a promotion, an earned trait or a trained skill gets a toast with the person's portrait that opens their card; level-ups mark Staff as new, rows show a New pip, and the card lists what grew since you last looked and a growth timeline (levels, promotions, traits, training, a chosen path, becoming a legend) that is saved with the game.

## Touch and low-end support

- **Phone layout**: narrow or short touch screens get a stacked layout, "Tap" copy, a tray folded into a badge strip and Yak collapsed.
- **Touch input**: one finger pans, a pinch zooms and pans, a pinch is never a tap, and long-press stands in for hover everywhere.
- **Touch building**: the first tap aims the ghost and shows the reason and adjacency, a second tap on the same spot places.
- **Touch-sized controls**: picker rows grow for fingers, toasts dock two at a time, and quick posts open as a sheet.
- **Low quality**: no ambient occlusion, bloom or tilt-shift, fewer interior lamps, lighter procedural poses, scenery without trees, clouds, cars or lamps, no typing bed, fewer cheer voices, and staged moments shrink to an emote with nobody walking.
- **Auto quality**: Auto picks Low on a slow or software GPU.

## Ids left out on purpose

- `letter` and `fumes`: the renderer plays these moments, but they are not in its moment `KINDS` list, so the Staged moments bullets carry their event ids instead.
- Caption keys in `src/data/moments.js` other than `first_user_test`, `efficiency_consultants` and `printer_jam`: the UI caption shows only when the renderer announces a moment, and only those three announce one.
- Events with no `stage`, `grant` or `leaves` (for example `senior_grumble`, `quiet_quitter`, `viral_post`, `vendor_price_hike`, `four_day_week`): decision cards only, nothing staged in the office.
- Research, trait, career path, trend, category, angle, marketing channel, goal, training and policy ids beyond those named above: menu content without an office staging of its own, covered by the panel bullets.
- `@channel` moments and call scripts: they have no ids in the data.
