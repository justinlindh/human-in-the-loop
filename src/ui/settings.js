import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';

const KEY = 'hitl.settings';
const DEFAULTS = { volume: 0.7, muted: false, quality: 'high', tiltShift: true, speed: 1, pauseMenus: true, autoPause: true };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw);
    return { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
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

  function render() {
    const volVal = h('b.num', { text: `${Math.round(settings.volume * 100)}%` });
    const slider = h('input.range', {
      type: 'range', min: '0', max: '100', value: String(Math.round(settings.volume * 100)),
      oninput: (e) => { set('volume', Number(e.target.value) / 100); setText(volVal, `${e.target.value}%`); },
      onchange: () => sfx('click'),
    });
    const mute = h('button.switch', { onclick: () => { set('muted', !settings.muted); toggleClass(mute, 'on', settings.muted); } }, h('span.knob'));
    toggleClass(mute, 'on', settings.muted);
    const tilt = h('button.switch', { onclick: () => { set('tiltShift', !settings.tiltShift); toggleClass(tilt, 'on', settings.tiltShift); } }, h('span.knob'));
    toggleClass(tilt, 'on', settings.tiltShift);
    const row = (label, hint, ctl) => h('div.setrow', null, h('div', null, h('b', { text: label }), hint ? h('div.small.muted', { text: hint }) : null), ctl);
    back.replaceChildren(h('div.modal.settings', null,
      h('div.mhead', null, icon('settings', { size: 24 }), h('h2', { text: 'Settings' }), h('span.spacer'),
        h('button.btn.x', { title: 'Close (Esc)', onclick: () => close() }, icon('close'))),
      h('div.mbody', null,
        row('Volume', null, h('div.row', null, slider, volVal)),
        row('Mute', null, mute),
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
