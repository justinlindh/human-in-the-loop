// Everything the trailer is made of: which captured clips, where each cut starts and ends, the cards,
// the music and stingers, and when each voiceover line lands. Change the trailer here; build.js only
// executes this file.
//
// Beats run back to back in order. A clip beat names a capture item (`item`, an id from
// scripts/capture-manifest.js), overrides for it (`capture`), the second of the clip to cut from
// (`from`) and how long the cut lasts (`dur`). A card beat names a card from `cards`.
// `vx` places the square window the vertical cut shows (0 is the left edge, 1 the right).

export const OUTPUT = {
  width: 1920,
  height: 1080,
  fps: 30,
  vertical: { width: 1080, height: 1920 },
  // Delivered loudness for web video.
  lufs: -14,
  truePeak: -1.5,
};

export const PLAY_URL = 'https://justinlindh.github.io/human-in-the-loop/';

export const CARDS = {
  title: { logo: true, lines: [] },
  end: { logo: true, captions: false, lines: ['Play free in your browser', PLAY_URL.replace(/^https:\/\//, '').replace(/\/$/, '')] },
};

// Page JS for a beat's `actions`: closes a "new things to place" card the way a player would.
const LATER = (at) => ({ at, js: "[...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.textContent.trim() === 'Later')?.click()" });

// Page JS for a beat's `actions`: presses the visible button with this label.
const CLICK_AT = (label, at) => ({ at, js: `[...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.textContent.trim() === ${JSON.stringify(label)})?.click()` });

export const BEATS = [
  { id: 'title', card: 'title', dur: 2.5 },
  { id: 'garage', item: 'readme-garage', capture: { still: false, seconds: 6, screenshots: [] }, camera: [{ at: 0.2, zoom: 1.6 }], from: 1.5, dur: 3.0, vx: 0.45 },
  { id: 'office', item: '2-2-office-move', capture: { seconds: 9 }, actions: [LATER(0.1)], camera: [{ at: 2.6, zoom: 1.35 }], from: 2.8, dur: 3.0, vx: 0.5 },
  { id: 'launch', item: '5-1-first-launch', capture: { seconds: 14 }, from: 7.8, dur: 3.0, vx: 0.5 },
  { id: 'incident', item: 'real-incident', capture: { seconds: 12 }, actions: [CLICK_AT('Nice!', 8.05), CLICK_AT('Nice!', 8.4)], camera: [{ at: 6.5, zoom: 1.4 }], from: 8.2, dur: 2.2, vx: 0.5 },
  { id: 'era', item: 'real-era', capture: { seconds: 12 }, camera: [{ at: 6.5, zoom: 1.4 }], from: 7.8, dur: 2.5, vx: 0.7 },
  { id: 'waffle', item: '5-4-waffle-party-real', capture: { seconds: 22 }, from: 16.0, dur: 3.5, vx: 0.5 },
  { id: 'dance', item: '5-4b-music-night-real', capture: { seconds: 30 }, actions: [LATER(0.1), LATER(1.1)], from: 23.0, dur: 3.0, vx: 0.5 },
  { id: 'yak', item: '3-4-conversations-1x', capture: { seconds: 14 }, camera: [{ at: 8.6, zoom: 1.35 }], from: 10.5, dur: 2.5, vx: 0.3 },
  { id: 'end', card: 'end', dur: 3.5 },
];

// Paths are relative to the repo root. `at` is seconds from the start of the trailer, or
// { beat, offset } to follow a beat wherever it lands.
export const MUSIC = {
  bed: { file: 'public/audio/music/title/a_full.ogg', gain: -8, fadeIn: 0.3 },
  // Tracks that replace the bed for a stretch, crossfaded in and out.
  swaps: [
    { file: 'public/audio/music_night/corporate_synthwave.ogg', at: { beat: 'dance', offset: 0 }, until: { beat: 'yak', offset: 0 }, seek: 2.0, gain: -6, fade: 0.25 },
  ],
  stingers: [
    { file: 'public/audio/stingers/office.ogg', at: { beat: 'office', offset: 0.1 }, gain: -6 },
    { file: 'public/audio/stingers/launch.ogg', at: { beat: 'launch', offset: 0.0 }, gain: -6 },
    { file: 'public/audio/stingers/era.ogg', at: { beat: 'era', offset: 0.0 }, gain: -6 },
    { file: 'public/audio/stingers/waffle.ogg', at: { beat: 'waffle', offset: 0.0 }, gain: -8 },
    { file: 'public/audio/stingers/win.ogg', at: { beat: 'end', offset: 0.0 }, gain: -6 },
  ],
  // How far the music drops while the narrator speaks.
  duck: { threshold: 0.03, ratio: 8, attack: 20, release: 350 },
  fadeOut: 1.2,
};

// The narration. `file` is the rendered line in the VO directory (build.js --vo); `text` doubles as
// the burned-in caption and the TTS script (scripts/trailer/vo.py reads it through `npm run trailer -- --print-vo`).
export const VO = {
  gain: 0,
  captions: true,
  lines: [
    { id: 'l1', at: { beat: 'title', offset: 0.4 }, text: 'Every great company starts in a garage. This one is still paying rent on it.' },
    { id: 'l2', at: { beat: 'office', offset: 1.9 }, text: 'Hire humans. Ship products. Call the outage a stress test.' },
    { id: 'l3', at: { beat: 'incident', offset: 1.2 }, text: 'Survive the AI eras: chatbots, then agents, then whatever the agents hire.' },
    { id: 'l4', at: { beat: 'waffle', offset: 2.4 }, text: 'Reward your team with waffles. And a mandatory dance break.' },
    { id: 'l5', at: { beat: 'end', offset: 0.3 }, text: 'Human in the Loop. Someone has to be.' },
  ],
};
