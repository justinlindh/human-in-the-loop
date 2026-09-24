# Review session plan

A long, interactive review with the user: go through every major element of the game one by one, each backed by media captured from the current build. The user gives feedback per item; the lead turns it into issues and tasks.

## How it works

- **Media per item:** 1080p screenshots, 10 to 30 s video clips (1080p60 from `npm run capture`, deterministic), and audio clips where relevant. They're captured from one build, recorded in the manifest.
- **Presentation:** a review page (one card per item: media, what it is, what changed recently, 1 to 3 questions for the user). Feedback is recorded per card.
- **Order:** the order a player meets things, so the session doubles as a first-playthrough read.
- **Before the session:** capture all media from the latest preview build, then check every card has its media and questions.
- **After the session:** one issue or task per piece of feedback, ranked on the backlog.

## Items

### 1. First contact
| # | Item | Media | Questions |
|---|---|---|---|
| 1.1 | Title screen and save slots | screenshot (empty, with 3 saves), video of Continue and the Welcome back recap | Is the first impression right? |
| 1.2 | Founding: name, logo, founders, funding | video of the whole flow; screenshots of the founder cards and the no-builder warning | Are the choices clear and meaningful? |
| 1.3 | Empty garage, placing the first desks, the tutorial tips | video | Does the opening teach without a wizard? |

### 2. The office
| # | Item | Media | Questions |
|---|---|---|---|
| 2.1 | Build mode: ghost, rotate, adjacency preview, Place for me | video | Does placement feel good? |
| 2.2 | The three office stages and moving between them | screenshots per stage (day and night), video of an office move | Does each stage feel like progress? |
| 2.3 | Perks in use: couch, nap pod, arcade, ping pong, foosball | video | Frequency and charm |
| 2.4 | Pets: dog visits, cat perches and knocks things over, the chase | video | Charm, and whether pets read at default zoom |
| 2.5 | Era dressing: Classic, ChatGBT, Agents, Consolidation, Plateau | 5 screenshots of the same office, plus a video of an era arrival | Does each era feel distinct? |
| 2.6 | Rival touches: the dartboard and the whiteboard scribble | screenshot | Keep, cut, or grow? |

### 3. People
| # | Item | Media | Questions |
|---|---|---|---|
| 3.1 | Characters and variety (hats, hair, outfits, roles) | lineup screenshot, office close-ups | Enough variety? Any looks that don't work? |
| 3.2 | Portraits in menus | hire cards, Staff table and detail, founders, the live portrait | Do they match the characters? |
| 3.3 | Poses: typing, slumped, tired, burnout, napping | close-up video | Readability; the typing tap |
| 3.4 | Conversations: say bubbles, exchanges, reading time | video at 1x and 2x | Too many or too few? Fast enough to read? Funny? |
| 3.5 | Standups: staged in person and at desks | video | Length, and whether it's worth watching |
| 3.6 | Slackk: channels, threads, bots, reactions | screenshots from early, mid and late game | Quality of the writing; volume |

### 4. Screens and decisions
| # | Item | Media | Questions |
|---|---|---|---|
| 4.1 | HUD, Needs You tray, Goals card, Active effects | screenshots | Clarity at a glance |
| 4.2 | Staff and Hire (the stat rework: skills, summary chips) | screenshots | Does the stat display make sense now? |
| 4.3 | Build panel: category, approach or angle, model, team | video | Is starting a product clear? |
| 4.4 | Products, Reports, the rival card, the work-policy card | screenshots | Too much, too little? |
| 4.5 | Decision popups: routine, leadership idea, delayed effects | video of 2 or 3 | Are choices interesting? Is the docked layout right? |
| 4.6 | Unlock cards, era cards, the "New!" slide-ins | video | Pacing of new things |
| 4.7 | Settings: quality, auto-pause, volume | screenshot | Missing options? |

### 5. Moments
| # | Item | Media | Questions |
|---|---|---|---|
| 5.1 | First launch and the review popup | video | Does it feel like a payoff? |
| 5.2 | Incident and outage (alarm, fix, postmortem) | video | Tension without annoyance? |
| 5.3 | Lockdown: the empty office, the video call with mute jokes, the work policy | video | Tone, length |
| 5.4 | Waffle Party and the incentives ladder | video | Funny, or too eerie? |
| 5.5 | Burnout warning signs and a resignation | video | Readable and fair? |
| 5.6 | Year ten, retiring (IPO or acquisition), the 20th anniversary and Keep playing | video | Satisfying endings? |

### 6. Sound
| # | Item | Media | Questions |
|---|---|---|---|
| 6.1 | Music: one bed per era, plus stingers | audio clips, then the same over gameplay video | Style, and the era progression |
| 6.2 | UI and world SFX | audio sheet, then gameplay video | Fit and volume |
| 6.3 | Voice barks: the cast of voices, emotions, the group cheer, clicking a character | audio sheets, then gameplay video | Variety, frequency (less is more) |

### 7. The whole run
| # | Item | Media | Questions |
|---|---|---|---|
| 7.1 | Pacing: the milestone timeline for a 4 to 5 hour run | pace.js timeline chart | Does the curve feel right? |
| 7.2 | Balance: bot outcomes, and money in the late game | balance table | Is the challenge right? |
| 7.3 | Performance: fps table (5090 under load, Low with a CPU throttle) | table | Acceptable? |

## Prerequisites
- `npm run capture` (integrator): deterministic 1080p60 clips with scripted scenarios and camera paths.
- A capture manifest: one scenario per video item above, run against the preview build.
- The audio engine wired in, for 6.x over gameplay; the audio sheets alone work before that.
- The review page (a published page with media and per-card feedback), built once the media exists.
