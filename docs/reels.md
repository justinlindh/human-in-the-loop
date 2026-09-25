# Reels

How Human in the Loop's reels, shareable clips and landing loops are shot and cut. The kit is `scripts/reels/kit.sh`; camera moves are a capture item's `camera` keyframes. Agreed by video and art.

## The rule underneath

The game is the show. Every effect exists to make a beat easier to read, never to decorate it. If a viewer would notice the effect before the joke, cut the effect.

## Shooting

- **Through the real game loop, always.** Open a moment the week before it happens and let the game's own tick bring it live, card and freeze included.
- **UI, per shot:**
  - **clean:** no interface at all (`STAGE_ONLY`). Use it for scenery, timelapses, the office in motion, and any moment that needs no card. This is the default.
  - **card:** the decision card and the moment caption only (`BARE`). Use it when the card is the joke, as in PC LOAD LETTER, the consultants and the cloud bill.
  - **full:** the whole HUD. Only when the interface itself is the subject, such as a Yak thread or the build panel. Even then, keep only the panel that matters, and crop to it.
- **Speech bubbles and work labels** (`NO_SAY`) go whenever they talk about something other than the beat. People in a moment still chat about their week.
- **Hold a card about 6 s** so a viewer can read it, then answer it by key.
- **Camera:**
  - Move it in the render (the `camera` keyframes, or `FOLLOW` for a moving subject), not in post. A real dolly holds up on a 3D scene; a 2D zoom on flat frames looks cheap.
  - Glide, never snap. Measure every clip with `scripts/reels/camstats.mjs` and put the numbers next to it.
  - Frame the subject at native pixels: record at 3840x2160 and crop, instead of scaling a small crop up.
  - Push-ins end at zoom 3.5 or wider for 1080p output (the rig's own range stops at 3.2; a crop in post counts toward it). Closer, the faces go soft and the bevels alias.
  - Keep the camera's pitch. The fixed isometric angle is the style: no top-down, no low angles.
- **The diorama look:**
  - Never crop the office's outer walls or floor edge in a hero or establishing shot. The miniature reads from seeing the edges.
  - Keep the game's tilt-shift on and add no blur in post.
  - No colour grade: no LUTs, no contrast pushes. The lighting is authored, and a grade turns the cream walls yellow and crushes the soft shadows.
- **Sound** is the game's own. Say which sounds a clip should have, and check that each is audible and that nothing else chimes over a focus moment.

## Cutting

- **Establish first:** at least 1.5 s on the whole scene before the first push-in, so the viewer knows where they are.
- **Hold past the payoff:** every beat stays at least 1 s past its payoff (the wreck, the empty chairs) before the cut. A cut on the payoff frame kills the laugh.
- **Cutting mid-moment is fine** while a moment's Skip or spotlight is on screen; a short spotlight hold keeps it cheap.

| Preset | Use it for | Don't |
|---|---|---|
| Hard cut (`kit_cut`) | The default between beats. | |
| Crossfade (`kit_xfade`, 0.4 to 0.6 s) | Passing time: a timelapse stage, an era turning. | Between two jokes; it blurs both. |
| Push-in or pull-out (in-engine keyframes) | At most one per beat, to land on the payoff (the printer, the empty chairs). | On every shot. Never during a card someone is reading. |
| Pan (in-engine keyframes) | Showing an office that is the subject: a bold move that crosses most of the room in 5 to 6 s, eased in and out, after a hold of at least 1.5 s. A drift too small to notice is not a pan. | To reach a subject; cut to it instead. |
| Title card (`kit_title`, a small logo above the title) | Opening a reel, and naming a beat when its name is the joke. | Longer than 2.5 s. |
| Lower third (`kit_lower`) | Naming a beat or a stage over the picture, about 2.6 s. | Over a card, or over the subject. |
| Corner label (`kit_label`) | A running label for a whole clip, such as the era in the growth timelapse. | More than one at a time. |
| End card (`kit_end`) | Closing a reel or shareable clip: the game's logo and the site. | Mid-reel. |
| Speed ramp (`kit_ramp`, 0.5 to 1) | Once per reel at most, into a payoff that happens too fast to see. | Below 0.5x: the animation is authored at game speed and stutters when slowed. Not on speech or a card. |
| Vignette (`kit_vignette`) | A subtle focus on a busy frame. | As a look on everything. |
| 2D push-in (`kit_push_in_2d`) | A still with no way to re-shoot it. | Anything the capture can move in-engine. |

**Never:** spins, star or iris wipes, zoom blurs, blur or shake added in post (the game has its own), colour grades, speed ramps below 0.5x, stock sound effects over the game's sound, text in fonts other than Fredoka and JetBrains Mono, and colours off the game's palette.

## Type and colour

- **Fonts:** Fredoka Bold for titles, Fredoka SemiBold for lines under them, JetBrains Mono for numbers and code. The files and their OFL licences are in `scripts/reels/fonts/`.
- **Colours:** ink `#2a2630` on cream `#fbf5ea` for cards; cream on ink at 82% for captions over the picture.
- **Accents** come from `src/render/palette.js` only: `marker_orange` for a site URL or one highlighted word, and a role colour only when naming a person's role. Red means danger in the game, so it never decorates a title.

## Delivering

- **A download-ready MP4** (H.264 and AAC, under 15 MB for the review desk) and the full-quality file.
- **Only the latest version** goes to the user, never a work in progress.
- **Report the camera numbers**, and any game problem the clip shows, with frame numbers and a crop, to the owning lane.
