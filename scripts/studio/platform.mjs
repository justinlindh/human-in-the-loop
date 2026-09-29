import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const noop = () => {};
const paint = Object.fromEntries(('save restore scale translate rotate transform setTransform resetTransform clearRect fillRect strokeRect beginPath closePath moveTo lineTo arc arcTo ellipse rect roundRect bezierCurveTo quadraticCurveTo fill stroke clip fillText strokeText drawImage setLineDash putImageData').split(' ').map(k => [k, noop]));
const gradient = () => ({ addColorStop: noop });
export class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.style = {}; this.children = [];
    this.width = this.height = 1; this.clientWidth = 1600; this.clientHeight = 1000;
    this.classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
    this.dataset = {}; this.textContent = ''; this.ownerDocument = globalThis.document;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(c => this.appendChild(c)); }
  prepend(child) { child.parentNode = this; this.children.unshift(child); }
  removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute() {} addEventListener() {} removeEventListener() {}
  querySelectorAll() { return []; } querySelector() { return null; }
  cloneNode() { return new Element(this.tagName); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  getContext(kind) {
    if (kind !== '2d') throw new Error(`scene-engine: unsupported canvas context ${kind}`);
    return this.context ??= { ...paint, canvas: this, createLinearGradient: gradient, createRadialGradient: gradient,
      measureText: () => ({ width: 0 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  }
}

export function installPlatform(root, { quality = 'low', rig = false } = {}) {
  const g = globalThis;
  g.window = g; g.self = g; g.Element = Element; g.HTMLElement = Element;
  g.document = { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, hidden: false, fonts: { check: () => true, load: async () => [], ready: Promise.resolve(), addEventListener: noop } };
  g.document.defaultView = g;
  g.document.body = new Element(); g.document.head = new Element(); g.document.documentElement = new Element();
  g.innerWidth = 1600; g.innerHeight = 1000; g.devicePixelRatio = 1;
  g.location = { search: `?snap=1&quality=${quality}&rig=${rig ? 1 : 0}`, href: 'http://scene.invalid/' };
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
