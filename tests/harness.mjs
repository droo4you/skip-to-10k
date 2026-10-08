// Loads the real browser scripts into a vm with a stubbed DOM and plays through every screen.
// Catches runtime errors in drawing and screen flow. node tests/harness.mjs
import fs from 'node:fs';
import vm from 'node:vm';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 1 }) : noop)), set: (t, k, v) => (t[k] = v, true) });
const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: noop, setPointerCapture: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }) });
const listeners = {};
const store = {};
const sandbox = {
  console, Math, Date, JSON, Number, String, Array, Object, Map, Set, Proxy, Error, parseInt, Symbol,
  document: { getElementById: () => gameCanvas, createElement: canvas },
  addEventListener: (k, f) => (listeners[k] = f), innerWidth: 960, innerHeight: 540,
  matchMedia: () => ({ matches: false }), localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
  performance: { now: () => 0 }, requestAnimationFrame: noop, setInterval: noop, setTimeout: f => f(), URLSearchParams,
  Image: function () { this.complete = true; },
};
const gameCanvas = canvas();
gameCanvas.addEventListener = (k, f) => (listeners['cv_' + k] = f);
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['font', 'sprites', 'sim', 'meta', 'art', 'audio', 'main']) vm.runInContext(fs.readFileSync(`src/${f}.js`, 'utf8'), sandbox, { filename: f + '.js' });
const run = code => vm.runInContext(code, sandbox);
const key = (code, up) => listeners[up ? 'keyup' : 'keydown']({ code, key: code, preventDefault: noop, repeat: false });
const frames = (n) => { for (let i = 0; i < n; i++) run('update(1/60); draw();'); };

frames(30);                          // title
key('Space'); frames(5);             // -> run-up
if (run('G8.screen') !== 'runup') throw new Error('not on the dock');
function sprintAndThrow(taps, holdFrames) {
  for (let i = 0; i < taps; i++) { key('Space'); frames(2); key('Space', true); frames(4); }
  key('Space'); frames(holdFrames); key('Space', true); frames(2);
}
// run off the end first: Droober should fall in and reset
for (let i = 0; i < 40 && run('G8.ru.phase') !== 'fell'; i++) { key('Space'); frames(2); key('Space', true); frames(4); }
if (run('G8.ru.phase') !== 'fell') throw new Error('never fell off the dock');
frames(130);
if (run('G8.ru.phase') !== 'ready') throw new Error('did not reset after falling: ' + run('G8.ru.phase'));
sprintAndThrow(12, 22);
console.log('throw: angle', run('Math.round(G8.run.vy)'), 'vx', run('Math.round(G8.run.vx)'));
if (run('G8.screen') !== 'fly') throw new Error('not flying: ' + run('G8.screen'));
// fly with the bot pressing keys, visiting every era by warping the rock forward
let warps = 0;
for (let i = 0; i < 60 * 300 && run('G8.screen') === 'fly'; i++) {
  const r = run('SIM.botInput(G8.run)');
  if (r.skip) key('Space');
  if (r.fart) key('KeyX');
  if (r.rc) key('KeyC');
  if (i % 600 === 300 && warps < 12) { run('G8.run.x += 3600; G8.run.vx = Math.max(G8.run.vx, 400); G8.run.vy = 300'); warps++; }
  if (i === 900) run('G8.run.alt = 580; G8.run.vy = 600');   // try a breakout
  frames(1);
}
console.log('screen after flight:', run('G8.screen'), 'day', run('Math.floor(SIM.dayAt(G8.run.x))'), 'eras seen', run('G8.run.seenEra'));
if (run('G8.screen') !== 'results') throw new Error('run did not end');
frames(45);
key('Space'); frames(5);
if (run('G8.screen') !== 'shop') throw new Error('no shop');
run('save.gwei = 99999'); for (let i = 0; i < 7; i++) { key('ArrowDown'); key('Enter'); key('Enter'); } frames(5);
console.log('upgrades', run('JSON.stringify(save.up)'), 'gwei', run('save.gwei'));
// touch flight with buttons drawn
run('G8.touch = true'); key('KeyT'); frames(3); sprintAndThrow(10, 20); frames(120);
for (const t of [1, 2]) { run('G8.screen = "shop"; G8.shopTab = ' + t); frames(3); key('KeyB'); key('ArrowRight'); frames(3); }
console.log('rocks', run('JSON.stringify(save.rocks)'), 'missions', run('JSON.stringify(save.missions)'));
key('Escape'); frames(5); key('Escape'); frames(60);
console.log('harness ok, screen', run('G8.screen'));
