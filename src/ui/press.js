import { PRESS } from '../data/press.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const outletIcons = new Map(PRESS.map(({ name, id }) => [name, `press.${id}`]));

export function pressOutlet(name, { compact = false } = {}) {
  const mark = outletIcons.get(name);
  const logo = mark ? icon(mark, { size: compact ? 22 : 32 }) : null;
  if (logo) logo.setAttribute('aria-hidden', 'true');
  return h('span.outlet', null, logo, h('span.outlet-name', { text: name }));
}
