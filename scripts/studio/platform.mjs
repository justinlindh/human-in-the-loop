import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const noop = () => {};
const paint = Object.fromEntries(('save restore scale translate rotate transform setTransform resetTransform clearRect fillRect strokeRect beginPath closePath moveTo lineTo arc arcTo ellipse rect roundRect bezierCurveTo quadraticCurveTo fill stroke clip fillText strokeText drawImage setLineDash putImageData').split(' ').map(k => [k, noop]));
const gradient = () => ({ addColorStop: noop });
// One compound selector (`div`, `.a`, `div.a.b`, `#id`) against an element.
function matchesCompound(el, sel) {
  const m = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/.exec(sel);
  if (!m) return false;
  if (m[1] && m[1] !== '*' && el.tagName !== m[1].toUpperCase()) return false;
  for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.' ? !el._classes.has(part.slice(1)) : el.id !== part.slice(1)) return false;
  }
  return true;
}
// A selector list of compound selectors joined by spaces (descendant), as the checks query labels and
// bubbles: `.hitl-say`, `.hitl-say .in`. No layout: geometry reads stay zero.
function matches(el, selector) {
  return selector.split(',').some((one) => {
    const parts = one.trim().split(/\s+/).filter(Boolean);
    if (!parts.length || !matchesCompound(el, parts[parts.length - 1])) return false;
    let at = el.parentNode;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (at && !(at instanceof Element && matchesCompound(at, parts[i]))) at = at.parentNode;
      if (!at) return false;
      at = at.parentNode;
    }
    return true;
  });
}
function descendants(root, out = []) { for (const c of root.children ?? []) { out.push(c); descendants(c, out); } return out; }

// A small working DOM tree: children, classes, text and selector queries behave as in a page, so a
// check that looks for a speech bubble by class finds the label the game made. Nothing is laid out.
export class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.style = {}; this.children = []; this.parentNode = null; this.id = '';
    this.width = this.height = 1; this.clientWidth = 1600; this.clientHeight = 1000;
    this._classes = new Set(); this._text = '';
    const classes = this._classes;
    this.classList = {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => { const on = force ?? !classes.has(c); if (on) classes.add(c); else classes.delete(c); return on; },
      contains: (c) => classes.has(c),
    };
    this.dataset = {}; this.ownerDocument = globalThis.document;
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) this._classes.add(c); }
  get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = v == null ? '' : String(v); }
  get isConnected() { let at = this; while (at.parentNode) at = at.parentNode; return at === globalThis.document; }
  get firstChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children[this.children.length - 1] ?? null; }
  appendChild(child) { child.parentNode?.removeChild?.(child); child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(c => this.appendChild(c)); }
  prepend(child) { child.parentNode?.removeChild?.(child); child.parentNode = this; this.children.unshift(child); }
  insertBefore(child, ref) { child.parentNode?.removeChild?.(child); const i = this.children.indexOf(ref); child.parentNode = this; this.children.splice(i < 0 ? this.children.length : i, 0, child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; return child; }
  replaceChildren(...children) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...children); }
  remove() { this.parentNode?.removeChild(this); }
  contains(node) { for (let at = node; at; at = at.parentNode) if (at === this) return true; return false; }
  setAttribute(k, v) { if (k === 'class') this.className = v; else if (k === 'id') this.id = String(v); } addEventListener() {} removeEventListener() {}
  matches(selector) { return matches(this, selector); }
  closest(selector) { for (let at = this; at instanceof Element; at = at.parentNode) if (matches(at, selector)) return at; return null; }
  querySelectorAll(selector) { return descendants(this).filter((el) => el instanceof Element && matches(el, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode() { return new Element(this.tagName); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  getContext(kind) {
    if (kind !== '2d') throw new Error(`scene-engine: unsupported canvas context ${kind}`);
    return this.context ??= { ...paint, canvas: this, createLinearGradient: gradient, createRadialGradient: gradient,
      measureText: () => ({ width: 0 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  }
}

export function installPlatform(root, { quality = 'low', rig = null } = {}) {
  const g = globalThis;
  g.window = g; g.self = g; g.Element = Element; g.HTMLElement = Element;
  g.document = { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    getElementById: (id) => descendants(g.document).find((el) => el instanceof Element && el.id === id) ?? null,
    querySelectorAll: (selector) => descendants(g.document).filter((el) => el instanceof Element && matches(el, selector)),
    querySelector: (selector) => g.document.querySelectorAll(selector)[0] ?? null,
    addEventListener: noop, hidden: false, fonts: { check: () => true, load: async () => [], ready: Promise.resolve(), addEventListener: noop } };
  g.document.defaultView = g;
  // html > head, body under the document, so an element added under body is connected and found.
  const html = new Element('html');
  g.document.children = [html]; html.parentNode = g.document;
  g.document.documentElement = html; g.document.head = html.appendChild(new Element('head')); g.document.body = html.appendChild(new Element('body'));
  g.innerWidth = 1600; g.innerHeight = 1000; g.devicePixelRatio = 1;
  // `eras` is always on, so a state that carries an era founding wears its era art (runtime.mjs `era`);
  // a Classic state keeps the ordinary office.
  g.location = { search: `?snap=1&eras&quality=${quality}${rig == null ? '' : `&rig=${rig ? 1 : 0}`}`, href: 'http://scene.invalid/' };
  // Events the game dispatches on window (the spotlight, sounds) reach the checks that listen for them.
  const listeners = new Map();
  g.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  g.removeEventListener = (type, fn) => { listeners.get(type)?.delete(fn); };
  g.dispatchEvent = (event) => { for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event); return true; };
  g.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  g.ResizeObserver = class { observe() {} disconnect() {} };
  g.Image = class extends Element { constructor() { super('img'); } set src(value) { this.source = value; } };
  g.ProgressEvent = class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
  const publicRoot = resolve(root, 'public');
  g.Request = class { constructor(url, init = {}) { this.url = String(url); this.headers = new Headers(init.headers); } };
  g.fetch = async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (/^[a-z]+:/i.test(url)) throw new Error(`scene-engine: network fetch forbidden: ${url}`);
    const file = resolve(publicRoot, decodeURIComponent(url).replace(/^\/+/, ''));
    if (!file.startsWith(publicRoot + sep)) throw new Error('scene-engine: asset escapes public');
    globalThis.__hitlLoaded?.add(file);
    return new Response(readFileSync(file));
  };
  let tick = 0;
  performance.now = () => tick * 1000 / 30;
  Date.now = () => 1700000000000 + tick * 1000 / 30;
  g.requestAnimationFrame = () => 0;
  let gameSeed = 1234567, toolSeed = 7654321;
  const game = () => ((gameSeed = gameSeed * 16807 % 2147483647) - 1) / 2147483646;
  const tool = () => ((toolSeed = toolSeed * 16807 % 2147483647) - 1) / 2147483646;
  Math.random = game;
  g.__tool = fn => { const previous = Math.random; Math.random = tool; try { return fn(); } finally { Math.random = previous; } };
  return { tick: () => ++tick, reseed: () => { gameSeed = 1234567; }, tool };
}
