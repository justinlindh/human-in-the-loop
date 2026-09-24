# Audio design: stack, cast and engine

The game's audio: where it comes from and how the engine plays it. Tooling and generation details live outside the repo.

## Stack

- **Music:** ACE-Step 1.5 (MIT code and weights), the XL-sft checkpoint with its planner, full-quality settings, curated by ear into loops. One shared instrument core across eras (warm electric piano, marimba, round bass) with a twist per era:
  - Classic: 96 bpm, F major
  - ChatGBT: 102 bpm, Bb major, synth bells
  - Agents: 108 bpm, D minor, analog arpeggios
  - Consolidation: 90 bpm, A minor, a cool lounge
  - Plateau: 84 bpm, Eb major, warm pads

  There are 2 to 3 beds per era, plus stingers (era arrival, launch, incident, Waffle Party, win, game over, title).
- **SFX:** curated CC0 packs (Kenney first), with freesound CC0 only for one-offs.
- **Voices:** Simlish-style barks in an original gibberish lexicon (meloo, yobi, nopu, wiyo, soomah, lolo...), 0.5 to 2 s each, from Apache-2.0 and MIT licensed TTS models with emotion control (Chatterbox-Turbo and Zonos). There are two voice sets (fem and masc) with many variants each, and every take passes a gender and length gate. No pitch processing.
- **Rule:** every generated asset is judged by ear before it ships.

## 6. Audio engine design (`src/audio`)

### Principles

- **Audio is a reader, like render and ui.** It consumes the same routed event stream (`route(events, state)` in `main.js`, after the pacer has released them) and reads state. It never mutates state and never dispatches.
- **No sounds in game code.** Sim events, UI actions and state conditions map to **cue ids** in a data manifest. UI keeps raising cue ids through the existing `hitl:sfx` window event, so ui needs no reference to audio.
- **Pure core, thin backend.** A deterministic `director` turns (events, state, clock, settings) into a list of commands. A small WebAudio `backend` executes them. The director runs in Node with no DOM, so audio is testable headless the same way `pacing.js` is.
- **Small first.** One file per concern, and the manifest carries everything tunable. New sounds are data edits.

### Layout

```
src/audio/
  audio.js       entry: createAudio({ quality, renderer }) -> { unlock, onEvents, update, cue, setBus, setMuted, setQuality }
  manifest.js    data: buses, cues, event and state rules, music per era, voice types
  director.js    pure: rules -> commands; voice limits, priorities, cooldowns, music state machine
  mixer.js       WebAudio graph: buses, ducking, master limiter
  music.js       stem player: loop points, bar-quantized crossfades, intensity layers
  voice.js       barks: voice from staff.voice, emotion pick, sync to say events
  loader.js      format choice, fetch and decode, lazy loading per era, streaming for Low
  spatial.js     screen-space pan and distance from the renderer's camera
  director.test.js
```

`audio.js` stays the entry because `main.js` globs `./audio/audio.js`.

### Wiring (integrator, in `main.js`)

```js
const audio = audioMod?.createAudio({ quality, renderer }) ?? null;
// route(): audio?.onEvents(events, state)           (state added)
// frame(): audio?.update(sim.state, dt, { speed, running, menuPause, decision: !!sim.state.pendingDecision, title: !playing })
// controls: setBus(bus, v), setMuted(m), setQuality(q) also forwards to audio
```

That is the whole footprint in the host: three calls. `update` is where state-driven music and ambience live.

### Manifest (data-driven cues)

```js
export const BUSES = {
  music:    { gain: 0.55, limit: 1 },
  ambience: { gain: 0.35, limit: 3 },
  sfx:      { gain: 0.8,  limit: 6 },
  ui:       { gain: 0.6,  limit: 4 },
  voice:    { gain: 0.85, limit: 6 },   // 6 only for a group cheer; single barks are budgeted in VOICE_RULES
};
export const DUCK = {               // target gain multiplier on the music bus, attack/release in s
  voice:    { music: 0.7,  attack: 0.08, release: 0.6 },
  cheer:    { music: 0.35, attack: 0.05, release: 1.5 },
  decision: { music: 0.45, attack: 0.3,  release: 1.2 },
  stinger:  { music: 0.3,  attack: 0.05, release: 1.5 },
};
export const CUES = {
  'ui.click':      { bus: 'ui',  files: ['ui/click'],                 cooldown: 0.03 },
  'sfx.launch':    { bus: 'sfx', files: ['stingers/launch'],         priority: 9, duck: 'stinger' },
  'sfx.hire':      { bus: 'sfx', files: ['sfx/hire_a', 'sfx/hire_b'], priority: 5, cooldown: 1.5 },
  'sfx.incident':  { bus: 'sfx', files: ['sfx/alarm'],               priority: 8, cooldown: 4 },
  'sfx.caught':    { bus: 'sfx', files: ['sfx/save'],                priority: 6 },
  'sfx.bubble':    { bus: 'sfx', files: ['sfx/pop_1', 'sfx/pop_2'],  priority: 1, cooldown: 0.25, spatial: true, jitter: { pitch: 0.06, gain: 0.1 } },
  // ...
};
// Sim events -> cues. Every event type in the contract is listed; null means deliberately silent.
export const ON_EVENT = {
  launch: 'sfx.launch',
  hire: 'sfx.hire',
  incident: (e) => (e.caught ? 'sfx.caught' : 'sfx.incident'),
  resign: (e) => (e.fired ? 'sfx.fired' : 'sfx.resign'),
  bubble: 'sfx.bubble',
  say: null,                         // speech bubbles never bark; see VOICE_RULES
  incentive: (e) => (e.reward === 'waffle_party' ? 'stinger.waffle' : 'sfx.reward'),
  chat: null,
  toast: (e) => ({ bad: 'sfx.bad', warn: 'sfx.warn' })[e.tone] ?? null,
  era: 'stinger.era',
  unlock: 'ui.unlock',
  goal: 'ui.goal',
  // ...
};
export const MUSIC = {
  title: { stems: ['title/full'], bpm: 90 },
  classic: { bpm: 96, beds: [{ stems: { bed: 'classic/a_bed', rhythm: 'classic/a_rhythm', top: 'classic/a_top' }, bars: 10 }] },
  // chatgbt, agents, consolidation, plateau
};
// State -> music intensity and ambience: pure functions of state, evaluated in update().
export const MOOD = [
  { when: (s) => s.lockdown,               music: { layers: ['bed'], lowpass: 1800 }, ambience: 'empty_office' },
  { when: (s) => s.outage,                 music: { layers: ['bed', 'rhythm'], stinger: 'tension' }, ambience: 'server_alarm' },
  { when: (s) => crunch(s) > 0.6,          music: { layers: ['bed', 'rhythm', 'top'] } },
  { when: () => true,                      music: { layers: ['bed', 'rhythm'] }, ambience: officeAmbience },
];
```

Rules are ordered; the first match wins. `crunch(s)` is a small pure helper (for example the share of staff at low stamina with active projects) kept in the manifest, next to the rule that uses it.

### Director (pure)

```js
createDirector(manifest, { rng }) -> {
  events(events, state, t) -> Command[]     // sim events at real time t
  cue(id, opts, t) -> Command[]             // ui cues
  update(state, t, ctx) -> Command[]        // music state machine, ambience, ducking
}
Command = { op: 'play', cue, file, bus, gain, rate, pan, at }
        | { op: 'music', era, bed, layers, at /* bar boundary */, fade }
        | { op: 'duck', key, on } | { op: 'filter', bus, lowpass } | { op: 'stop', bus }
```

- **Voice allocation.** Each bus has `limit` simultaneous voices. A new cue steals the lowest-priority, oldest voice only if its own priority is higher; otherwise it is dropped. Every cue has a `cooldown` (per cue, plus per staff for voice) so a burst of the same event plays once.
- **Batch collapse.** Within one `route` batch, same-cue events merge into one play (the existing "one sound per batch" rule, generalized).
- **Speed.** The pacer already spreads events over real time, so at 4x there are about 4x as many per real second. Cooldowns scale with `speed` for cues marked `scaleWithSpeed` (bubbles, pops, barks), and priority-1 cues are skipped entirely at 4x. Music is real time and never speeds up.
- **Determinism.** Variation (file choice, pitch jitter) uses the director's own seeded rng, never the sim's rng (audio must not perturb game state), and never `Math.random`. That makes the trace harness reproducible.

### Mixer

```
sources -> [spatial pan] -> bus gain (music | ambience | sfx | ui | voice)
        -> master gain -> DynamicsCompressor (gentle glue, -1 dBFS ceiling) -> destination
music bus -> lowpass BiquadFilter (pause and lockdown) -> duck gain -> bus gain
```

- **Ducking** is gain automation (`setTargetAtTime`) on a dedicated duck node. The voice bus ducks music only while a bark plays; decisions, era cards and stingers use deeper ducks.
- **Pause and menus** (`menuPause` or `decision`): the music lowpass drops to about 900 Hz and the level to -6 dB over 0.4 s. The sim-driven SFX stop because the pacer stops releasing them. UI cues still play.
- **Hidden tab**: suspend the AudioContext on `visibilitychange`, resume on return.

### Music engine

- **Beds of stems.** Each bed is 2 to 3 stems with identical length and loop points, started on the same `AudioContext` time with `AudioBufferSourceNode.loop = true` plus `loopStart`/`loopEnd`. That gives sample-accurate stem sync. Separate `<audio>` elements drift, so they can't be used for layers.
- **Intensity.** Layers fade in and out over 1 to 2 bars, quantized to the next bar boundary from the bed's BPM.
- **Era change.** On the `era` event: play the era stinger (music ducked), wait for the era card to close (`menuPause` false), then crossfade to the new era's bed over 2 bars. Beds rotate within an era every N loops (for example every 4 to 6 minutes) to fight fatigue.
- **Title and game over** have their own cues. Title music starts on the first unlock gesture.
- **Memory.** A decoded 25 s stereo 48 kHz stem is about 9.6 MB of float PCM. Keep only the current bed's stems decoded (about 29 MB at High), prefetch the next era's bed when `state.eraSchedule` says it is less than about 8 weeks away, and release the previous era after the crossfade.

### Spatial (optional, cheap)

- The renderer exposes one read-only query, for example `renderer.screenOf(kind, id) -> { x /* -1..1 */, depth /* 0..1 */, visible }` (a request for the art lane).
- Spatial cues (`spatial: true`: bubbles, desk sounds, pets, props) get a `StereoPannerNode` pan from `x`, and gain from zoom and depth (quieter off-screen or far). No `PannerNode` or HRTF: that costs too much for too little in an isometric diorama.
- At Low quality, spatial is off: everything plays centered, and no renderer queries are made.

### Voice barks

Barks are rare, and less is more. They are never tied to speech bubbles or Slackk lines (`say` and `chat` map to no voice).

- **Bank.** `Staff.voice = { set: 'fem'|'masc', variant, pitch: -1..1 }` picks the bank: `${set}_${VOICE_VARIANTS[set][variant % n]}`, for example `fem_alto40`.
  - `VOICE_VARIANTS` in the manifest lists the recorded variants per set (8 each), so adding one is a data edit.
  - Each bank is one sprite holding 7 emotions × 2 takes. The manifest maps `{ bank: { emotion: [[offset, duration], ...] } }`.
- **No pitch processing on voices.** `Staff.voice.pitch` is not applied: voices are never pitch-shifted. Variety comes from the size of the cast and from rotating takes.
- **Triggers** (`VOICE_RULES` in the manifest). Each rule gives who speaks and the emotion:

| Trigger | Source | Who | Emotion | Plays |
|---|---|---|---|---|
| Player clicks a character | UI cue `voice.poke` with `staffId` (raised when the renderer's pick returns a person) | that person | from their state: burnout or strain gives tired or sighing; low meaning gives annoyed; otherwise happy or questioning | always; per-person cooldown of 1.5 s so a click spree doesn't stack |
| Launch | `launch` | group cheer of those present | excited or laughing | always |
| Incident not caught | `incident` with `caught: false` | 1 to 2 people nearest the product owner | annoyed or sighing | always; a caught incident gets one happy bark from the catcher |
| Era arrival | `era` | group, 2 to 3 people | questioning, then excited | after the era card closes |
| Waffle Party | `incentive` with `reward: 'waffle_party'` | group cheer, led by the rewarded person | laughing or happy | always |
| Burnout | a staff `mood` change to `burnout` (the director keeps last week's moods) | that person | tired, then sighing | once per episode |
| Quitting | `resign` with `fired: false` | the leaver | sighing | always |
| Hire's first day | `hire` | the new person | happy | once |
| Ambient | none (a timer in `update`) | a random present person on screen | from their state | only if the global voice budget allows |

- **Global budget.** The director tracks the last voice time.
  - An ambient bark needs at least 30 s since the last bark of any kind, and a random draw spread over 30 to 60 s. It skips while a decision, menu or card is open (`menuPause` or `decision`), while speed is 0, and during lockdown when the office is empty.
  - Trigger barks ignore the ambient timer but still respect a 2 s global gap between separate moments.
  - A tone on `say` (in the contract) is available if a future rule wants it.
- **Group cheer** (launch, Waffle Party, era arrival):
  - Up to 6 people present in the office, chosen by closeness to the camera focus and then at random. Each uses their own voice bank.
  - Onsets are staggered 50 to 250 ms apart, with 0 to -4 dB gain spread per voice and no pitch processing.
  - Under them, a light crowd bed: a small prerendered murmur and cheer loop from the cast, low-passed, playing on the ambience bus and fading around the cheer.
  - The music bus uses the `cheer` duck (about -4 to -5 dB, tunable per cue, 50 ms attack, 1.5 s release after the last voice), so the music still reads underneath.
  - At Low quality the cheer drops to 2 voices plus the crowd bed.
- **Settings**: voices on or off (a slider on the voice bus).

### Assets and loading

```
public/audio/
  music/<era>/<bed>_<stem>.ogg|.m4a
  stingers/*.ogg|.m4a
  sfx/*.ogg|.m4a, ui/*.ogg|.m4a      (or two sprites with an offsets map)
  voice/<type>.ogg|.m4a              (one sprite per voice type; offsets in the manifest)
  LICENSES.md
```

A build step (`npm run audio`, with the script in `scripts/` owned by integrator) reads the masters from outside the repo, then:
- normalizes (music -18 LUFS, voice -20 LUFS, SFX peak -3 dBFS),
- encodes Opus plus m4a,
- writes `src/audio/assets.json` with the durations, loop points (in samples), and sprite offsets.

The manifest references the ids in that file, and a test fails on any missing file.

| Group | Load | Size budget (compressed) |
|---|---|---|
| UI and SFX | fetch and decode on the first unlock | under 400 KB |
| Title music | stream on unlock | under 1 MB |
| Current era bed (3 stems) | decode, lazily | about 0.8 MB per stem, 2.5 MB per bed |
| Next era | prefetch when close | the same |
| Voice sprites | decode the banks of present staff at load; others on first use | about 80 KB per bank at 32 kbps mono Opus (7 emotions × 2 takes); 16 banks about 1.3 MB; crowd bed about 60 KB |
| **Total shipped** | | **under 20 MB; first play under 4 MB** |

### Quality levels

| | High | Low (touch, low-end) |
|---|---|---|
| Music | stems with layers, decoded | one pre-mixed track per era, streamed through a `MediaElementAudioSourceNode` (no decode memory); intensity by filter only |
| Voice | cheer up to 6 voices | cheer 2 voices plus the crowd bed |
| SFX limit | 6 | 3; priority-1 cues off |
| Spatial | on | off |
| Ambience | on | off |

### Settings, unlock, persistence

- **Sliders**: master, music, effects (SFX plus UI), voices, and ambience; plus mute and the voice style. They live in the ui lane's `settings.js` (same localStorage record) and reach audio through `controls.setBus` and `controls.setMuted`.
- **Autoplay**: keep the current approach. Create or resume the AudioContext on the first `pointerdown` or `keydown` (the capture listener), and start title music then.
- **iOS** needs the context resumed inside the gesture handler, and a silent buffer played once.

### Headless test harness

- `director.test.js` (Vitest, Node):
  - every event type in the contract is present in `ON_EVENT`, even as `null`
  - every cue references an existing bus and asset id
  - per-bus limits and cooldowns hold for a synthetic burst
  - a fixed input gives the same commands
- `scripts/audio-trace.js`, like `scripts/pace.js`: plays the real sim through `createPacer` with the director and a fake clock at a chosen speed. It prints a cue timeline and the stats a human cares about:
  - cues per real minute per bus
  - peak concurrent voices
  - how many cues were dropped by limits or cooldowns
  - the longest stretch of silence with no SFX
  - music transitions: era, layers, ducks
  - checks against targets, for example voice-bus cues per minute under X at 4x, and the gap between an era change and the music crossfade

  It exits non-zero on a miss, like `pace.js --check`. The same trace can run on mock scenarios (`?mock=incident|hq`).
- **In the browser**: `window.__HITL.audio` exposes the last N commands for snapshot and playtest scripts.

### Lanes and contract asks

- **ui lane**: owns `src/audio`, so it builds all of the above.
- **integrator**: the three `main.js` calls, `controls.setBus` and `setMuted`, and `npm run audio`.
- **art**: `renderer.screenOf` (read-only).
- **Contract (lead)**, optional: a `tone` field on `say` events for bark emotion. Without it, the director infers emotion as described above.

Build order, each step shippable:
1. director plus mixer plus UI and SFX cues (replaces the placeholder beeps)
2. single-track music per era with crossfades and pause and decision ducking
3. voice barks
4. stems and intensity
5. spatial
6. the trace harness, which lands with step 1 and grows with each step

