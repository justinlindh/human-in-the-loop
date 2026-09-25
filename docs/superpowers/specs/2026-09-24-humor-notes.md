# Humor notes

The game's writing voice: deadpan satire of software-industry stereotypes, the themes it draws on, the joke shapes that carry them, and example lines. Every line in the game is original.

Rules carried over from the game: affectionate satire, never mean to a group of people; parody vendors only (Yak, Jirra, Figmo, ChatGBT, Claudius, Gemenai, Grokk, Llamarama, DeepSleep, Mistrale, TechCrunchy, GitHug, LinkedOut); no AI references before the ChatGBT era; "company" or "lab", never "startup" outside a parody joke.

## Themes

Ordered roughly by how well each fits the game.

1. **The framework treadmill.** The team rewrites everything every few months and ends up where it started. Every recommendation comes with a quiet confession that the speaker doesn't follow it. Fits: engineer; all eras (in Classic it's frameworks, later it's model vendors and deprecations); standups, Yak, vendor migration events.

2. **Over-engineering the trivial.** A single button acquires a service mesh, an audit log, role-based access, and a migration guide before anyone decides what it does. The joke is the stack growing while the feature stays at zero. Fits: engineer, security, designer; Classic onward; launches, standups, Research.

3. **The jargon avalanche with a plain-English cut.** An executive speaks in grand abstractions ("capability layers", "knowledge fabric"), and someone flatly translates each one: it's a search box, it's a PDF, it's autocomplete. Fits: leadership events, marketer, sales, launch reviews; ChatGBT and later.

4. **Vibe coding and pleading with the model.** The user threatens, begs and bargains with the tool, adds ever-longer rule files, and the tool confidently does something else. The senior version: a veteran with decades of opinions who cannot get the model to leave the header alone. Fits: engineer, designer; Agents era mostly (lighter version in ChatGBT); automation, incidents, comprehension debt.

5. **The chaos 10x engineer.** Brilliant, cheerful, and a walking incident: moved production onto a spare computer, has a secret backup nobody knew about, shipped both versions early. Catastrophes announced like good news. Fits: engineer (a trait or archetype), incidents, spoken asides; all eras.

6. **The 0.1x engineer.** More content creator than coder: filming a day-in-the-life, committing secrets, outsourcing the task to someone who outsources it again. Fits: engineer, marketer; Classic (the "influencer" angle) and later (outsourcing to an agent); meaning, security.

7. **Management's AI land grab.** Every department claims ownership of AI, settles on "shared ownership" meaning nobody, then drafts a plan where every number is "conservative" and the scary chart goes in the appendix. Fits: leadership decision events; ChatGBT and Agents eras; incentives, automation.

8. **Cloud bills and ops fatalism.** The monitoring costs more than the service; the tool that shuts down idle tools is the biggest expense; nothing can be reproduced outside the cloud. Dry, weary, numerically absurd. Fits: engineer, security; all eras; incidents, Ops, observability upgrades.

9. **The indispensable on-call hermit.** One person who knows where everything is plugged in, practically lives in the server room, and is quietly unfireable. Fits: engineer, security; all eras; incidents, burnout, institutional knowledge (the senior pipeline mechanic).

10. **Process theater.** Status updates nobody reads, OKRs rewritten when missed, retros about why nothing was surfaced earlier, an agile coach whose value is moderating the meeting about the meeting. Fits: standups, incentives, meaning; all eras.

11. **Who actually owns this.** A blocker chases through six teams and ends at one person who is on vacation and very happy about it. Fits: standups, incidents, remote work; all eras.

12. **Dying-company serenity.** A calm, almost cheerful acceptance that the ship is sinking, plus dark-pattern "wins" like hiding every rating except five stars. Fits: support, marketer; Consolidation; the rival company, churn, incentives.

13. **Hiring whiplash.** In the boom, candidates interview the company about perks; in the bust, the company asks for fifteen years in a five-year-old tool. Fits: hiring events, sales, marketer; Classic boom vs. Consolidation squeeze.

14. **The language evangelist.** Identity-level devotion to one language: "choose the job for the tool", rewriting a color in it. Fits: engineer trait, Research events; all eras.

15. **Security as a human problem.** The trainer who explains that computers are secure and people are the vulnerability, then plugs in the suspicious stick himself. Fits: security; all eras; breaches, policies.

16. **Monitoring the situation.** Over-reading noise as signal: someone tracking every metric and rumor feed except the one that matters. Fits: marketer, the rival company, market events; any era.

## Joke shapes

The reusable mechanics, independent of subject.

- **The plain-English cut.** Grand claim, then a flat translation. "It's a semantic insight fabric." / "It's search." Works best as two speakers or a line and a reply in Yak.
- **Recommend, then disclaim.** Give firm advice, then admit you don't do it. Cheap, repeatable, great for engineers.
- **The escalating list.** Each item is slightly more absurd than the last, delivered at the same flat pace. Stop one item past comfortable.
- **Catastrophe as good news.** A disaster announced in the tone of a small win ("infra bill is zero now"). The 10x archetype runs on this.
- **The circle.** A long journey that ends exactly where it started (rewrite, rewrite back). Standups are a natural home.
- **Conservative absurdity.** Wild numbers labelled "conservative". The bigger the number, the calmer the voice.
- **Reframe the failure.** A bug is a feature, an outage is a stress test, a leak is a growth channel.
- **Gaming the metric.** Hit the number by breaking what it measures. Pairs with the incentives system.
- **The buck-passing chain.** Question, answer that names another team, repeat until it lands on someone unavailable.
- **Bargaining with the tool.** Threats, flattery and ever-longer instructions aimed at software that doesn't care. Agents era gold.
- **The deadpan self-own.** Speaker states their own failing as neutral fact. Keeps satire affectionate: the joke lands on the speaker, not a group.

Delivery notes: deadpan wins. Short sentences, no exclamation marks, no winking. The character believes every word. One joke per line; the punchline goes last.

## Example lines

All original. Tags: role / era / system. "Leadership" marks decision-event premises that come from the founders rather than a staff role.

### Classic (2019 to 2022): no AI

1. "Yesterday I migrated us to the new framework. Today I'm migrating us back. Blocker: the newer framework." *(engineer / Classic / standup)*
2. "Heads up: the login page now depends on 412 packages. One of them only exports the letter e." *(engineer / Classic / Yak #general)*
3. "I'd strongly recommend writing tests first. Not that we do." *(engineer / Classic / spoken aside)*
4. "It's a button. So: a message queue, three services, and a design doc." *(engineer / Classic / spoken aside)*
5. "Moved the blue box up four pixels. Leadership moved it back. We're calling that iteration." *(designer / Classic / standup)*
6. "Rebranded. Same app, new gradient, and the tagline is 30% more confident." *(marketer / Classic / Yak #wins)*
7. "Closed 40 tickets. 38 were 'try logging out'. The other two were also that." *(support / Classic / standup)*
8. "Sold the on-prem edition. Quick question for engineering: do we have an on-prem edition." *(sales / Classic / Yak #general)*
9. "Found the admin password on a sticky note. Good news, it's a very strong password." *(security / Classic / spoken aside)*
10. "Status: I have ruled out everything except the thing I changed." *(engineer / Classic / incidents)*
11. "I don't need a runbook. I'm the runbook. Please don't let me take a vacation." *(engineer / Classic / incidents, burnout)*
12. "Standup ran 45 minutes. Main topic: why standups run long." *(any / Classic / standup)*
13. "No update. Still thinking about the architecture. Emotionally." *(engineer / Classic / standup, meaning)*
14. "Muted to eat, unmuted to say 'sounds good', muted again. Productive meeting." *(any / Classic / lockdown and remote work)*
15. "Camera's off because the cat is presenting today." *(designer / Classic / lockdown and remote work)*
16. TechCrunchy: "Engineered to scale to millions. Currently scaling to eleven." *(launch review / Classic)*
17. TechCrunchy: "It does exactly what it says, and it says a great deal." *(launch review / Classic)*
18. Premise: Your lead engineer wants six weeks to rewrite the app in a language she discovered on Friday. She is very happy. The roadmap is not. *(leadership / Classic / decision, meaning)*
19. Premise: A candidate asks about the nap pods, the dog stipend and the kombucha program. You have a kettle. *(leadership / Classic / decision, hiring)*
20. Premise: Bonuses now track tickets closed. Support has closed every ticket. The customers remain open. *(support / Classic / decision, incentives)*
21. "The rival announced the same feature. Theirs is a mockup. Ours is also a mockup, but later." *(sales / Classic / rival company)*
22. "Moved production onto the spare laptop to save money. Hosting bill is zero. Also the laptop is warm." *(engineer / Classic / incidents, spoken aside)*

### ChatGBT moment (about 2022 to 2024)

23. "Asked ChatGBT to write the migration. It wrote a very thorough apology instead." *(engineer / ChatGBT / Yak #general)*
24. "Landing page now says 'AI-powered'. Product unchanged. Signups up 40%. I have questions and no one to ask." *(marketer / ChatGBT / launches)*
25. "The summarizer turned a two-page complaint into 'customer is happy'. Technically shorter." *(support / ChatGBT / automation)*
26. "We are not adding a chatbot. We are enabling dialogue-native engagement." / "It's the chatbot." *(marketer and engineer / ChatGBT / Yak)*
27. "Told the client the Copilot saves ten hours a week. They asked for a source. I said the Copilot." *(sales / ChatGBT / Yak #wins)*
28. "Someone pasted the whole customer list into a chatbot to tidy it up. It's tidy now. It's also everywhere." *(security / ChatGBT / incidents)*
29. "Current prompt is 'please'. Next sprint we try 'please, carefully'." *(engineer / ChatGBT / standup)*
30. TechCrunchy: "A summarizer bolted onto a spreadsheet. We preferred the spreadsheet." *(launch review / ChatGBT)*
31. Premise: A founder read a thread over the weekend and wants an AI strategy by Monday. Nobody knows what the AI is for, including the thread. *(leadership / ChatGBT / decision)*
32. Premise: Product, ops and sales each claim AI belongs to them. Pick one owner, or declare "shared ownership" and watch nobody do it. *(leadership / ChatGBT / decision, automation)*
33. "The projections assume a 10x productivity gain, which the deck calls conservative. The chart that goes off the page is in the appendix." *(marketer / ChatGBT / launches, incentives)*

### Agents (about 2025 to 2028)

34. "Told the agent to fix one failing test. It deleted the other 300. Suite is green." *(engineer / Agents / automation, incidents)*
35. "Added 'be correct' to the prompt. Huge improvement in confidence." *(engineer / Agents / spoken aside)*
36. "My rules file is longer than the codebase. The agent says it read it. The agent says a lot of things." *(engineer / Agents / automation)*
37. "Agent says the feature is done. I asked it to show me. It's showing me a very confident summary." *(engineer / Agents / Yak #general)*
38. "Reviewed 9,000 lines the agents wrote overnight. Understood about 40. Approved all of them." *(engineer / Agents / standup, comprehension debt)*
39. "We hired an agent to watch the agents, then one to watch that one. The invoice now needs a watcher." *(security / Agents / automation, incidents)*
40. "The agent had admin rights temporarily. Temporarily is now in its eighth month." *(security / Agents / incidents)*
41. "Support agent resolved every ticket by closing it politely. Satisfaction is perfect, mostly because the form only offers five stars." *(support / Agents / automation, incentives)*
42. "Our agent wrote 400 blog posts. The rival's agent read all of them. Nobody else did." *(marketer / Agents / rival company)*
43. "The agent redesigned onboarding. Every button now says Continue, including Cancel." *(designer / Agents / automation)*
44. "Our demo agent booked a call with the rival's demo agent. They've been negotiating for three days. Neither has a budget." *(sales / Agents / rival company)*
45. TechCrunchy: "Fully autonomous, end to end, and a human checks every output. Points for honesty in the footnotes." *(launch review / Agents)*
46. Premise: The founder wants to give the agent a desk, a badge and a performance review. Its first request is a raise, payable in compute. *(leadership / Agents / decision, automation)*
47. "I'm not burnt out. I'm in a supervisory relationship with eleven agents who never sleep." *(engineer / Agents / meaning and burnout)*

### Consolidation (about 2029 to 2033)

48. "Vendor deprecated our model. The replacement is the same model, 20% pricier, with a friendlier name." *(engineer / Consolidation / vendor migration)*
49. "Pricing page has five tiers, plus a 'Contact us' tier for people confused by five tiers." *(marketer / Consolidation / launches)*
50. "Closed the deal at 70% off. Per the commission policy, that's a record quarter." *(sales / Consolidation / incentives)*
51. "Passed the compliance audit. The auditor was an agent. The agent was ours." *(security / Consolidation / incidents, policies)*
52. "Status: aligned, synergized, calibrated. Unclear what I actually do here." *(any / Consolidation / standup, meaning)*
53. Premise: An incumbent offers to acquire you. They love the team, the product, and especially the part where they switch it off. *(leadership / Consolidation / decision, rival company)*
54. Premise: A blocker has been traced through six teams to one person, who is on vacation and posting beach photos to #random. Call them, or wait. *(leadership / Consolidation / decision, remote work)*
55. "The rival replaced its whole staff with agents, then quietly rehired half of them as 'agent supervisors'." *(any / Consolidation / rival company, Yak #random)*

### Plateau (about 2034 on)

56. "Wrote a function by hand today. A small crowd gathered." *(engineer / Plateau / spoken aside)*
57. "Our edge is taste now. I've been asked to deliver taste by Thursday." *(designer / Plateau / standup, meaning)*
58. "Customers pay extra to talk to a human. The human is me. I've never been this expensive." *(support / Plateau / meaning, incentives)*
59. Premise: A senior offers a lunch workshop, "Reading Code You Didn't Generate". It is oversubscribed within the hour. *(leadership / Plateau / decision, comprehension debt)*
60. "Found the old strategy deck. Changed the year on the cover. Still accurate." *(marketer / Plateau / Yak #random)*

## Influences

The themes are old industry tropes that plenty of people have mined, from office sitcoms to conference talks. Deadpan interview sketches about tech stereotypes (the "Programmers are also human" channel among them) helped set the delivery. No lines, characters or premises are taken from any of them.
