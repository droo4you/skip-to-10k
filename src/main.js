// Skip to 10K: screens, input, camera, HUD, shop, save. Physics lives in sim.js, missions/news/rocks in meta.js.
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;

// ---------- save ----------
const SAVE_KEY = 'skip10k.v1';
function loadSave() {
  const fresh = { gwei: 0, up: {}, runs: 0, best: { days: 0, peak: 0 }, flags: {}, muted: false, music: true,
    missions: [], rocks: [], rock: 0 };
  let s = fresh;
  try { s = Object.assign(fresh, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch {}
  if (!s.rocks.length) { const k = 1 + Math.floor(Math.random() * 99); s.rocks = [k]; s.rock = k; }
  if (!s.rocks.includes(s.rock)) s.rock = s.rocks[0];
  return s;
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
Audio8.muted = save.muted; Audio8.musicOn = save.music;

// ---------- state ----------
const DOCK_START = -236, DOCK_END = 40, RUN_VMAX = 220;
const G8 = {
  screen: 'title', time: 0, run: null,
  camX: 0, camAlt: 0, shake: 0, slow: 0,
  ru: null,                         // run-up on the dock
  texts: [], parts: [], banner: null, res: null, paused: false,
  shopTab: 0, shopSel: 0, rockSel: 0,
  rc: { x: 40, alt: 70 }, touch: false, hintT: 0,
  news: null, newsI: 0, bubble: null, bubbleCd: 4,
};
window.__game = G8;

// ---------- input ----------
const keys = new Set();
const edge = { skip: false, fart: false, rc: false };
const ACTION_KEYS = ['Space', 'Enter', 'KeyZ'];
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key) || e.code === 'Space') e.preventDefault();
  Audio8.init();
  if (e.repeat) return;
  keys.add(e.code);
  onKey(e.code);
});
addEventListener('keyup', e => { keys.delete(e.code); if (ACTION_KEYS.includes(e.code) && G8.screen === 'runup') ruRelease(); });
addEventListener('blur', () => { keys.clear(); if (G8.ru) G8.ru.down = false; });

function onKey(code) {
  if (code === 'KeyM') { save.muted = !save.muted; Audio8.setMuted(save.muted); persist(); return; }
  if (code === 'KeyN') { save.music = !save.music; Audio8.setMusic(save.music); persist(); return; }
  const s = G8.screen;
  if (s === 'title') { if (ACTION_KEYS.includes(code)) toRunup(); return; }
  if (s === 'runup') {
    if (ACTION_KEYS.includes(code)) ruPress();
    if ((code === 'Escape' || code === 'KeyS') && G8.ru.phase === 'ready') toShop();
    return;
  }
  if (s === 'fly') {
    if (code === 'Escape' || code === 'KeyP') { G8.paused = !G8.paused; return; }
    if (G8.paused) return;
    if (ACTION_KEYS.includes(code)) edge.skip = true;
    if (code === 'KeyX' || code === 'ShiftLeft' || code === 'ShiftRight') edge.fart = true;
    if (code === 'KeyC' || code === 'KeyR') edge.rc = true;
    return;
  }
  if (s === 'results') {
    if (G8.res && G8.time - G8.res.at < 0.6) return; // don't skip the results by mashing
    if (code === 'KeyR') toRunup();
    else if (ACTION_KEYS.includes(code) || code === 'Escape') toShop();
    return;
  }
  if (s === 'shop') shopKey(code);
}

function canvasPt(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
const pointers = new Map(); // id -> {x, y, btn}
const TOUCH_BTNS = {
  up: [8, 150, 52, 48], down: [8, 204, 52, 48],
  fart: [334, 214, 58, 38], rc: [334, 170, 58, 38], skip: [398, 170, 74, 82],
};
function btnAt(p) {
  for (const k in TOUCH_BTNS) { const [x, y, w, h] = TOUCH_BTNS[k]; if (p.x >= x && p.x < x + w && p.y >= y && p.y < y + h) return k; }
  return null;
}
const hitRect = (p, [x, y, w, h]) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
const SHOP_BTN = [W - 56, 4, 50, 13];
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); Audio8.init();
  if (e.pointerType === 'touch') G8.touch = true;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = canvasPt(e);
  const s = G8.screen;
  if (s === 'title') return toRunup();
  if (s === 'results') {
    if (G8.time - G8.res.at < 0.6) return;
    if (hitRect(p, RES_AGAIN)) return toRunup();
    return toShop();
  }
  if (s === 'shop') return shopClick(p);
  if (s === 'runup') {
    if (hitRect(p, SHOP_BTN) && G8.ru.phase === 'ready') return toShop();
    pointers.set(e.pointerId, { ...p, btn: 'runup' });
    return ruPress();
  }
  if (s === 'fly') {
    if (G8.paused) { G8.paused = false; return; }
    if (hitRect(p, [W - 22, 4, 18, 14])) { G8.paused = true; return; }
    const b = G8.touch ? btnAt(p) : null;
    pointers.set(e.pointerId, { ...p, btn: b });
    if (!b || b === 'skip') edge.skip = true;
    if (b === 'fart') edge.fart = true;
    if (b === 'rc') edge.rc = true;
  }
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const p = canvasPt(e), q = pointers.get(e.pointerId);
  q.x = p.x; q.y = p.y;
  if (q.btn === 'up' || q.btn === 'down') q.btn = btnAt(p) || q.btn;
});
function endPointer(e) {
  const q = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (q && q.btn === 'runup' && G8.screen === 'runup') ruRelease();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', e => e.preventDefault());

function tiltInput() {
  let t = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) t += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) t -= 1;
  for (const q of pointers.values()) { if (q.btn === 'up') t += 1; if (q.btn === 'down') t -= 1; }
  return Math.max(-1, Math.min(1, t));
}

// ---------- the run-up ----------
// Mash to sprint Droober down the dock. Hold to raise the throwing arm. Let go to throw.
// Let go close to the end of the dock for a bonus. Run off the end and you swim.
const HOLD_T = 0.16;
function newRunup() {
  return { phase: 'ready', x: DOCK_START + 26, v: 0, down: false, downT: 0, angle: 0, taps: 0, fellT: 0, stepT: 0, lastTap: -9 };
}
function ruPress() {
  const ru = G8.ru;
  if (!ru || ru.phase === 'fell' || ru.phase === 'thrown') return;
  if (ru.phase === 'ready') ru.phase = 'run';
  ru.down = true; ru.downT = G8.time;
  if (ru.phase === 'run') {
    ru.v += 30 * Math.pow(Math.max(0, 1 - ru.v / RUN_VMAX), 0.7) + 4;
    ru.taps++; ru.lastTap = G8.time;
    Audio8.sfx('step', ru.v / RUN_VMAX);
    for (let i = 0; i < 2; i++) G8.parts.push({ x: ru.x - 6, alt: 23, vx: -30 - Math.random() * 40, vy: 20 + Math.random() * 30, t: 0, life: 0.4, color: '#c8a878', kind: 'dot' });
  }
}
function ruRelease() {
  const ru = G8.ru;
  if (!ru) return;
  ru.down = false;
  if (ru.phase === 'windup') ruThrow();
}
function ruBonus(ru) {
  const d = DOCK_END - ru.x;
  return d < 16 ? 1.12 : d < 50 ? 1.05 : 1;
}
function ruPower(ru) { return Math.min(1, ru.v / RUN_VMAX) * ruBonus(ru); }
function ruThrow() {
  const ru = G8.ru, run = G8.run;
  const b = ruBonus(ru), power = ruPower(ru);
  if (power < 0.05) { ru.phase = 'run'; return; }
  ru.phase = 'thrown';
  SIM.throwRock(run, ru.angle, power, ru.x + 8);
  run.alt = 40 + Math.sin(ru.angle * Math.PI / 180) * 8;
  if (b > 1.1) { run.counts.line = 1; addText('ON THE LINE', ru.x + 8, 70, '#ffe066'); Audio8.sfx('line'); }
  else if (b > 1) addText('GOOD RELEASE', ru.x + 8, 70, '#7be08a');
  G8.screen = 'fly'; G8.hintT = 0;
  G8.rc = { x: ru.x - 10, alt: 90 };
  showBanner(SIM.ERAS[0].name, SIM.ERAS[0].sub);
}
function updateRunup(dt) {
  const ru = G8.ru;
  if (ru.phase === 'fell') {
    ru.fellT += dt;
    if (ru.fellT > 1.8) { G8.ru = newRunup(); G8.parts = []; }
    return;
  }
  if (ru.phase === 'thrown') { ru.v = Math.max(0, ru.v - 300 * dt); ru.x = Math.min(DOCK_END, ru.x + ru.v * dt); return; }
  if (ru.down && ru.phase === 'run' && G8.time - ru.downT > HOLD_T) { ru.phase = 'windup'; ru.angle = 0; }
  if (ru.phase === 'windup') {
    const prev = ru.angle;
    ru.angle = Math.min(60, (G8.time - ru.downT - HOLD_T) * 58);
    if ((prev / 4 | 0) !== (ru.angle / 4 | 0)) Audio8.sfx('windup', ru.angle);
  }
  ru.v = Math.max(0, ru.v - (ru.phase === 'windup' ? 32 : 52) * dt);
  ru.x += ru.v * dt;
  ru.stepT += dt * (2 + ru.v / 25);
  if (ru.x > DOCK_END + 6) {
    ru.phase = 'fell'; ru.fellT = 0; ru.down = false;
    Audio8.sfx('fall');
    say('rc', 'fell');
    setTimeout(() => { if (G8.ru === ru) splash(DOCK_END + 26, 18, true); }, 380);
  }
}

// ---------- screen changes ----------
function toRunup() {
  G8.screen = 'runup';
  G8.run = SIM.newRun(save.up, (Math.random() * 2 ** 31) >>> 0);
  G8.ru = newRunup();
  G8.camX = DOCK_START - 30; G8.camAlt = 0; G8.texts = []; G8.parts = []; G8.banner = null; G8.paused = false;
  G8.news = null; G8.newsI = 0; G8.bubble = null; G8.bubbleCd = 5; G8.slow = 0;
  G8.rc = { x: DOCK_START + 20, alt: 90 };
  edge.skip = edge.fart = edge.rc = false;
  pointers.clear();
  Audio8.sfx('menu');
}
function toShop() { G8.screen = 'shop'; G8.shopSel = SIM.UPGRADES.length; G8.rockSel = Math.max(0, save.rocks.indexOf(save.rock)); Audio8.sfx('menu'); }
function finishRun() {
  const run = G8.run;
  const r = SIM.results(run);
  const mult = META.multiplier(save);
  r.earned = Math.round(r.earned * mult); r.mult = mult;
  const rankBefore = META.rankOf(save.missions.length);
  r.done = META.complete(save, r, run.counts);
  r.missionGwei = r.done.reduce((a, m) => a + m.reward, 0);
  r.rankUp = META.rankOf(save.missions.length) > rankBefore ? META.RANKS[META.rankOf(save.missions.length)] : null;
  save.runs++;
  save.gwei += r.earned + r.missionGwei;
  r.newBest = r.days > save.best.days;
  save.best.days = Math.max(save.best.days, r.days);
  save.best.peak = Math.max(save.best.peak, r.peak);
  if (r.broke5k) save.flags.broke5k = true;
  if (r.broke10k) save.flags.broke10k = true;
  if (r.days >= SIM.TODAY_DAY) save.flags.today = true;
  if (r.days >= SIM.ERAS[SIM.ERAS.length - 1].day) save.flags.forever = true;
  persist();
  r.quip = quipFor(r);
  r.candles = run.candles.slice();
  r.at = G8.time;
  G8.res = r; G8.screen = 'results';
  if (r.done.length) setTimeout(() => Audio8.sfx('mission'), 500);
}
function quipFor(r) {
  const pickQ = a => a[(r.days + r.skips) % a.length];
  if (r.days >= SIM.ERAS[SIM.ERAS.length - 1].day) return pickQ(['FOREVER. SEE YOU NEXT BLOCK.', 'THE WORLD COMPUTER NEVER SLEEPS.']);
  if (r.broke10k) return pickQ(['10K. SCREENSHOT IT. NOBODY WILL BELIEVE YOU.', 'TOLD YOU. 10K.']);
  if (r.broke5k) return pickQ(['NEW ATH. FOR A MINUTE.', 'PRICE DISCOVERY. THEN GRAVITY.']);
  if (r.reason === 'FROZE') return pickQ(['FROZEN SOLID. HODLING.', 'WINTER GOT ANOTHER ONE.']);
  if (r.peak >= 4700) return pickQ(['SO CLOSE TO THE ATH. AGAIN.', 'REJECTED AT 4.9K. CLASSIC.']);
  return pickQ(['SIDEWAYS AGAIN.', 'CHOP CHOP.', 'RANGE BOUND. AS USUAL.', 'NEXT CYCLE FOR SURE.',
    'ULTRA SOUND. ULTRA SIDEWAYS.', 'THE ROCK DOES NOTHING. AS PROMISED.', 'FEW UNDERSTAND.']);
}

// ---------- fx ----------
function showBanner(title, sub) { G8.banner = { title, sub, t: 0 }; }
function addText(text, x, alt, color) { G8.texts.push({ text, x, alt, color: color || '#fff', t: 0 }); }
function burst(x, alt, n, color, spd = 80, kind = 'dot') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.8);
    G8.parts.push({ x, alt, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v + 20, t: 0, life: 0.5 + Math.random() * 0.5, color, kind });
  }
}
function splash(x, n, big) {
  for (let i = 0; i < n; i++) G8.parts.push({ x: x + (Math.random() - 0.5) * 6, alt: 0, vx: (Math.random() - 0.3) * 60, vy: 60 + Math.random() * (big ? 160 : 90), t: 0, life: 0.6, color: '#d8f4ff', kind: 'drop' });
}
// speech bubbles: RC talks like the timeline
function say(who, kind, chance = 1) {
  if (Math.random() > chance) return;
  const lines = META.BANTER[kind];
  G8.bubble = { who, text: lines[Math.floor(Math.random() * lines.length)], t: 0 };
  G8.bubbleCd = 6 + Math.random() * 6;
}
function handleEvents(run) {
  for (const ev of run.events) {
    const c = ev.color;
    switch (ev.type) {
      case 'throw': Audio8.sfx('throw'); break;
      case 'skip': Audio8.sfx(ev.text === 'PERFECT' ? 'perfect' : 'skip', run.streak); splash(ev.x, ev.text === 'PERFECT' ? 9 : 5, false); if (ev.text === 'PERFECT') { G8.shake = Math.max(G8.shake, 1.5); burst(ev.x, 4, 5, '#ffe066', 45); } if (ev.text === 'PERFECT') say('rc', 'perfect', 0.12); break;
      case 'perfect': Audio8.sfx('perfect', run.streak); burst(ev.x, ev.alt + 4, 6, '#ffe066', 50); G8.shake = Math.max(G8.shake, 1.5); break;
      case 'splash': Audio8.sfx('splash'); splash(ev.x, 14, true); G8.shake = 4; break;
      case 'sink': Audio8.sfx('sink'); splash(ev.x, 16, true); break;
      case 'froze': Audio8.sfx('ice'); break;
      case 'gem': Audio8.sfx('gem'); burst(ev.x, ev.alt, 4, '#d6c2ff', 40); break;
      case 'banana': Audio8.sfx('banana'); break;
      case 'fart': Audio8.sfx('fart'); burst(ev.x - 6, ev.alt, 10, '#9ff07a', 50, 'puff'); say('rc', 'fart', 0.4); break;
      case 'pump': Audio8.sfx('pump'); G8.shake = 3; break;
      case 'whale': Audio8.sfx('whale'); splash(ev.x, 18, true); break;
      case 'dump': Audio8.sfx('dump'); G8.shake = 5; say('rc', 'dump', 0.7); break;
      case 'suit': Audio8.sfx('suit'); burst(ev.x, ev.alt, 8, '#7be08a', 70); break;
      case 'kevin': Audio8.sfx('kevin'); burst(ev.x, ev.alt, 12, '#ffb3e6', 90); say('rc', 'kevin'); break;
      case 'yacht': Audio8.sfx('yacht'); break;
      case 'skrump': Audio8.sfx('skrump'); burst(ev.x, ev.alt, 8, '#c89bff', 60); break;
      case 'bonk': Audio8.sfx('bonk'); G8.shake = 3; break;
      case 'fork': Audio8.sfx('fork'); G8.parts.push({ x: ev.x, alt: ev.alt, vx: 160, vy: -40, t: 0, life: 1.6, color: '#7be08a', kind: 'ghost' }); break;
      case 'bat': Audio8.sfx('bat'); break;
      case 'ice': Audio8.sfx('ice'); break;
      case 'rc': Audio8.sfx('rc'); break;
      case 'airdrop': Audio8.sfx('airdrop'); burst(ev.x, ev.alt, 10, '#ffe066', 70); say('rc', 'airdrop', 0.6); break;
      case 'scam': Audio8.sfx('scam'); say('rc', 'scam'); break;
      case 'rejected': Audio8.sfx('rejected'); G8.shake = 6; say('rc', 'rejected', 0.8); break;
      case 'breakout': Audio8.sfx('breakout'); burst(ev.x, ev.alt, 40, '#7be08a', 160, 'confetti'); G8.shake = 6; G8.slow = 0.7; say('rc', 'breakout'); break;
      case 'era': { Audio8.sfx('era'); const e = SIM.ERAS.find(x => x.name === ev.text); showBanner(e.name, e.sub); continue; }
      case 'today': Audio8.sfx('today'); burst(ev.x, ev.alt, 40, '#ffe066', 160, 'confetti'); G8.slow = 0.7; showBanner('YOU ARE HERE', 'DAY ' + SIM.TODAY_DAY + '. STILL NOT 10K'); continue;
    }
    if (ev.text) addText(ev.text, ev.x, ev.alt + 14, c);
  }
  run.events.length = 0;
}

// ---------- update ----------
let acc = 0;
function update(dt) {
  G8.time += dt;
  const run = G8.run;
  if (G8.banner) { G8.banner.t += dt; if (G8.banner.t > 3) G8.banner = null; }
  if (G8.news) { G8.news.t += dt; if (G8.news.t > 4) G8.news = null; }
  if (G8.bubble) { G8.bubble.t += dt; if (G8.bubble.t > 2.2) G8.bubble = null; }
  shopFlash = Math.max(0, shopFlash - dt);
  G8.shake = Math.max(0, G8.shake - dt * 20);

  if (G8.screen === 'runup') {
    updateRunup(dt);
    const ru = G8.ru;
    const tx = Math.min(DOCK_END - 200, Math.max(DOCK_START - 30, ru.x - 170));
    G8.camX += (tx - G8.camX) * Math.min(1, dt * 6);
    G8.rc.x += (ru.x + 4 - G8.rc.x) * Math.min(1, dt * 4);
    G8.rc.alt += (88 + Math.sin(G8.time * 6) * (ru.phase === 'run' ? 6 : 3) - G8.rc.alt) * Math.min(1, dt * 6);
  }
  if (G8.screen === 'fly' && !G8.paused) {
    let sdt = dt;
    if (G8.slow > 0) { G8.slow -= dt; sdt = dt * 0.35; }
    acc += Math.min(sdt, 0.1);
    G8.hintT += dt;
    if (DEMO) demoInput();
    const input = { tilt: tiltInput(), skip: edge.skip, fart: edge.fart, rc: edge.rc };
    edge.skip = edge.fart = edge.rc = false;
    while (acc >= SIM.DT) {
      SIM.step(run, input);
      input.skip = input.fart = input.rc = false;
      acc -= SIM.DT;
    }
    handleEvents(run);
    // breaking news as the rock passes each date
    const day = SIM.dayAt(run.x);
    while (G8.newsI < META.NEWS.length && META.NEWS[G8.newsI].day <= day) {
      const n = META.NEWS[G8.newsI++];
      if (day - n.day < 60) { G8.news = { ...n, t: 0 }; Audio8.sfx('news'); }
    }
    G8.bubbleCd -= dt;
    if (G8.bubbleCd <= 0 && run.phase === 'fly') say('rc', run.vx < 140 ? 'slow' : 'idle');
    if (run.phase === 'done') finishRun();
  }
  // camera
  if (run && (G8.screen === 'fly' || G8.screen === 'results')) {
    const tx = run.x - 150 + Math.min(70, run.vx * 0.08), ta = Math.max(0, run.alt - 105);
    G8.camX += (tx - G8.camX) * Math.min(1, dt * 8);
    G8.camAlt += (ta - G8.camAlt) * Math.min(1, dt * 5);
    const grab = run.rcT > 0;
    const rx = grab ? run.x - 2 : run.x - 20, ra = grab ? run.alt + 8 : run.alt + 16 + Math.sin(G8.time * 5) * 3;
    G8.rc.x += (rx - G8.rc.x) * Math.min(1, dt * (grab ? 20 : 10));
    G8.rc.alt += (ra - G8.rc.alt) * Math.min(1, dt * (grab ? 20 : 10));
  } else if (G8.screen === 'title') G8.camX = DOCK_END - 420 + Math.sin(G8.time * 0.3) * 12;
  for (const t of G8.texts) t.t += dt;
  G8.texts = G8.texts.filter(t => t.t < 1.3);
  for (const p of G8.parts) {
    p.t += dt; p.x += p.vx * dt; p.alt += p.vy * dt;
    if (p.kind !== 'ghost' && p.kind !== 'puff') p.vy -= 300 * dt;
    if (p.kind === 'puff') { p.vx *= 0.95; p.vy *= 0.95; }
  }
  G8.parts = G8.parts.filter(p => p.t < p.life && (p.kind !== 'drop' || p.alt > -2));
}

// ---------- draw: world ----------
const sx = x => Math.round(x - G8.camX);
const sy = alt => Math.round(WATER_Y - alt + G8.camAlt);

function eraBlend(x) {
  const i = SIM.eraIndexAt(x), d = SIM.dayAt(x) - SIM.ERAS[i].day;
  if (i > 0 && d < 60) return [SIM.ERAS[i - 1].id, SIM.ERAS[i].id, d / 60];
  return [SIM.ERAS[i].id, null, 0];
}

const ALWAYS_DRAWN = new Set(['pump', 'whaleG', 'whaleR', 'suit', 'kevin', 'fork', 'bull', 'bear', 'kitty']);
function drawWorld() {
  const camX = G8.camX, camAlt = G8.camAlt, time = G8.time;
  const [ea, eb, t] = eraBlend(Math.max(0, camX + W / 2));
  drawBackdrop(ctx, ea, camX, camAlt, time);
  if (eb) { ctx.globalAlpha = t; drawBackdrop(ctx, eb, camX, camAlt, time); ctx.globalAlpha = 1; }
  drawClouds(ctx, eb && t > 0.5 ? eb : ea, camX, camAlt);
  drawPriceGrid();
  drawWater(ctx, ea, camX, camAlt, time, SIM.ICE);
  if (eb) { ctx.globalAlpha = t; drawWater(ctx, eb, camX, camAlt, time, SIM.ICE); ctx.globalAlpha = 1; }
  if (camX < 260) drawDock();
  for (const era of SIM.ERAS) {
    const x = era.day * SIM.PX_PER_DAY + 30;
    if (x - camX > -120 && x - camX < W + 20 && era.day > 0) drawEraBuoy(ctx, era, sx(x), sy(0), time);
  }
  const run = G8.run;
  if (run && G8.screen !== 'title') {
    for (const e of run.ents) {
      if (e.used && !ALWAYS_DRAWN.has(e.t)) continue;
      const ex = sx(e.x);
      if (ex < -80 || ex > W + 20) continue;
      drawEnt(ctx, run, e, ex, sy(e.alt), time);
    }
    drawResistance(SIM.ALT_5K, '$4,953 ATH', run.broke5k);
    drawResistance(SIM.ALT_10K, '$10,000', run.broke10k);
  }
  drawSpeedLines(run);
  for (const p of G8.parts) {
    const a = 1 - p.t / p.life, x = sx(p.x), y = sy(p.alt);
    if (p.kind === 'puff') { ctx.globalAlpha = a * 0.8; px(ctx, p.color, x - 2, y - 2, 5, 4); ctx.globalAlpha = 1; }
    else if (p.kind === 'confetti') px(ctx, ['#7be08a', '#ffe066', '#ff7ab0', '#7fe3ff'][(p.x | 0) % 4], x, y, 2, 2);
    else if (p.kind === 'ghost') { ctx.globalAlpha = a * 0.6; drawRock(ctx, 0, x, y, 0); drawText(ctx, 'ETC', x - 8, y - 14, '#7be08a'); ctx.globalAlpha = 1; }
    else px(ctx, p.color, x, y, 2, 2);
  }
  if (run && (G8.screen === 'fly' || G8.screen === 'results')) drawRockAndRC(run);
  for (const tx of G8.texts) {
    const y = sy(tx.alt) - tx.t * 24;
    ctx.globalAlpha = Math.min(1, 2.2 - tx.t * 1.6);
    drawTextOutlined(ctx, tx.text, sx(tx.x), y, tx.color, 1);
    ctx.globalAlpha = 1;
  }
  drawBubble();
}
function drawSpeedLines(run) {
  if (!run || G8.screen !== 'fly' || run.vx < 460) return;
  const k = Math.min(1, (run.vx - 460) / 400);
  ctx.globalAlpha = 0.25 + k * 0.35;
  for (let i = 0; i < 6 + k * 10; i++) {
    const y = (hash(i, 77) * H) | 0, len = 20 + hash(i, 78) * 50;
    const x = ((hash(i, 79) * W * 2 - G8.time * (600 + i * 40)) % (W + len) + W + len) % (W + len) - len;
    px(ctx, '#ffffff', x, y, len, 1);
  }
  ctx.globalAlpha = 1;
}
function drawPriceGrid() {
  for (let p = 2000; p <= 12000; p += 1000) {
    const alt = (p - 1000) / 6.45, y = sy(alt);
    if (y < 10 || y > sy(0) - 6) continue;
    ctx.globalAlpha = 0.18; px(ctx, '#ffffff', 0, y, W, 1); ctx.globalAlpha = 0.5;
    drawText(ctx, '$' + (p / 1000) + 'K', 3, y - 8, '#ffffff');
    ctx.globalAlpha = 1;
  }
}
function drawResistance(alt, label, broken) {
  const y = sy(alt);
  if (y < -10 || y > H + 10) return;
  const c = broken ? '#7be08a' : '#ff5a6a';
  for (let x = -((G8.camX | 0) % 12 + 12) % 12; x < W; x += 12) px(ctx, c, x, y, 7, 2);
  drawTextOutlined(ctx, label + (broken ? ' SUPPORT' : ' RESISTANCE'), W - 110, y - 10, c, 1);
}

function drawDock() {
  const x0 = sx(DOCK_START - 14), x1 = sx(DOCK_END + 8), y = sy(22);
  // planks, posts, the foul line at the end
  px(ctx, '#6a4422', x0, y, x1 - x0, 5); px(ctx, '#8a5a30', x0, y, x1 - x0, 1);
  for (let x = DOCK_START - 6; x < DOCK_END; x += 18) px(ctx, '#5a3a1a', sx(x), y + 1, 1, 3);
  for (let x = DOCK_START; x <= DOCK_END; x += 46) px(ctx, '#4a2e16', sx(x), y + 5, 4, sy(0) - y + 8);
  px(ctx, '#ffe066', sx(DOCK_END - 16), y - 1, 16, 2);
  px(ctx, '#ffffff', sx(DOCK_END) - 1, y - 1, 2, 2);
  // a little sign at the start
  px(ctx, '#5a3a1a', sx(DOCK_START - 6), y - 22, 2, 22);
  px(ctx, '#fdf6e0', sx(DOCK_START - 26), y - 34, 44, 13); px(ctx, '#22163a', sx(DOCK_START - 26), y - 21, 44, 1);
  drawText(ctx, 'NO SWIM', sx(DOCK_START - 24), y - 31, '#e5487f');
  const ru = G8.ru;
  if (G8.screen === 'title') { drawFrameAt(ctx, 'wave', sx(DOCK_END - 20), y, 1); drawRC(sx(DOCK_END - 34), sy(88 + Math.sin(G8.time * 3) * 3), 'rcFront'); return; }
  if (!ru) { drawFrameAt(ctx, 'wave', sx(DOCK_END - 20), y, 1); return; }
  drawDroober(ru, y);
  if (G8.screen === 'runup') drawRC(sx(G8.rc.x), sy(G8.rc.alt), 'rcFront');
}
function drawDroober(ru, dockY) {
  const x = sx(ru.x);
  if (ru.phase === 'fell') {
    const t = ru.fellT;
    if (t < 0.4) drawFrameAt(ctx, 'jump', x + t * 70, dockY + t * t * 300 - t * 60, 1);
    else {
      // bobbing in the lake
      const hx = sx(DOCK_END + 26), hy = sy(0);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy + 1); ctx.clip();
      drawFrameAt(ctx, 'front', hx, hy + 30 + Math.sin(t * 8) * 2, 0);
      ctx.restore();
      drawText(ctx, 'BLUB', hx + 12, hy - 22 - (t * 10 % 6), '#d8f4ff');
    }
    return;
  }
  if (ru.phase === 'ready') {
    drawFrameAt(ctx, 'front', x, dockY + Math.round(Math.sin(G8.time * 3)), 0);
    drawRock(ctx, save.rock, x + 12, dockY - 18, 0);
    return;
  }
  if (ru.phase === 'thrown') { drawFrameAt(ctx, ru.v > 20 ? 'run' : 'wave', x, dockY, 1); return; }
  const bob = ru.phase === 'run' ? Math.round(Math.abs(Math.sin(ru.stepT * Math.PI)) * -3) : 0;
  drawFrameAt(ctx, ru.phase === 'windup' ? 'jump' : 'run', x, dockY + bob, 1);
  // the rock, held up and back as the arm rises
  const a = ru.angle * Math.PI / 180;
  const rx = ru.phase === 'windup' ? x - 4 - Math.cos(a) * 6 : x + 10, ry = ru.phase === 'windup' ? dockY - 30 - Math.sin(a) * 10 : dockY - 18 + bob;
  drawRock(ctx, save.rock, rx, ry, 0);
  if (ru.phase === 'windup') drawAimGuide(ru);
}
function drawRC(x, y, frame = 'rcSide') {
  const r = SPRITE_RECTS[frame];
  if (SPRITES && SPRITES.complete && r) ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3] / 2), r[2], r[3]);
}
function drawAimGuide(ru) {
  const s = SIM.stats(save.up), p = Math.max(0.2, ruPower(ru)), rad = ru.angle * Math.PI / 180;
  let x = ru.x + 8, alt = 40, vx = Math.cos(rad) * s.throwMax * p, vy = Math.sin(rad) * s.throwMax * p;
  for (let i = 0; i < 40; i++) {
    for (let k = 0; k < 4; k++) { x += vx / 120; alt += vy / 120; vy -= SIM.G / 120; }
    if (alt < 0) break;
    if (i % 2 === 0) px(ctx, i < 6 ? '#ffe066' : '#ffffff', sx(x), sy(alt), 2, 2);
  }
  drawTextOutlined(ctx, Math.round(ru.angle) + ' DEG', sx(ru.x), sy(98), ru.angle > 35 ? '#ff9f6b' : '#ffffff', 1);
}

function drawRockAndRC(run) {
  const x = sx(run.x), y = sy(run.alt) - 4;
  if (run.phase === 'fly') {
    const hot = run.streak >= 5;
    ctx.globalAlpha = hot ? 0.8 : 0.35;
    const n = hot ? 8 : 4;
    for (let i = 1; i <= n; i++) px(ctx, hot ? (i % 2 ? '#ffe066' : '#ff9f3a') : '#ffffff', x - i * 5, y + Math.round(run.vy / 120 * i * 1.5), hot ? 3 : 2, hot ? 3 : 2);
    ctx.globalAlpha = 1;
    if (run.vy < 0 && run.alt < 90 && !SIM.onIce(run.x)) {
      const tt = run.alt / Math.max(1, -run.vy);
      const cx = sx(run.x + run.vx * tt), cy = sy(0);
      const r = Math.round(3 + tt * 60);
      const steep = Math.atan2(-run.vy, run.vx) * 180 / Math.PI > 48;
      const col = steep ? '#ff5a6a' : tt <= run.s.window ? '#ffe066' : '#ffffff';
      ctx.globalAlpha = 0.8;
      px(ctx, col, cx - r, cy, r * 2, 1); px(ctx, col, cx - 1, cy - 1, 3, 3);
      ctx.globalAlpha = 1;
      if (steep) drawText(ctx, 'STEEP', cx - 14, cy + 6, '#ff5a6a');
    }
  }
  if (run.phase !== 'done') {
    if (run.phase === 'sink') ctx.globalAlpha = Math.max(0, 1 - run.sinkT);
    drawRock(ctx, save.rock, x, y, run.spin);
    ctx.globalAlpha = 1;
  }
  drawRC(sx(G8.rc.x), sy(G8.rc.alt), run.rcT > 0 ? 'rcFront' : 'rcSide');
  if (y < -4) drawText(ctx, '^', x - 2, 22, '#ffe066');
}
function drawBubble() {
  const b = G8.bubble;
  if (!b || G8.screen === 'title' || G8.screen === 'shop') return;
  const w = textWidth(b.text) + 8;
  let x = sx(G8.rc.x), y = sy(G8.rc.alt) - 14;
  x = Math.max(4, Math.min(W - w - 4, x - w / 2)); y = Math.max(34, y - 12);
  px(ctx, '#22163a', x - 1, y - 1, w + 2, 13); px(ctx, '#ffffff', x, y, w, 11);
  drawText(ctx, b.text, x + 4, y + 2, '#22163a');
}

function fmtPrice(p) { return '$' + Math.round(p).toLocaleString('en-US'); }

// ---------- draw: HUD ----------
function drawHUD() {
  const run = G8.run;
  if (!run) return;
  const day = Math.floor(SIM.dayAt(run.x));
  px(ctx, 'rgba(20,12,40,0.55)', 0, 0, W, 20);
  drawText(ctx, SIM.dateAt(run.x), 6, 3, '#fff');
  drawText(ctx, 'DAY ' + day, 6, 11, '#b8a8e8');
  const price = SIM.priceAt(run.alt), up = run.vy >= 0;
  const ptxt = 'ETH ' + fmtPrice(price), pw = textWidth(ptxt, 2);
  drawText(ctx, ptxt, W / 2 - 30 - pw / 2, 4, up ? '#7be08a' : '#ff6b6b', 2);
  drawText(ctx, up ? '^' : 'V', W / 2 - 24 + pw / 2, 7, up ? '#7be08a' : '#ff6b6b');
  blit(ctx, GEM(), W / 2 + 40, 6);
  drawText(ctx, String(run.gems), W / 2 + 50, 7, '#d6c2ff');
  drawMiniChart(run.candles, W - 110, 3, 84, 14);
  if (G8.screen === 'fly') {
    drawText(ctx, 'II', W - 16, 7, '#fff');
    const by = H - 12;
    if (!G8.touch) {
      drawText(ctx, 'X FART', 6, by, run.farts ? '#9ff07a' : '#666');
      for (let i = 0; i < run.farts; i++) blit(ctx, BANANA(), 44 + i * 10, by - 1);
      drawText(ctx, 'C RC', 6, by - 10, run.rc ? '#7fe3ff' : '#666');
      for (let i = 0; i < run.rc; i++) px(ctx, '#7fe3ff', 34 + i * 7, by - 9, 5, 5);
    }
    if (run.streak >= 2) drawTextOutlined(ctx, run.streak + 'X STREAK', W / 2, 44, run.streak >= 5 ? '#ff9f3a' : '#ffe066', 1);
    if (save.runs < 3 && G8.hintT < 12) {
      const tip = G8.hintT < 4 ? (G8.touch ? 'TAP AS THE ROCK HITS THE WATER' : 'TAP SPACE AS THE ROCK HITS THE WATER')
        : G8.hintT < 8 ? (G8.touch ? 'HOLD UP OR DOWN TO TILT' : 'UP AND DOWN TILT THE ROCK')
        : (G8.touch ? 'FART AND RC BUTTONS FOR BOOSTS' : 'X TO FART. C TO CALL RC');
      drawTextOutlined(ctx, tip, W / 2, 104, '#fff', 1);
    }
  }
  drawNews();
  if (G8.banner) {
    // slides down, holds, slides back up (no alpha: stacked outlines smear when faded)
    const b = G8.banner, k = Math.min(1, b.t * 4, (3 - b.t) * 4);
    const y = Math.round(-40 + 102 * (1 - Math.pow(1 - Math.max(0, k), 3)));
    drawTextOutlined(ctx, b.title, W / 2, y, '#ffe066', 3);
    drawTextOutlined(ctx, b.sub, W / 2, y + 26, '#ffffff', 1);
  }
}
function drawNews() {
  const n = G8.news;
  if (!n) return;
  const k = Math.min(1, n.t * 5, (4 - n.t) * 5);
  const y = 20 + Math.round(-12 * (1 - Math.max(0, k)));
  px(ctx, '#22163a', 0, y, W, 11);
  px(ctx, '#e5487f', 0, y, 58, 11);
  drawText(ctx, 'BREAKING', 5, y + 2, '#fff');
  const [yy, mm] = n.date.split('-');
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+mm - 1];
  drawText(ctx, mon + ' ' + yy, 64, y + 2, '#ffe066');
  drawText(ctx, n.text, 120, y + 2, '#ffffff');
}
function drawMiniChart(cs0, x, y, w, h) {
  const cs = cs0.slice(-Math.floor(w / 3));
  if (!cs.length) return;
  let lo = 1000, hi = 5200;
  for (const c of cs) hi = Math.max(hi, c.h);
  const Y = p => y + h - Math.round((p - lo) / (hi - lo) * h);
  px(ctx, '#ff5a6a', x, Y(4953), w, 1);
  cs.forEach((c, i) => {
    const col = c.c >= c.o ? '#7be08a' : '#ff6b6b';
    const cx = x + i * 3;
    px(ctx, col, cx + 1, Y(c.h), 1, Math.max(1, Y(c.l) - Y(c.h)));
    const t = Math.min(Y(c.o), Y(c.c)), b = Math.max(Y(c.o), Y(c.c));
    px(ctx, col, cx, t, 2, Math.max(1, b - t));
  });
}
// the whole run as one chart, squeezed to fit
function drawRunChart(cs, x, y, w, h) {
  px(ctx, '#22163a', x - 1, y - 1, w + 2, h + 2); px(ctx, '#1a1236', x, y, w, h);
  if (!cs.length) return;
  const per = Math.max(1, Math.ceil(cs.length / Math.floor(w / 3)));
  const merged = [];
  for (let i = 0; i < cs.length; i += per) {
    const g = cs.slice(i, i + per);
    merged.push({ o: g[0].o, c: g[g.length - 1].c, h: Math.max(...g.map(c => c.h)), l: Math.min(...g.map(c => c.l)) });
  }
  let lo = 1000, hi = 5400;
  for (const c of merged) hi = Math.max(hi, c.h * 1.05);
  const Y = p => y + h - 2 - Math.round((p - lo) / (hi - lo) * (h - 4));
  for (let p = 2000; p < hi; p += 1000) { ctx.globalAlpha = 0.15; px(ctx, '#fff', x, Y(p), w, 1); ctx.globalAlpha = 1; }
  for (let i = 0; i < w; i += 4) px(ctx, '#ff5a6a', x + i, Y(4953), 2, 1);
  if (hi > 10000) for (let i = 0; i < w; i += 4) px(ctx, '#7be08a', x + i, Y(10000), 2, 1);
  const step = Math.max(1, Math.min(6, Math.floor((w - 4) / merged.length)));
  merged.forEach((c, i) => {
    const col = c.c >= c.o ? '#7be08a' : '#ff6b6b', cx = x + 2 + i * step;
    px(ctx, col, cx + Math.floor(step / 2) - 1, Y(c.h), 1, Math.max(1, Y(c.l) - Y(c.h)));
    const t = Math.min(Y(c.o), Y(c.c)), b = Math.max(Y(c.o), Y(c.c));
    px(ctx, col, cx, t, Math.max(1, step - 1), Math.max(1, b - t));
  });
  drawText(ctx, 'ATH', x + w - 20, Y(4953) - 9, '#ff5a6a');
}

function drawTouchButtons() {
  if (!G8.touch || G8.screen !== 'fly') return;
  const run = G8.run;
  const held = new Set([...pointers.values()].map(q => q.btn));
  const lab = { up: '^', down: 'V', fart: 'FART ' + run.farts, rc: 'RC ' + run.rc, skip: 'SKIP' };
  const col = { up: '#7b55c6', down: '#7b55c6', fart: '#3fa86a', rc: '#1cb6d8', skip: '#e5487f' };
  for (const k in TOUCH_BTNS) {
    const [x, y, w, h] = TOUCH_BTNS[k];
    ctx.globalAlpha = held.has(k) ? 0.75 : 0.42;
    px(ctx, '#22163a', x, y + 2, w, h); px(ctx, col[k], x, y, w, h - 2);
    ctx.globalAlpha = 1;
    const big = k === 'skip' || k === 'up' || k === 'down';
    drawTextC(ctx, lab[k], x + w / 2, y + h / 2 - (big ? 7 : 4), '#fff', big ? 2 : 1);
  }
}

function panel(x, y, w, h) {
  px(ctx, '#22163a', x - 2, y - 2, w + 4, h + 4);
  px(ctx, '#fdf6e0', x, y, w, h);
  px(ctx, '#e8dcc0', x, y + h - 3, w, 3);
}

// ---------- screens ----------
function drawTitle() {
  drawWorld();
  ctx.globalAlpha = 0.35; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const bob = Math.round(Math.sin(G8.time * 2) * 2);
  drawTextOutlined(ctx, 'SKIP TO 10K', W / 2, 30 + bob, '#ffe066', 5);
  drawTextOutlined(ctx, 'A DROOBER AND RC ROCK SKIPPING SAGA', W / 2, 76, '#fff', 1);
  const lore = ['IN 2017 SOMEBODY MADE 100 ROCKS.', 'THEY DO NOTHING. THAT IS THE POINT.', 'DROOBER FOUND ONE BY THE LAKE.', 'HOW FAR CAN A ROCK GO?'];
  lore.forEach((l, i) => { if (G8.time * 1.2 > i * 0.8) drawTextOutlined(ctx, l, W / 2, 100 + i * 12, '#d6c2ff', 1); });
  if ((G8.time * 2 | 0) % 2 === 0) drawTextOutlined(ctx, G8.touch ? 'TAP TO START' : 'PRESS SPACE OR CLICK', W / 2, 160, '#fff', 1);
  if (save.best.days) drawTextOutlined(ctx, 'BEST DAY ' + save.best.days + '   PEAK ' + fmtPrice(save.best.peak) + '   RANK ' + META.RANKS[META.rankOf(save.missions.length)], W / 2, 174, '#ffe066', 1);
  drawText(ctx, 'M MUTE  N MUSIC', 6, H - 10, '#b8a8e8');
  drawText(ctx, 'BY DROOBER', W - 66, H - 10, '#b8a8e8');
}

function drawRunup() {
  drawWorld();
  const ru = G8.ru;
  px(ctx, 'rgba(20,12,40,0.55)', 0, 0, W, 30);
  drawText(ctx, 'ROCK #' + save.rock, 6, 3, '#fff');
  drawText(ctx, 'GWEI ' + save.gwei, 6, 11, '#d6c2ff');
  if (ru.phase === 'ready') { px(ctx, '#3a2c63', ...SHOP_BTN); drawTextC(ctx, 'SHOP', SHOP_BTN[0] + 25, 7, '#fff'); }
  const ms = META.active(save);
  drawText(ctx, 'MISSIONS', 92, 3, '#ffe066');
  ms.forEach((m, i) => drawText(ctx, m.text, 148, 3 + i * 8, '#fff'));
  // speed meter above Droober
  if (ru.phase === 'run' || ru.phase === 'windup') {
    const p = Math.min(1, ru.v / RUN_VMAX), bx = sx(ru.x) - 30, by = sy(78);
    px(ctx, '#22163a', bx - 1, by - 1, 62, 8); px(ctx, '#3a2c63', bx, by, 60, 6);
    px(ctx, p > 0.85 ? '#ffe066' : p > 0.55 ? '#7be08a' : '#7fe3ff', bx, by, Math.round(60 * p), 6);
    const tier = p > 0.9 ? 'SEND IT' : p > 0.7 ? 'SPRINT' : p > 0.4 ? 'RUN' : 'JOG';
    drawTextOutlined(ctx, tier, sx(ru.x), by - 11, '#fff', 1);
  }
  let tip = '';
  if (ru.phase === 'ready') tip = G8.touch ? 'TAP TAP TAP TO RUN. HOLD TO AIM. LET GO TO THROW' : 'MASH SPACE TO RUN. HOLD TO AIM. LET GO TO THROW';
  else if (ru.phase === 'run' && ru.taps < 6) tip = 'FASTER!';
  else if (ru.phase === 'run' && DOCK_END - ru.x < 90) tip = 'HOLD TO AIM!';
  else if (ru.phase === 'windup') tip = 'LET GO TO THROW. NEAR THE EDGE IS BEST';
  if (tip) drawTextOutlined(ctx, tip, W / 2, 46, '#fff', 1);
  if (ru.phase === 'ready') drawTextOutlined(ctx, 'FLAT THROWS SKIP. STEEP ONES SPLASH.', W / 2, 58, '#d6c2ff', 1);
  if (ru.phase === 'fell') drawTextOutlined(ctx, 'THE DOCK ENDS. TRY AGAIN', W / 2, 62, '#ffe066', 2);
}

const RES_PANEL = [24, 24, 432, 222];
const RES_AGAIN = [RES_PANEL[0] + 16, RES_PANEL[1] + RES_PANEL[3] - 26, 130, 18];
function drawResults() {
  drawWorld(); drawHUD();
  const r = G8.res;
  ctx.globalAlpha = 0.45; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const [x, y, w, h] = RES_PANEL;
  panel(x, y, w, h);
  drawText(ctx, 'ROCK #' + save.rock + (r.reason === 'FROZE' ? ' FROZE' : ' SANK'), x + 12, y + 8, '#22163a', 2);
  drawText(ctx, r.date + '  .  ' + r.era, x + 12, y + 26, '#7a4a8a');
  const rows = [
    ['DAYS', String(r.days) + (r.newBest ? '  NEW BEST' : '')],
    ['PEAK', fmtPrice(r.peak)], ['AVG PRICE', fmtPrice(r.vwap)],
    ['SKIPS', r.skips + '  (' + r.perfects + ' PERFECT)'], ['BEST STREAK', r.bestStreak + 'X'],
    ['GEMS', String(r.gems)], ['GWEI', '+' + r.earned + (r.mult > 1 ? '  (X' + r.mult.toFixed(2) + ')' : '')],
  ];
  rows.forEach(([a, b], i) => { drawText(ctx, a, x + 12, y + 42 + i * 11, '#5a4a7a'); drawText(ctx, b, x + 86, y + 42 + i * 11, i === 6 ? '#3fa86a' : '#22163a'); });
  drawText(ctx, 'YOUR CHART', x + 232, y + 30, '#7a4a8a');
  drawRunChart(r.candles, x + 232, y + 40, 186, 74);
  let my = y + 126;
  if (r.done.length) {
    r.done.forEach(m => { drawText(ctx, '* ' + m.text, x + 12, my, '#e0a020'); drawText(ctx, '+' + m.reward, x + w - 50, my, '#3fa86a'); my += 10; });
    if (r.rankUp) { drawText(ctx, 'RANK UP: ' + r.rankUp, x + 12, my, '#e5487f'); my += 10; }
  } else {
    drawText(ctx, 'MISSIONS', x + 12, my, '#7a4a8a'); my += 10;
    META.active(save).forEach(m => { drawText(ctx, '- ' + m.text, x + 12, my, '#8a7aa8'); my += 9; });
  }
  drawTextC(ctx, '"' + r.quip + '"', x + w / 2 - 20, y + h - 46, '#e5487f');
  drawFrameAt(ctx, 'wave', x + w - 30, y + h - 4, 0);
  drawRC(x + w - 58, y + h - 30 + Math.sin(G8.time * 4) * 2, 'rcFront');
  px(ctx, '#e5487f', ...RES_AGAIN); drawTextC(ctx, G8.touch ? 'AGAIN' : 'R  AGAIN', RES_AGAIN[0] + 65, RES_AGAIN[1] + 6, '#fff');
  px(ctx, '#3a2c63', RES_AGAIN[0] + 140, RES_AGAIN[1], 130, 18); drawTextC(ctx, G8.touch ? 'SHOP' : 'SPACE  SHOP', RES_AGAIN[0] + 205, RES_AGAIN[1] + 6, '#fff');
}

// ---------- shop ----------
const TABS = ['UPGRADES', 'ROCKS', 'MISSIONS'];
const SHOP = { x: 50, y: 18, w: 380, h: 228, rowH: 21 };
let shopFlash = 0;
function buy(i) {
  const u = SIM.UPGRADES[i], lvl = save.up[u.id] || 0;
  if (lvl >= SIM.MAX_LVL) { Audio8.sfx('nope'); return; }
  const c = SIM.upgradeCost(u, lvl);
  if (save.gwei < c) { Audio8.sfx('nope'); shopFlash = 0.4; return; }
  save.gwei -= c; save.up[u.id] = lvl + 1; persist();
  Audio8.sfx('buy');
}
function buyRockNow() {
  const k = META.buyRock(save);
  if (k === null) { Audio8.sfx('nope'); shopFlash = 0.4; return; }
  save.rock = k; G8.rockSel = save.rocks.length - 1; persist();
  Audio8.sfx('buy');
}
function pickRock(i) { G8.rockSel = i; save.rock = save.rocks[i]; persist(); Audio8.sfx('menu'); }
function shopKey(code) {
  const n = SIM.UPGRADES.length;
  if (code === 'KeyQ' || code === 'Tab' || (code === 'ArrowLeft' && G8.shopTab !== 1)) { G8.shopTab = (G8.shopTab + 2) % 3; Audio8.sfx('menu'); return; }
  if (code === 'KeyE' || (code === 'ArrowRight' && G8.shopTab !== 1)) { G8.shopTab = (G8.shopTab + 1) % 3; Audio8.sfx('menu'); return; }
  if (code === 'KeyT') return toRunup();
  if (G8.shopTab === 0) {
    if (code === 'ArrowUp' || code === 'KeyW') { G8.shopSel = (G8.shopSel + n) % (n + 1); Audio8.sfx('menu'); }
    if (code === 'ArrowDown' || code === 'KeyS') { G8.shopSel = (G8.shopSel + 1) % (n + 1); Audio8.sfx('menu'); }
    if (code === 'Enter' || code === 'KeyB' || code === 'Space') { if (G8.shopSel === n) toRunup(); else buy(G8.shopSel); }
  } else if (G8.shopTab === 1) {
    const L = save.rocks.length;
    if (code === 'ArrowLeft') pickRock((G8.rockSel + L - 1) % L);
    if (code === 'ArrowRight') pickRock((G8.rockSel + 1) % L);
    if (code === 'KeyB' || code === 'Enter') buyRockNow();
    if (code === 'Space') toRunup();
  } else if (ACTION_KEYS.includes(code)) toRunup();
}
const THROW_BTN = [SHOP.x + 8, SHOP.y + SHOP.h - 26, SHOP.w - 16, 18];
const rockCell = i => [SHOP.x + 150 + (i % 11) * 20, SHOP.y + 54 + Math.floor(i / 11) * 15];
const ROCK_BUY_BTN = [SHOP.x + 12, SHOP.y + 150, 124, 18];
function shopClick(p) {
  const { x, y, w, rowH } = SHOP;
  for (let i = 0; i < 3; i++) if (hitRect(p, [x + 8 + i * 90, y + 6, 86, 14])) { G8.shopTab = i; Audio8.sfx('menu'); return; }
  if (hitRect(p, THROW_BTN)) return toRunup();
  if (G8.shopTab === 0) {
    SIM.UPGRADES.forEach((u, i) => { if (hitRect(p, [x + 4, y + 30 + i * rowH - 3, w - 8, rowH - 2])) { G8.shopSel = i; buy(i); } });
  } else if (G8.shopTab === 1) {
    if (hitRect(p, ROCK_BUY_BTN)) return buyRockNow();
    save.rocks.forEach((k, i) => { const [cx, cy] = rockCell(i); if (hitRect(p, [cx, cy, 18, 14])) pickRock(i); });
  }
}
function drawShop() {
  G8.camX = DOCK_START - 30; G8.camAlt = 0;
  drawWorld();
  ctx.globalAlpha = 0.45; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const { x, y, w, h, rowH } = SHOP;
  panel(x, y, w, h);
  TABS.forEach((t, i) => {
    const on = G8.shopTab === i;
    px(ctx, on ? '#7b55c6' : '#e8dcc0', x + 8 + i * 90, y + 6, 86, 14);
    drawTextC(ctx, t, x + 8 + i * 90 + 43, y + 10, on ? '#fff' : '#7a4a8a');
  });
  blit(ctx, GEM(), x + w - 92, y + 9);
  drawText(ctx, 'GWEI ' + save.gwei, x + w - 82, y + 10, shopFlash > 0 ? '#e5487f' : '#7a4a8a');
  if (G8.shopTab === 0) {
    SIM.UPGRADES.forEach((u, i) => {
      const ry = y + 30 + i * rowH, lvl = save.up[u.id] || 0, sel = G8.shopSel === i;
      if (sel) px(ctx, '#f0e4ff', x + 4, ry - 3, w - 8, rowH - 2);
      drawText(ctx, u.name, x + 10, ry, '#22163a');
      for (let k = 0; k < SIM.MAX_LVL; k++) px(ctx, k < lvl ? '#7b55c6' : '#d8cce8', x + 110 + k * 9, ry, 7, 7);
      const cost = SIM.upgradeCost(u, lvl);
      drawText(ctx, lvl >= SIM.MAX_LVL ? 'MAX' : cost + ' GWEI', x + 165, ry, lvl >= SIM.MAX_LVL ? '#3fa86a' : save.gwei >= cost ? '#22163a' : '#b0a0c0');
      drawText(ctx, u.desc, x + 165, ry + 8, '#8a7aa8');
    });
  } else if (G8.shopTab === 1) {
    drawText(ctx, 'THE ROCK GARDEN', x + 12, y + 30, '#22163a');
    drawText(ctx, save.rocks.length + ' OF 100 ROCKS', x + 150, y + 30, '#7a4a8a');
    drawText(ctx, '+2% GWEI PER EXTRA ROCK', x + 150, y + 40, '#8a7aa8');
    ctx.save(); ctx.translate(x + 72, y + 86); ctx.scale(3, 3); drawRock(ctx, save.rock, 0, 0, 0); ctx.restore();
    drawTextC(ctx, 'ROCK #' + save.rock, x + 72, y + 112, '#22163a');
    drawTextC(ctx, 'IT DOES NOTHING', x + 72, y + 122, '#8a7aa8');
    save.rocks.forEach((k, i) => {
      const [cx, cy] = rockCell(i);
      if (k === save.rock) px(ctx, '#7b55c6', cx - 1, cy - 1, 20, 16);
      drawRock(ctx, k, cx + 9, cy + 7, 0);
    });
    const price = META.rockPrice(save.rocks.length);
    const can = save.gwei >= price && save.rocks.length < 100;
    px(ctx, can ? '#e5487f' : '#c0b4d0', ...ROCK_BUY_BTN);
    drawTextC(ctx, 'BUY A ROCK ' + price, ROCK_BUY_BTN[0] + 62, ROCK_BUY_BTN[1] + 6, '#fff');
    drawText(ctx, 'EACH ROCK COSTS MORE', x + 12, y + 174, '#8a7aa8');
    drawText(ctx, 'THAN THE LAST ONE.', x + 12, y + 183, '#8a7aa8');
  } else {
    const done = save.missions.length, rank = META.rankOf(done);
    drawText(ctx, 'RANK: ' + META.RANKS[rank], x + 12, y + 30, '#22163a', 2);
    drawText(ctx, done + ' OF ' + META.MISSIONS.length + ' MISSIONS.  +' + Math.round((META.multiplier(save) - 1) * 100) + '% GWEI', x + 12, y + 48, '#7a4a8a');
    if (rank < META.RANKS.length - 1) drawText(ctx, 'NEXT RANK: ' + META.RANKS[rank + 1] + ' IN ' + (3 - done % 3) + ' MISSIONS', x + 12, y + 58, '#8a7aa8');
    META.active(save).forEach((m, i) => {
      const ry = y + 76 + i * 22;
      px(ctx, '#f0e4ff', x + 8, ry - 4, w - 16, 18);
      drawText(ctx, m.text, x + 14, ry + 2, '#22163a');
      drawText(ctx, '+' + m.reward + ' GWEI', x + w - 76, ry + 2, '#3fa86a');
    });
    const tro = [['BROKE 5K', save.flags.broke5k], ['BROKE 10K', save.flags.broke10k], ['REACHED TODAY', save.flags.today], ['FOREVER', save.flags.forever]];
    drawText(ctx, 'TROPHIES', x + 12, y + 148, '#7a4a8a');
    tro.forEach(([name, got], i) => drawText(ctx, (got ? '* ' : '- ') + name, x + 12 + (i % 2) * 150, y + 160 + Math.floor(i / 2) * 10, got ? '#e0a020' : '#c0b4d0'));
    drawText(ctx, 'BEST DAY ' + save.best.days + '   BEST PEAK ' + fmtPrice(save.best.peak) + '   RUNS ' + save.runs, x + 12, y + 186, '#8a7aa8');
  }
  px(ctx, '#e5487f', ...THROW_BTN);
  drawTextC(ctx, 'THROW A ROCK', THROW_BTN[0] + THROW_BTN[2] / 2, THROW_BTN[1] + 6, '#fff');
  const help = G8.touch ? 'TAP A TAB. TAP TO BUY' : G8.shopTab === 1 ? 'LEFT RIGHT PICK ROCK. B BUYS. Q E TABS. T THROWS'
    : 'UP DOWN PICK. ENTER BUYS. Q E TABS. T THROWS';
  drawTextC(ctx, help, W / 2, H - 12, '#fff');
}

function drawPause() {
  ctx.globalAlpha = 0.5; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  drawTextOutlined(ctx, 'PAUSED', W / 2, 100, '#ffe066', 3);
  drawTextOutlined(ctx, 'ESC OR TAP TO RESUME', W / 2, 130, '#fff', 1);
}

function draw() {
  ctx.save();
  if (G8.shake > 0) ctx.translate((Math.random() - 0.5) * G8.shake, (Math.random() - 0.5) * G8.shake);
  switch (G8.screen) {
    case 'title': drawTitle(); break;
    case 'runup': drawRunup(); break;
    case 'fly': drawWorld(); drawHUD(); drawTouchButtons(); if (G8.paused) drawPause(); break;
    case 'results': drawResults(); break;
    case 'shop': drawShop(); break;
  }
  ctx.restore();
}

// ---------- demo ----------
// ?demo=<day>[&alt=<alt>]: a bot throws and plays from that day. &screen=shop|rocks|missions|runup|results, &touch
const DEMO = (() => { try { const q = new URLSearchParams(location.search); return q.has('demo') ? { day: +q.get('demo') || 0, alt: +q.get('alt') || 0, screen: q.get('screen'), touch: q.has('touch') } : null; } catch { return null; } })();
function demoStart() {
  if (DEMO.touch) G8.touch = true;
  if (['shop', 'rocks', 'missions'].includes(DEMO.screen)) {
    save.gwei = 1234; save.up = { arm: 3, rock: 2, hands: 1, farts: 4 }; save.rocks = [7, 42, 3, 88, 15, 61]; save.rock = 42; save.missions = [0, 1, 2, 3, 5];
    toShop(); G8.shopTab = ['shop', 'rocks', 'missions'].indexOf(DEMO.screen); return;
  }
  toRunup();
  if (DEMO.screen === 'runup') { const ru = G8.ru; ru.phase = 'windup'; ru.x = -40; ru.v = 190; ru.down = true; ru.downT = -0.5; G8.camX = ru.x - 170; return; }
  G8.ru.angle = 14; G8.ru.v = RUN_VMAX; G8.ru.x = 20; ruThrow();
  const run = G8.run;
  run.x = DEMO.day * SIM.PX_PER_DAY; run.vx = 520; run.alt = DEMO.alt || 60; run.vy = 120;
  G8.camX = run.x - 150; G8.camAlt = Math.max(0, run.alt - 105); G8.rc = { x: run.x - 20, alt: run.alt + 16 };
  G8.newsI = META.NEWS.findIndex(n => n.day > DEMO.day - 30); if (G8.newsI < 0) G8.newsI = META.NEWS.length;
  if (DEMO.screen === 'results') {
    run.phase = 'done';
    run.candles = Array.from({ length: 60 }, (_, i) => { const o = 1500 + Math.sin(i / 3) * 600 + i * 40; return { i, o, c: o + Math.sin(i) * 300, h: o + 500, l: o - 300 }; });
    finishRun(); G8.res.at = -9;
  }
}
function demoInput() { const b = SIM.botInput(G8.run); if (b.skip) edge.skip = true; if (b.fart) edge.fart = true; }

// ---------- boot ----------
function fit() {
  const s = Math.max(1, Math.min(innerWidth / W, innerHeight / H));
  const k = s >= 2 ? Math.floor(s) : s;
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
}
addEventListener('resize', fit); fit();
if (matchMedia('(pointer: coarse)').matches) G8.touch = true;
SPRITES = new Image();
SPRITES.src = 'assets/sprites.png';
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); draw();
  requestAnimationFrame(frame);
}
if (DEMO) demoStart();
requestAnimationFrame(frame);
