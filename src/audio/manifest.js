// Audio data: buses, ducks, cues, which sim events and UI actions make which cues, music per era,
// voice banks, and the voice rules. Everything tunable lives here; the director reads it and never
// hardcodes a sound. File ids are asset ids (see assets.js); a missing asset falls back to a
// synthesized placeholder with the same id.

export const BUSES = {
  music: { gain: 0.55, limit: 1 },
  ambience: { gain: 0.35, limit: 3 },
  sfx: { gain: 0.8, limit: 6 },
  ui: { gain: 0.6, limit: 4 },
  voice: { gain: 0.85, limit: 6 },
};
export const BUS_IDS = Object.keys(BUSES);

// Target multiplier on the music bus while a duck is held; attack and release in seconds.
export const DUCK = {
  dance: { music: 0.12, attack: 0.6, release: 2 },
  voice: { music: 0.7, attack: 0.08, release: 0.6 },
  cheer: { music: 0.6, attack: 0.05, release: 1.5 },
  decision: { music: 0.45, attack: 0.3, release: 1.2 },
  stinger: { music: 0.25, attack: 0.3, release: 1 },
};

// priority 1..10 (higher steals lower on a full bus); cooldown in s per cue; files: variants picked by rng.
export const CUES = {
  'ui.click': { bus: 'ui', files: ['ui/click'], cooldown: 0.03, priority: 2 },
  'ui.open': { bus: 'ui', files: ['ui/open'], cooldown: 0.05, priority: 2 },
  'ui.close': { bus: 'ui', files: ['ui/close'], cooldown: 0.05, priority: 2 },
  'ui.confirm': { bus: 'ui', files: ['ui/confirm'], cooldown: 0.05, priority: 3 },
  'ui.error': { bus: 'ui', files: ['ui/error'], cooldown: 0.2, priority: 3 },
  'ui.coin': { bus: 'ui', files: ['ui/coin'], cooldown: 0.08, priority: 3 },
  'ui.blip': { bus: 'ui', files: ['ui/blip'], cooldown: 0.25, priority: 1 },
  // A Yak reply prompt opened: a soft ping, spaced out so it never nags.
  'ui.prompt': { bus: 'ui', files: ['ui/blip'], cooldown: 4, priority: 3, gain: 0.7 },
  'ui.decision': { bus: 'ui', files: ['ui/decision'], cooldown: 1, priority: 6, duck: 'decision' },
  'ui.unlock': { bus: 'ui', files: ['ui/unlock'], cooldown: 1, priority: 5 },
  'ui.goal': { bus: 'ui', files: ['ui/goal'], cooldown: 1, priority: 5 },
  'sfx.hire': { bus: 'sfx', files: ['sfx/hire'], cooldown: 1.5, priority: 5 },
  'sfx.resign': { bus: 'sfx', files: ['sfx/resign'], cooldown: 2, priority: 5 },
  'sfx.farewell': { bus: 'sfx', files: ['sfx/farewell'], cooldown: 2, priority: 5 },
  'sfx.incident': { bus: 'sfx', files: ['sfx/alarm'], cooldown: 4, priority: 8 },
  'sfx.caught': { bus: 'sfx', files: ['sfx/save'], cooldown: 2, priority: 6 },
  'sfx.award': { bus: 'sfx', files: ['sfx/award'], cooldown: 0.6, priority: 6, duck: 'stinger' },
  'sfx.reward': { bus: 'sfx', files: ['sfx/reward'], cooldown: 1, priority: 5 },
  'sfx.bad': { bus: 'sfx', files: ['sfx/bad'], cooldown: 0.8, priority: 4 },
  'sfx.warn': { bus: 'sfx', files: ['ui/blip'], cooldown: 0.8, priority: 2 },
  'sfx.outage': { bus: 'sfx', files: ['sfx/outage'], cooldown: 10, priority: 8 },
  'sfx.fixed': { bus: 'sfx', files: ['sfx/fixed'], cooldown: 5, priority: 6 },
  'sfx.door': { bus: 'sfx', files: ['sfx/door'], cooldown: 3, priority: 3, gain: 0.7 },
  'sfx.move': { bus: 'sfx', files: ['sfx/move'], cooldown: 0.2, priority: 3 },
  // The Office Space nods (#468). `delivered` cues play only once their file ships; until then
  // they stay silent rather than use a synthesized stand-in.
  'sfx.printerSmash': { bus: 'sfx', files: ['sfx/printer_smash'], cooldown: 0.3, priority: 8, delivered: true },
  'sfx.stapler': { bus: 'sfx', files: ['sfx/stapler'], cooldown: 0.5, priority: 3, gain: 0.8, delivered: true },
  'sfx.memo': { bus: 'ui', files: ['sfx/memo'], cooldown: 1, priority: 3, gain: 0.8, delivered: true },
  'sfx.banner': { bus: 'sfx', files: ['sfx/banner'], cooldown: 2, priority: 3, gain: 0.8, delivered: true },
  // Growth (#549). A level-up is common, so it is soft and spaced out (more so at speed, and not at
  // all on Low or at top speed, where priority 1 drops); a promotion is rarer and brighter.
  'sfx.levelUp': { bus: 'sfx', files: ['sfx/level_up'], cooldown: 2.5, scaleWithSpeed: true, priority: 1, gain: 0.5, delivered: true },
  'sfx.promotion': { bus: 'sfx', files: ['sfx/promotion'], cooldown: 3, priority: 6, delivered: true },
  'sfx.trait': { bus: 'sfx', files: ['sfx/trait'], cooldown: 1.5, priority: 3, gain: 0.7, delivered: true },
  'sfx.foosball': { bus: 'sfx', files: ['sfx/foosball'], cooldown: 25, priority: 2, gain: 0.6 },
  'sfx.arcade': { bus: 'sfx', files: ['sfx/arcade'], cooldown: 25, priority: 2, gain: 0.6 },
  'sfx.pingpong': { bus: 'sfx', files: ['sfx/pingpong'], cooldown: 25, priority: 2, gain: 0.6 },
  'sfx.coffee': { bus: 'sfx', files: ['sfx/coffee'], cooldown: 60, priority: 2, gain: 0.6 },
  'sfx.dog': { bus: 'sfx', files: ['sfx/dog'], cooldown: 60, priority: 2, gain: 0.6 },
  'sfx.cat': { bus: 'sfx', files: ['sfx/cat'], cooldown: 60, priority: 2, gain: 0.6 },
  'sfx.bubble': { bus: 'sfx', files: ['sfx/pop'], cooldown: 0.25, priority: 1, scaleWithSpeed: true, jitter: { gain: 0.1 } },
  'stinger.launch': { bus: 'sfx', files: ['stingers/launch'], cooldown: 2, priority: 9, duck: 'stinger' },
  'stinger.era': { bus: 'sfx', files: ['stingers/era'], cooldown: 5, priority: 10, duck: 'stinger' },
  'stinger.waffle': { bus: 'sfx', files: ['stingers/waffle'], cooldown: 5, priority: 9, duck: 'stinger' },
  'stinger.office': { bus: 'sfx', files: ['stingers/office'], cooldown: 5, priority: 9, duck: 'stinger' },
  'stinger.win': { bus: 'sfx', files: ['stingers/win'], cooldown: 5, priority: 10, duck: 'stinger' },
  'stinger.gameover': { bus: 'sfx', files: ['stingers/gameover'], cooldown: 5, priority: 10, duck: 'stinger' },
};

// Sim events -> cue ids. Every event type in the contract is listed; null means deliberately silent.
export const ON_EVENT = {
  toast: (e) => ({ bad: 'sfx.bad', warn: 'sfx.warn' })[e.tone] ?? null,
  chat: null,
  say: null,
  bubble: 'sfx.bubble',
  standup: null,
  celebrate: null,
  // A new product gets the full launch stinger; a version update gets a small chime.
  launch: (e, s) => (isFirstLaunch(e, s) ? 'stinger.launch' : 'ui.goal'),
  incident: (e) => (e.caught ? 'sfx.caught' : 'sfx.incident'),
  hire: 'sfx.hire',
  resign: (e) => (e.fired ? null : isWarmExit(e) ? 'sfx.farewell' : 'sfx.resign'),
  decision: 'ui.decision',
  // The player's pick already clicked in the UI; the resolution itself makes no sound.
  decisionResolved: null,
  // A Yak reply prompt opened; answering it already clicked in the UI, and an expiry is silent.
  chatPrompt: 'ui.prompt',
  chatPromptResolved: null,
  // The founder's quick post: a small cheer when it lands, a wince when it backfires, nothing when flat.
  posted: (e) => ({ landed: 'sfx.reward', backfired: 'sfx.bad' })[e.outcome] ?? null,
  // Growth (#549). A promotion's level-up in the same batch plays only the promotion (see director).
  levelUp: 'sfx.levelUp',
  promoted: 'sfx.promotion',
  traitEarned: 'sfx.trait',
  skillTrained: 'sfx.trait',
  award: 'sfx.award',
  officeUpgrade: 'stinger.office',
  gameOver: (e, s) => (s?.gameOver?.won ? 'stinger.win' : 'stinger.gameover'),
  era: 'stinger.era',
  unlock: 'ui.unlock',
  goal: 'ui.goal',
  // A music night plays its genre's track (in the director); the other rewards get their sting.
  incentive: (e) => (e.reward === 'waffle_party' ? 'stinger.waffle' : e.reward === 'music_night' ? null : 'sfx.reward'),
};

// UI 'hitl:sfx' names -> cue ids.
export const UI_CUES = {
  move: 'sfx.move', click: 'ui.click', open: 'ui.open', close: 'ui.close', confirm: 'ui.confirm', error: 'ui.error', coin: 'ui.coin',
  blip: 'ui.blip', decision: 'ui.decision', fanfare: 'stinger.win', gameover: 'stinger.gameover', award: 'sfx.award',
};

// One bed per era. bpm sets the bar length for quantized crossfades; the key picks the placeholder chords.
export const MUSIC = {
  title: { bpm: 104, key: 'F', mode: 'major', beds: ['title/a'] },
  classic: { bpm: 96, key: 'F', mode: 'major', beds: ['classic/a'] },
  chatgbt: { bpm: 102, key: 'Bb', mode: 'major', beds: ['chatgbt/a'] },
  agents: { bpm: 108, key: 'D', mode: 'minor', beds: ['agents/a'] },
  consolidation: { bpm: 90, key: 'A', mode: 'minor', beds: ['consolidation/a'] },
  plateau: { bpm: 84, key: 'Eb', mode: 'major', beds: ['plateau/a'] },
};
// Music night: each genre's dance track (assets.json musicNight.<genre>); the placeholder is a
// short piece in the genre's tempo and key. The era bed ducks under it; a small cheer ends it.
export const MUSIC_NIGHT = {
  corporate_synthwave: { bpm: 110, key: 'E', mode: 'minor' },
  motivational_polka: { bpm: 126, key: 'Bb', mode: 'major' },
  aggressive_bossa_nova: { bpm: 142, key: 'D', mode: 'minor' },
  sad_lofi: { bpm: 72, key: 'Eb', mode: 'major' },
};
export const MUSIC_NIGHT_SECONDS = 16;
// A pending decision that picks a music night genre: it names the reward or offers the genres.
export function isMusicNightDecision(d) {
  if (!d) return false;
  const text = JSON.stringify(d);
  return text.includes('music_night') || Object.keys(MUSIC_NIGHT).some((g) => text.includes(g));
}   // placeholder length, and the fallback when assets.json gives none
export const MUSIC_BARS = 8;          // placeholder bed length in bars
export const PLAYLIST_MIN_S = 120;    // an era with several beds switches after this much unpaused listening
export const PLAYLIST_LOOKAHEAD_S = 0.5; // how early the switch is scheduled before its bar line
// Staged moments (hitl:moment from the renderer) with a music cue timed to the staging: the
// decision that can lead to one, and the file that plays from its start event.
// Impacts on a staged moment's hits (hitl:moment phase 'hit', fired on the frame each lands).
export const MOMENT_HITS = { printer_jam: 'sfx.printerSmash' };
// While a moment or spotlight plays, unrelated one-shot sounds hold off; the player's own clicks stay.
export const FOCUS_KEEP = new Set(['ui.click', 'ui.open', 'ui.close', 'ui.confirm', 'ui.error', 'ui.coin']);
// A spotlight keeps its own sounds: per kind (the same string as its hitl:moment key), the cues it
// plays and whether its crowd may cheer. Staged moments (the printer and the rest) keep only their hits.
// A kind not listed keeps cheers and stingers, so a new celebration is never silenced by default.
export const SPOTLIGHT_KEEP = {
  waffle_party: { cues: ['stinger.waffle', 'sfx.reward'], cheers: true },
  music_night: { cues: ['music.night', 'sfx.reward'], cheers: true },
  balloons: { cues: ['sfx.reward'], cheers: true },
  caricature: { cues: ['sfx.reward'], cheers: true },
  company_party: { cues: ['sfx.reward'], cheers: true },
  promotion: { cues: ['sfx.promotion', 'sfx.levelUp', 'sfx.trait'], cheers: true },
  legend: { cues: ['sfx.promotion', 'stinger.win'], cheers: true },
};
export const SPOTLIGHT_DEFAULT = { cues: [], cheers: true, stingers: true };
export const MOMENT_CUES = {
  printer_jam: { eventId: 'printer_jam', file: 'moments/printer_smash', gain: 0.9 },
};
// Office Space nods, from the props the sim stages (state.office.props): a prop arriving or leaving
// plays its cue. The jammed printer also beeps on a loop while it sits in the kitchen (it leaves props
// when its decision closes), quiet while paused or while any moment plays.
export const OFFICE_PROP_CUES = {
  stapler: { on: 'sfx.stapler', off: 'sfx.stapler' },
  cover_sheets: { on: 'sfx.memo' },
  banner_company: { on: 'sfx.banner' },
  // The wreck is staged at the choice; on Medium and High the smash moment's cue carries the hits,
  // so the crash is for Low, where there is no moment and the wreck just appears.
  printer_wrecked: { on: 'sfx.printerSmash', lowOnly: true },
};
export const OFFICE_PROP_LOOPS = { printer_jammed: { id: 'sfx/printer_beep', bus: 'sfx', gain: 0.5 } };
export const PLAYLIST_PRELOAD_S = 30;   // how long before a projected switch the next bed starts decoding
export const CROSSFADE_BARS = 2;
export const PAUSE_LOWPASS = 900;     // Hz while a menu, card or decision holds time
export const LOCKDOWN_LOWPASS = 1800;
export const PAUSE_GAIN = 0.5;        // about -6 dB

// Voice banks: `${set}_${VOICE_VARIANTS[set][variant % n]}`.
export const VOICE_VARIANTS = {
  fem: ['alto40', 'mezzo30', 'bright25', 'warm35', 'soft30', 'crisp25', 'husky40', 'light20'],
  masc: ['bari45', 'tenor35', 'warm40', 'gruff50', 'soft35', 'bright30', 'deep55', 'easy40'],
};
export const EMOTIONS = ['happy', 'excited', 'laughing', 'questioning', 'annoyed', 'tired', 'sighing'];

// Why someone left: 'fired'|'burnout'|'moved_on'|'poached'|'retired'. A missing reason with fired
// false is a burnout (older saves). Moving on, retiring and being poached get a warm send-off.
export const resignReason = (e) => e.reason ?? (e.fired ? 'fired' : 'burnout');
export const isWarmExit = (e) => ['moved_on', 'retired', 'poached'].includes(resignReason(e));

// A launch event is a new product's first launch when that product is at version 1.
export function isFirstLaunch(e, s) {
  const p = s?.products?.find((x) => x.id === e.productId);
  return !p || (p.version ?? 1) <= 1;
}

// Rare world sounds: a pet or the coffee machine now and then, and the typing bed while people work.
export const WORLD = {
  petMinGap: 90, petSpread: 90,         // s between pet sounds
  coffeeMinGap: 120, coffeeSpread: 120, // s between coffee sounds
  typingMax: 0.5,                       // typing loop gain with everyone at their desk
};
// A placed perk item -> its in-use sound.
export const PROP_CUES = { foosball: 'sfx.foosball', arcade: 'sfx.arcade', ping_pong_table: 'sfx.pingpong' };

export const VOICE = {
  cheerCooldown: 180,   // real s between group cheers (multiplied by game speed)
  pokeCooldown: 1.5,    // s per person for clicks
  globalGap: 2,         // s between separate voice moments
  ambientMinGap: 30,    // s since the last bark of any kind
  ambientSpread: 30,    // extra random wait, s
  maxSingle: 2,         // single barks sounding at once
};

// Group cheers: up to `voices` people present, staggered far enough apart to land as separate
// people, emotions dealt without repeats until the list runs out, alternating takes, staggered onsets, per-voice gain spread, a crowd bed,
// and the cheer duck. gainDb is the group level relative to a single bark.
// groupGain 0.7 is about 3 dB under a single bark; crowdBed is the crowd loop's gain (0 = none).
export const GROUP_CUES = {
  launch: { duck: 'cheer', groupGain: 0.7, maxVoices: 4, lowMaxVoices: 2, stagger: [0.15, 0.45], gainSpreadDb: [-4, 0], crowdBed: 0.25, emotions: ['excited', 'laughing', 'happy'] },
  waffleParty: { duck: 'cheer', groupGain: 0.7, maxVoices: 4, lowMaxVoices: 2, stagger: [0.15, 0.45], gainSpreadDb: [-4, 0], crowdBed: 0.3, emotions: ['laughing', 'happy', 'excited'] },
  musicNight: { duck: 'cheer', groupGain: 0.6, maxVoices: 3, lowMaxVoices: 1, stagger: [0.2, 0.5], gainSpreadDb: [-4, 0], crowdBed: 0.2, emotions: ['laughing', 'excited', 'happy'] },
  era: { duck: 'cheer', groupGain: 0.6, maxVoices: 3, lowMaxVoices: 1, stagger: [0.2, 0.5], gainSpreadDb: [-3, 0], crowdBed: 0, emotions: ['questioning', 'excited'] },
};

// Crunch: the share of present staff running low on stamina while on a project.
export function crunch(s) {
  const here = (s?.staff ?? []).filter((p) => p.mood !== 'away' && !p.remote);
  if (!here.length) return 0;
  return here.filter((p) => (p.stamina ?? 100) < 30 && p.assignment?.type === 'project').length / here.length;
}

// State -> music layers and filter; the first match wins.
export const MOOD = [
  { when: (s) => !!s.lockdown, music: { level: 0.8, lowpass: LOCKDOWN_LOWPASS } },
  { when: (s) => !!s.outage, music: { level: 1, lowpass: null, tension: true } },
  { when: (s) => crunch(s) > 0.6, music: { level: 1.1, lowpass: null } },
  { when: () => true, music: { level: 1, lowpass: null } },
];
