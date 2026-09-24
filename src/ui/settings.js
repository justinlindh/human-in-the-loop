import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';

const KEY = 'hitl.settings';
// Audio buses the engine mixes; 'volume' is the master level.
export const BUSES = [
  { id: 'music', label: 'Music' }, { id: 'ambience', label: 'Ambience' }, { id: 'sfx', label: 'Sound effects' },
  { id: 'ui', label: 'Interface' }, { id: 'voice', label: 'Voices' },
];
const DEFAULTS = { volume: 0.7, bus: { music: 0.8, ambience: 0.8, sfx: 1, ui: 1, voice: 1 }, muted: false, quality: 'high', tiltShift: true, speed: 1, pauseMenus: true, autoPause: true };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw);
    const out = { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
    out.bus = { ...DEFAULTS.bus, ...(v?.bus && typeof v.bus === 'object' ? v.bus : {}) };
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or blocked storage */ }
}

// Pushes settings into the renderer and audio through the controls main.js provides.
export function applySettings(controls, s) {
  controls.setVolume?.(s.muted ? 0 : s.volume);
  controls.setBus?.('master', s.volume);
  for (const b of BUSES) controls.setBus?.(b.id, s.bus?.[b.id] ?? 1);
  (controls.setMuted ?? controls.setMute)?.(!!s.muted);
  // The audio engine also listens directly, so the mix follows Settings however main.js is wired.
  window.dispatchEvent(new CustomEvent('hitl:audioSettings', { detail: { master: s.volume, muted: !!s.muted, bus: { ...s.bus } } }));
  controls.setQuality?.(s.quality);
  controls.setTiltShift?.(s.tiltShift);
  (controls.setAutoPause ?? controls.setPauseOnBlur)?.(s.autoPause !== false);
}

export function createSettings({ layer, controls, sfx }) {
  const settings = loadSettings();
  applySettings(controls, settings);

  const back = h('div.modal-back.settings-back');
  back.style.display = 'none';
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  layer.append(back);

  function set(k, v) {
    settings[k] = v;
    saveSettings(settings);
    applySettings(controls, settings);
  }

  function seg(options, cur, onPick) {
    const btns = options.map((o) => h('button.segb', { onclick: () => { onPick(o.v); btns.forEach((b, i) => toggleClass(b, 'on', options[i].v === o.v)); sfx('click'); } }, o.label));
    btns.forEach((b, i) => toggleClass(b, 'on', options[i].v === cur));
    return h('div.seg', null, ...btns);
  }

  // A labelled 0..100 slider; setValue receives 0..1.
  function level(value, setValue) {
    const val = h('b.num', { text: `${Math.round(value * 100)}%` });
    const input = h('input.range', {
      type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)),
      oninput: (e) => { setValue(Number(e.target.value) / 100); setText(val, `${e.target.value}%`); },
      onchange: () => sfx('click'),
    });
    return h('div.row.levelrow', null, input, val);
  }

  function render() {
    const setBus = (id, v) => { settings.bus = { ...settings.bus, [id]: v }; saveSettings(settings); applySettings(controls, settings); };
    const mute = h('button.switch', { onclick: () => { set('muted', !settings.muted); toggleClass(mute, 'on', settings.muted); } }, h('span.knob'));
    toggleClass(mute, 'on', settings.muted);
    const tilt = h('button.switch', { onclick: () => { set('tiltShift', !settings.tiltShift); toggleClass(tilt, 'on', settings.tiltShift); } }, h('span.knob'));
    toggleClass(tilt, 'on', settings.tiltShift);
    const row = (label, hint, ctl) => h('div.setrow', null, h('div', null, h('b', { text: label }), hint ? h('div.small.muted', { text: hint }) : null), ctl);
    back.replaceChildren(h('div.modal.settings', null,
      h('div.mhead', null, icon('settings', { size: 24 }), h('h2', { text: 'Settings' }), h('span.spacer'),
        h('button.btn.x', { title: 'Close (Esc)', onclick: () => close() }, icon('close'))),
      h('div.mbody', null,
        h('h3.sethead', { text: 'Audio' }),
        row('Master volume', null, level(settings.volume, (v) => set('volume', v))),
        ...BUSES.map((b) => row(b.label, null, level(settings.bus?.[b.id] ?? 1, (v) => setBus(b.id, v)))),
        row('Mute everything', null, mute),
        h('h3.sethead', { text: 'Game' }),
        row('Graphics quality', 'Low turns off ambient occlusion, bloom, and tilt-shift.', seg([{ v: 'low', label: 'Low' }, { v: 'high', label: 'High' }], settings.quality, (v) => set('quality', v))),
        row('Tilt-shift blur', 'The miniature look.', tilt),
        (() => {
          const sw = h('button.switch', { onclick: () => { set('pauseMenus', !settings.pauseMenus); toggleClass(sw, 'on', settings.pauseMenus); } }, h('span.knob'));
          toggleClass(sw, 'on', settings.pauseMenus);
          return row('Pause while menus are open', 'Time stops while a panel or popup is open.', sw);
        })(),
        (() => {
          const sw = h('button.switch', { onclick: () => { set('autoPause', settings.autoPause === false); toggleClass(sw, 'on', settings.autoPause !== false); } }, h('span.knob'));
          toggleClass(sw, 'on', settings.autoPause !== false);
          return row('Pause when the window loses focus', 'Switching tabs or apps stops the clock.', sw);
        })(),
        row('Default speed', 'Speed the game starts at.', seg([{ v: 1, label: '1x' }, { v: 2, label: '2x' }, { v: 4, label: '4x' }], settings.speed, (v) => set('speed', v))),
        h('div.small.muted', null, 'Keys: ', h('span.kbd', { text: 'Space' }), ' pause, ', h('span.kbd', { text: '1' }), h('span.kbd', { text: '2' }), h('span.kbd', { text: '3' }),
          ' speed, letters open panels, ', h('span.kbd', { text: 'Esc' }), ' closes.'))));
  }

  function open() { render(); back.style.display = ''; sfx('open'); }
  function close() { if (back.style.display === 'none') return false; back.style.display = 'none'; sfx('close'); return true; }

  return { open, close, get isOpen() { return back.style.display !== 'none'; }, get values() { return settings; } };
}
