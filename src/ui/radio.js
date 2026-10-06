// The boombox's controls (#139): an on/off toggle and a station picker in the Office panel, shown only while a
// boombox is placed. Everything it shows comes from state.radio and the sim's STATIONS; it changes the radio
// only through setRadio.
import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { picker } from './picker.js';
import { placedOf } from './placement.js';

// The sim's station list arrives in src/data/stations.js (an object keyed by id, or an array of { id, name }).
const mod = Object.values(import.meta.glob('../data/stations.js', { eager: true }))[0];

export function stationList(src = mod?.STATIONS) {
  if (!src) return [];
  const rows = Array.isArray(src) ? src.map((s) => [s.id, s]) : Object.entries(src);
  return rows.map(([id, v]) => ({ id, name: (typeof v === 'string' ? v : v?.name) ?? id[0].toUpperCase() + id.slice(1) }));
}

export const OFF = '__off';

export const hasBoombox = (s) => placedOf(s).some((p) => p.itemId === 'boombox');
export const radioOf = (s) => ({ on: !!s.radio?.on, station: s.radio?.station ?? null });

// What the picker's button shows: the playing station, or "Radio off".
export const radioValue = (s) => { const r = radioOf(s); return r.on && r.station ? r.station : OFF; };

// The action a pick sends: a station turns the radio on with it; "Radio off" turns it off and keeps the station.
export const pickAction = (value) => (value === OFF ? { type: 'setRadio', on: false } : { type: 'setRadio', on: true, station: value });

export function radioCard(ctx, s, bind, stations = stationList()) {
  const options = [{ value: OFF, label: 'Radio off', icon: 'sound.off' }, ...stations.map((st) => ({ value: st.id, label: st.name, icon: 'sound.on' }))];
  const pick = picker({
    options, value: radioValue(s), title: 'Pick a station', className: 'radiopick',
    onChange: (value) => {
      const res = ctx.act(pickAction(value));
      if (res.ok) ctx.sfx('confirm');
      return res;
    },
  });
  const toggle = h('button.btn.radiotoggle', { type: 'button', onclick: () => {
    const on = !!ctx.getState().radio?.on;
    if (ctx.act({ type: 'setRadio', on: !on }).ok) ctx.sfx('click');
  } });
  const now = h('div.small.muted.radionow');
  bind((st) => {
    const r = radioOf(st);
    pick.set(radioValue(st));
    toggle.replaceChildren(icon(r.on ? 'sound.on' : 'sound.off', { size: 16 }), r.on ? ' On' : ' Off');
    toggle.setAttribute('aria-pressed', String(r.on));
    toggleClass(toggle, 'on', r.on);
    const name = stations.find((x) => x.id === r.station)?.name;
    setText(now, r.on ? (name ? `Playing ${name}.` : 'Playing.') : name ? `Off. ${name} is next time.` : 'Off.');
  });
  return h('div.card.radiocard', null,
    h('div.radiohead', null, icon('sound.on', { size: 20 }), h('b', { text: 'Radio' }), h('span.spacer'), toggle),
    h('div.radiorow', null, pick.el),
    now);
}
