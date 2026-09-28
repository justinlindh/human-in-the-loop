# Feature inventory

This directory catalogues everything Human in the Loop does today, with the fun details (animations, staged moments, props, jokes, sounds) first, so the team remembers them and can plan highlight reels and trailers. Every PR that adds or changes a player-visible feature updates the entry in its area's file.

Conventions:
- A star at the start of a bullet marks a reel-worthy highlight.
- "How to see it" hints: `?mock=<scenario>` is a canned scene (`garage`, `floor`, `hq`, `incident`, `night`, `ending`); `find.js <event> --choice N` is `node scripts/events/find.js`, whose snapshot `scene.mjs --moment '<query>'` stages; `capture <id>` is `npm run capture -- --only <id>`.
- A bullet backed by data ends with its ids, one code span each: Spoken: "It has paper. I checked its demands." `id: printer_jam`.

Areas, one file each:
- [Company and progression](company.md)
- [The office (stages, items, perks)](office.md)
- [People (characters, poses, emotes, moods, traits)](people.md)
- [Staged moments](moments.md)
- [Decisions that show up in the office](decisions.md)
- [Yak](yak.md)
- [Nods and parodies](nods.md)
- [Eras and time of day](eras.md)
- [Sound and music](sound.md)
- [Interface](interface.md)
- [Touch and low-end support](touch.md)
- [Ids left out on purpose](left-out.md)
