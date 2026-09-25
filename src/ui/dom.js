// Tiny DOM helpers for the overlay. No framework: build once, then patch text and widths.

export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = el.className ? `${el.className} ${v}` : v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      // A title becomes a game-styled tooltip (tooltip.js), never the browser's native one.
      else if (k === 'title') el.dataset.tip = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  // An icon-only control keeps its tooltip text as its accessible name.
  if (el.dataset.tip && !el.hasAttribute('aria-label') && /^(BUTTON|A)$/.test(el.tagName) && !el.textContent.trim()) el.setAttribute('aria-label', el.dataset.tip);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(parent, ...children) {
  append(parent, children);
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Sets text only when it changed, so per-frame refreshes do not touch the layout.
export function setText(el, text) {
  const s = String(text);
  if (el.textContent !== s) el.textContent = s;
}

export function setWidth(el, frac) {
  const w = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
  if (el.style.width !== w) el.style.width = w;
}

export function setClass(el, cls) {
  if (el.className !== cls) el.className = cls;
}

export function toggleClass(el, cls, on) {
  if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
}

const safe = (v) => (Number.isFinite(v) ? v : 0);

export function fmtMoney(v, { sign = false } = {}) {
  const n = safe(v);
  const a = Math.abs(n);
  let body;
  if (a >= 1e9) body = `${trim(a / 1e9, a >= 1e10 ? 1 : 2)}B`;
  else if (a >= 1e6) body = `${trim(a / 1e6, a >= 1e7 ? 1 : 2)}M`;
  else if (a >= 1e4) body = `${trim(a / 1e3, a >= 1e5 ? 0 : 1)}K`;
  else body = Math.round(a).toLocaleString('en-US');
  const pre = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${pre}$${body}`;
}

export function fmtNum(v, dp = 0) {
  const n = safe(v);
  const a = Math.abs(n);
  if (a >= 1e6) return `${n < 0 ? '-' : ''}${trim(a / 1e6, 1)}M`;
  if (a >= 1e4) return `${n < 0 ? '-' : ''}${trim(a / 1e3, a >= 1e5 ? 0 : 1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 });
}

export function fmtPct(v, dp = 0) {
  return `${(safe(v) * 100).toFixed(dp)}%`;
}

function trim(v, dp) {
  return v.toFixed(dp).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export { dateOf } from '../sim/util.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, safe(v)));

export const titleCase = (s) => String(s ?? '').replace(/(^|[_\s-])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase());
