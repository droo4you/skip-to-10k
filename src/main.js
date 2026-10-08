// Skip to 10K: screens, input, camera, HUD, shop, save. The physics lives in sim.js.
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;

// ---------- save ----------
const SAVE_KEY = 'skip10k.v1';
function loadSave() {
  const fresh = { gwei: 0, up: {}, runs: 0, best: { days: 0, peak: 0 }, flags: {}, muted: false, music: true };
  try { return Object.assign(fresh, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch { return fresh; }
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
Audio8.muted = save.muted; Audio8.musicOn = save.music;

// ---------- state ----------
const G8 = {
  screen: 'title', time: 0, run: null, rockN: 0,
  camX: 0, camAlt: 0, shake: 0,
  aim: { angle: 12, power: 0, charging: false, chargeT: 0, drag: null },
  texts: [], parts: [], banner: null, res: null, shopSel: 0, paused: false,
  rc: { x: 40, alt: 70 }, touch: false, hintT: 0,
};
window.__game = G8;

// ---------- input ----------
const keys = new Set();
const edge = { skip: false, fart: false, rc: false };
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space'].includes(e.key) || e.code === 'Space') e.preventDefault();
  Audio8.init();
  if (e.repeat) return;
  keys.add(e.code);
  onKey(e.code);
});
addEventListener('keyup', e => { keys.delete(e.code); onKeyUp(e.code); });
addEventListener('blur', () => keys.clear());

const SKIP_KEYS = ['Space', 'Enter', 'KeyZ'];
function onKey(code) {
  if (code === 'KeyM') { save.muted = !save.muted; Audio8.setMuted(save.muted); persist(); return; }
  if (code === 'KeyN') { save.music = !save.music; Audio8.setMusic(save.music); persist(); return; }
  const s = G8.screen;
  if (s === 'title') { if (SKIP_KEYS.includes(code)) toAim(); return; }
  if (s === 'aim') {
    if (code === 'Space' || code === 'Enter') { G8.aim.charging = true; G8.aim.chargeT = 0; }
    if (code === 'Escape') toShop();
    return;
  }
  if (s === 'fly') {
    if (code === 'Escape' || code === 'KeyP') { G8.paused = !G8.paused; return; }
    if (G8.paused) return;
    if (SKIP_KEYS.includes(code)) edge.skip = true;
    if (code === 'KeyX' || code === 'ShiftLeft' || code === 'ShiftRight') edge.fart = true;
    if (code === 'KeyC' || code === 'KeyR') edge.rc = true;
    return;
  }
  if (s === 'results') { if (SKIP_KEYS.includes(code) || code === 'Escape') toShop(); return; }
  if (s === 'shop') {
    const n = SIM.UPGRADES.length;
    if (code === 'ArrowUp' || code === 'KeyW') { G8.shopSel = (G8.shopSel + n) % (n + 1); Audio8.sfx('menu'); }
    if (code === 'ArrowDown' || code === 'KeyS') { G8.shopSel = (G8.shopSel + 1) % (n + 1); Audio8.sfx('menu'); }
    if (code === 'Enter' || code === 'KeyB' || code === 'Space') { if (G8.shopSel === n) toAim(); else buy(G8.shopSel); }
    if (code === 'KeyT') toAim();
  }
}
function onKeyUp(code) {
  if (G8.screen === 'aim' && (code === 'Space' || code === 'Enter') && G8.aim.charging) doThrow(G8.aim.power);
}

// pointer: canvas coordinates
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
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); Audio8.init();
  if (e.pointerType === 'touch') G8.touch = true;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = canvasPt(e);
  const s = G8.screen;
  if (s === 'title') return toAim();
  if (s === 'results') return toShop();
  if (s === 'shop') return shopClick(p);
  if (s === 'aim') {
    if (hitRect(p, [W - 56, 6, 50, 16])) return toShop();
    G8.aim.drag = { x0: p.x, y0: p.y, x: p.x, y: p.y };
    return;
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
  const p = canvasPt(e);
  if (G8.screen === 'aim' && G8.aim.drag) { G8.aim.drag.x = p.x; G8.aim.drag.y = p.y; applyDrag(); }
  if (pointers.has(e.pointerId)) { const q = pointers.get(e.pointerId); q.x = p.x; q.y = p.y; if (q.btn === 'up' || q.btn === 'down') q.btn = btnAt(p) || q.btn; }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (G8.screen === 'aim' && G8.aim.drag) {
    const d = G8.aim.drag; G8.aim.drag = null;
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > 8) doThrow(G8.aim.power);
  }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', e => e.preventDefault());
const hitRect = (p, [x, y, w, h]) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;

// Slingshot drag (Monkey Flight style): pull back, the rock flies the other way.
const DRAG_MAX = 90;
function applyDrag() {
  const d = G8.aim.drag;
  const dx = d.x0 - d.x, dy = d.y - d.y0; // pull left+down = throw right+up
  const len = Math.min(DRAG_MAX, Math.hypot(dx, dy));
  if (len < 4) return;
  G8.aim.angle = Math.max(-5, Math.min(60, Math.atan2(dy, Math.max(1, dx)) * 180 / Math.PI));
  G8.aim.power = len / DRAG_MAX;
}

function tiltInput() {
  let t = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) t += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) t -= 1;
  for (const q of pointers.values()) { if (q.btn === 'up') t += 1; if (q.btn === 'down') t -= 1; }
  return Math.max(-1, Math.min(1, t));
}

// ---------- screen changes ----------
function toAim() {
  G8.screen = 'aim';
  G8.rockN = Math.floor(Math.random() * 100);
  G8.run = SIM.newRun(save.up, (Math.random() * 2 ** 31) >>> 0);
  G8.camX = 0; G8.camAlt = 0; G8.texts = []; G8.parts = []; G8.banner = null; G8.paused = false;
  G8.aim.charging = false; G8.aim.power = 0; G8.aim.drag = null;
  G8.rc = { x: 36, alt: 84 };
  edge.skip = edge.fart = edge.rc = false;
  Audio8.sfx('menu');
}
function doThrow(power) {
  G8.aim.charging = false;
  if (power < 0.08) return;
  SIM.throwRock(G8.run, G8.aim.angle, power);
  G8.screen = 'fly';
  G8.hintT = 0;
  showBanner(SIM.ERAS[0].name, SIM.ERAS[0].sub);
}
function toShop() { G8.screen = 'shop'; G8.shopSel = SIM.UPGRADES.length; Audio8.sfx('menu'); }
function finishRun() {
  const r = SIM.results(G8.run);
  save.runs++;
  save.gwei += r.earned;
  r.newBest = r.days > save.best.days;
  save.best.days = Math.max(save.best.days, r.days);
  save.best.peak = Math.max(save.best.peak, r.peak);
  if (r.broke5k) save.flags.broke5k = true;
  if (r.broke10k) save.flags.broke10k = true;
  if (r.days >= SIM.TODAY_DAY) save.flags.today = true;
  if (r.days >= SIM.ERAS[SIM.ERAS.length - 1].day) save.flags.forever = true;
  persist();
  r.quip = quipFor(r);
  G8.res = r; G8.screen = 'results';
}
function quipFor(r) {
  const pickQ = a => a[(r.days + r.skips) % a.length];
  if (r.days >= SIM.ERAS[SIM.ERAS.length - 1].day) return pickQ(['FOREVER. SEE YOU NEXT BLOCK.', 'THE WORLD COMPUTER NEVER SLEEPS.']);
  if (r.broke10k) return pickQ(['10K. SCREENSHOT IT. NOBODY WILL BELIEVE YOU.', 'TOLD YOU. 10K.']);
  if (r.broke5k) return pickQ(['NEW ATH. FOR A MINUTE.', 'PRICE DISCOVERY. THEN GRAVITY.']);
  if (r.reason === 'FROZE') return pickQ(['FROZEN SOLID. HODLING.', 'WINTER GOT ANOTHER ONE.']);
  if (r.peak >= 4600) return pickQ(['SO CLOSE TO THE ATH. AGAIN.', 'REJECTED AT 4.8K. CLASSIC.']);
  return pickQ(['SIDEWAYS AGAIN.', 'CHOP CHOP.', 'RANGE BOUND. AS USUAL.', 'NEXT CYCLE FOR SURE.',
    'ULTRA SOUND. ULTRA SIDEWAYS.', 'THE ROCK DOES NOTHING. AS PROMISED.', 'FEW UNDERSTAND.']);
}
function buy(i) {
  const u = SIM.UPGRADES[i], lvl = save.up[u.id] || 0;
  if (lvl >= SIM.MAX_LVL) { Audio8.sfx('nope'); return; }
  const c = SIM.upgradeCost(u, lvl);
  if (save.gwei < c) { Audio8.sfx('nope'); shopFlash = 0.4; return; }
  save.gwei -= c; save.up[u.id] = lvl + 1; persist();
  Audio8.sfx('buy');
}
let shopFlash = 0;

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
function handleEvents(run) {
  for (const ev of run.events) {
    const c = ev.color;
    switch (ev.type) {
      case 'throw': Audio8.sfx('throw'); break;
      case 'skip': Audio8.sfx(ev.text === 'PERFECT' ? 'perfect' : 'skip', run.streak); splash(ev.x, 5, false); break;
      case 'perfect': Audio8.sfx('perfect', run.streak); burst(ev.x, ev.alt + 4, 6, '#ffe066', 50); break;
      case 'splash': Audio8.sfx('splash'); splash(ev.x, 14, true); G8.shake = 4; break;
      case 'sink': Audio8.sfx('sink'); splash(ev.x, 16, true); break;
      case 'froze': Audio8.sfx('ice'); break;
      case 'gem': Audio8.sfx('gem'); burst(ev.x, ev.alt, 4, '#d6c2ff', 40); break;
      case 'banana': Audio8.sfx('banana'); break;
      case 'fart': Audio8.sfx('fart'); burst(ev.x - 6, ev.alt, 10, '#9ff07a', 50, 'puff'); break;
      case 'pump': Audio8.sfx('pump'); G8.shake = 3; break;
      case 'whale': Audio8.sfx('whale'); splash(ev.x, 18, true); break;
      case 'dump': Audio8.sfx('dump'); G8.shake = 5; break;
      case 'suit': Audio8.sfx('suit'); burst(ev.x, ev.alt, 8, '#7be08a', 70); break;
      case 'kevin': Audio8.sfx('kevin'); burst(ev.x, ev.alt, 12, '#ffb3e6', 90); break;
      case 'yacht': Audio8.sfx('yacht'); break;
      case 'skrump': Audio8.sfx('skrump'); burst(ev.x, ev.alt, 8, '#c89bff', 60); break;
      case 'bonk': Audio8.sfx('bonk'); G8.shake = 3; break;
      case 'fork': Audio8.sfx('fork'); G8.parts.push({ x: ev.x, alt: ev.alt, vx: 160, vy: -40, t: 0, life: 1.6, color: '#7be08a', kind: 'ghost' }); break;
      case 'bat': Audio8.sfx('bat'); break;
      case 'ice': Audio8.sfx('ice'); break;
      case 'rc': Audio8.sfx('rc'); break;
      case 'rejected': Audio8.sfx('rejected'); G8.shake = 6; break;
      case 'breakout': Audio8.sfx('breakout'); burst(ev.x, ev.alt, 40, '#7be08a', 160, 'confetti'); G8.shake = 6; break;
      case 'era': { Audio8.sfx('era'); const e = SIM.ERAS.find(x => x.name === ev.text); showBanner(e.name, e.sub); continue; }
      case 'today': Audio8.sfx('today'); burst(ev.x, ev.alt, 40, '#ffe066', 160, 'confetti'); showBanner('YOU ARE HERE', 'DAY ' + SIM.TODAY_DAY + '. STILL NOT 10K'); continue;
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
  shopFlash = Math.max(0, shopFlash - dt);
  G8.shake = Math.max(0, G8.shake - dt * 20);

  if (G8.screen === 'aim') {
    const a = G8.aim;
    if (!a.drag) {
      if (keys.has('ArrowUp') || keys.has('KeyW')) a.angle = Math.min(60, a.angle + 40 * dt);
      if (keys.has('ArrowDown') || keys.has('KeyS')) a.angle = Math.max(-5, a.angle - 40 * dt);
    }
    if (a.charging) {
      a.chargeT += dt;
      const ph = (a.chargeT / 1.1) % 2;
      a.power = ph < 1 ? ph : 2 - ph;
      if (Math.floor(a.chargeT * 20) !== Math.floor((a.chargeT - dt) * 20)) Audio8.sfx('charge', a.power);
    }
  }
  if (G8.screen === 'fly' && !G8.paused) {
    acc += Math.min(dt, 0.1);
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
    if (run.phase === 'done') finishRun();
  }
  // camera
  if (run && (G8.screen === 'fly' || G8.screen === 'results')) {
    const tx = run.x - 150, ta = Math.max(0, run.alt - 105);
    G8.camX += (tx - G8.camX) * Math.min(1, dt * 8);
    G8.camAlt += (ta - G8.camAlt) * Math.min(1, dt * 5);
    // RC tags along behind the rock, or grabs it during a lift
    const grab = run.rcT > 0;
    const rx = grab ? run.x - 2 : run.x - 20, ra = grab ? run.alt + 8 : run.alt + 16 + Math.sin(G8.time * 5) * 3;
    G8.rc.x += (rx - G8.rc.x) * Math.min(1, dt * (grab ? 20 : 10));
    G8.rc.alt += (ra - G8.rc.alt) * Math.min(1, dt * (grab ? 20 : 10));
  } else if (G8.screen === 'title') G8.camX = G8.time * 20;
  for (const t of G8.texts) t.t += dt;
  G8.texts = G8.texts.filter(t => t.t < 1.3);
  for (const p of G8.parts) {
    p.t += dt; p.x += p.vx * dt; p.alt += p.vy * dt;
    if (p.kind !== 'ghost' && p.kind !== 'puff') p.vy -= 300 * dt;
    if (p.kind === 'puff') { p.vx *= 0.95; p.vy *= 0.95; }
  }
  G8.parts = G8.parts.filter(p => p.t < p.life && (p.kind !== 'drop' || p.alt > -2));
}

// ---------- draw ----------
const sx = x => Math.round(x - G8.camX);
const sy = alt => Math.round(WATER_Y - alt + G8.camAlt);

function eraBlend(x) {
  // returns [eraA, eraB, t]: cross-fade over the first 60 days of each era
  const i = SIM.eraIndexAt(x), d = SIM.dayAt(x) - SIM.ERAS[i].day;
  if (i > 0 && d < 60) return [SIM.ERAS[i - 1].id, SIM.ERAS[i].id, d / 60];
  return [SIM.ERAS[i].id, null, 0];
}

function drawWorld() {
  const camX = G8.camX, camAlt = G8.camAlt, time = G8.time;
  const centerX = camX + W / 2;
  const [ea, eb, t] = eraBlend(Math.max(0, centerX));
  drawBackdrop(ctx, ea, camX, camAlt, time);
  if (eb) { ctx.globalAlpha = t; drawBackdrop(ctx, eb, camX, camAlt, time); ctx.globalAlpha = 1; }
  drawClouds(ctx, eb && t > 0.5 ? eb : ea, camX, camAlt);
  drawPriceGrid();
  drawWater(ctx, ea, camX, camAlt, time, SIM.ICE);
  if (eb) { ctx.globalAlpha = t; drawWater(ctx, eb, camX, camAlt, time, SIM.ICE); ctx.globalAlpha = 1; }

  // dock + Droober
  if (camX < 200) drawDock();
  // era buoys
  for (const era of SIM.ERAS) {
    const x = era.day * SIM.PX_PER_DAY + 30;
    if (x - camX > -120 && x - camX < W + 20 && era.day > 0) drawEraBuoy(ctx, era, sx(x), sy(0), time);
  }
  const run = G8.run;
  if (run) {
    for (const e of run.ents) {
      if (e.used && e.t !== 'pump' && e.t !== 'whaleG' && e.t !== 'whaleR' && e.t !== 'suit' && e.t !== 'kevin' && e.t !== 'fork' && e.t !== 'bull' && e.t !== 'bear' && e.t !== 'kitty') continue;
      const ex = sx(e.x);
      if (ex < -80 || ex > W + 20) continue;
      drawEnt(ctx, run, e, ex, sy(e.alt), time);
    }
    drawResistance(SIM.ALT_5K, '$4,868 ATH', run.broke5k);
    drawResistance(SIM.ALT_10K, '$10,000', run.broke10k);
  }
  // particles
  for (const p of G8.parts) {
    const a = 1 - p.t / p.life, x = sx(p.x), y = sy(p.alt);
    if (p.kind === 'puff') { ctx.globalAlpha = a * 0.8; px(ctx, p.color, x - 2, y - 2, 5, 4); ctx.globalAlpha = 1; }
    else if (p.kind === 'confetti') px(ctx, ['#7be08a', '#ffe066', '#ff7ab0', '#7fe3ff'][(p.x | 0) % 4], x, y, 2, 2);
    else if (p.kind === 'ghost') { ctx.globalAlpha = a * 0.6; drawRock(ctx, 0, x, y, 0); drawText(ctx, 'ETC', x - 8, y - 14, '#7be08a'); ctx.globalAlpha = 1; }
    else px(ctx, p.color, x, y, 2, 2);
  }
  if (run && G8.screen !== 'aim' && G8.screen !== 'title') drawRockAndRC(run);
  // floating texts
  for (const t of G8.texts) {
    const y = sy(t.alt) - t.t * 24;
    ctx.globalAlpha = Math.min(1, 2.2 - t.t * 1.6);
    drawTextOutlined(ctx, t.text, sx(t.x), y, t.color, 1);
    ctx.globalAlpha = 1;
  }
}

function drawPriceGrid() {
  // faint price levels every $1,000
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
  for (let x = -((G8.camX | 0) % 12); x < W; x += 12) px(ctx, c, x, y, 7, 2);
  drawTextOutlined(ctx, label + (broken ? ' SUPPORT' : ' RESISTANCE'), W - 110, y - 10, c, 1);
}

function drawDock() {
  const x0 = sx(-10), y = sy(22);
  px(ctx, '#6a4422', x0, y, 76, 5); px(ctx, '#8a5a30', x0, y, 76, 1);
  for (let i = 0; i < 4; i++) px(ctx, '#4a2e16', x0 + 6 + i * 20, y + 5, 4, sy(0) - y + 8);
  const aiming = G8.screen === 'aim', run = G8.run;
  const frame = aiming ? (G8.aim.charging || G8.aim.drag ? 'crouch' : 'front') : (run && run.phase === 'fly' && run.t < 0.4 ? 'jump' : 'wave');
  drawFrameAt(ctx, frame, sx(36), y, 1);
  if (aiming) {
    drawRock(ctx, G8.rockN, sx(SIM.DOCK_X), sy(SIM.DOCK_ALT), 0);
    drawAimGuide();
  }
  // RC hovering by the dock before the throw
  if (aiming || G8.screen === 'title') drawRC(sx(G8.rc.x), sy(G8.rc.alt + Math.sin(G8.time * 3) * 3), 'rcFront');
}
function drawRC(x, y, frame = 'rcSide') {
  const r = SPRITE_RECTS[frame];
  if (SPRITES && r) ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3] / 2), r[2], r[3]);
}
function drawAimGuide() {
  const a = G8.aim, s = SIM.stats(save.up);
  const p = Math.max(0.25, a.power || 0.6);
  const rad = a.angle * Math.PI / 180;
  let x = SIM.DOCK_X, alt = SIM.DOCK_ALT, vx = Math.cos(rad) * s.throwMax * p, vy = Math.sin(rad) * s.throwMax * p;
  for (let i = 0; i < 26; i++) {
    for (let k = 0; k < 4; k++) { x += vx / 120; alt += vy / 120; vy -= SIM.G / 120; }
    if (alt < 0) break;
    if (i % 2 === 0) px(ctx, '#ffffff', sx(x), sy(alt), 2, 2);
  }
  // power bar
  const bx = sx(4), by = sy(110);
  px(ctx, '#22163a', bx, by, 54, 8); px(ctx, '#3a2c63', bx + 1, by + 1, 52, 6);
  px(ctx, a.power > 0.85 ? '#ffe066' : '#7be08a', bx + 1, by + 1, Math.round(52 * (a.power || 0)), 6);
  drawText(ctx, 'POWER', bx, by - 9, '#fff');
  drawText(ctx, Math.round(a.angle) + ' DEG', bx + 60, by, '#fff');
}

function drawRockAndRC(run) {
  const x = sx(run.x), y = sy(run.alt) - 4;
  if (run.phase === 'fly') {
    // trail
    ctx.globalAlpha = 0.35;
    for (let i = 1; i <= 4; i++) px(ctx, '#ffffff', x - i * 5 * Math.sign(run.vx || 1), y + Math.round(run.vy / 120 * i * 1.5), 2, 2);
    ctx.globalAlpha = 1;
    // skip timing helper: a closing ring where the rock will touch the water
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
    drawRock(ctx, G8.rockN, x, y, run.spin);
    ctx.globalAlpha = 1;
  }
  drawRC(sx(G8.rc.x), sy(G8.rc.alt), run.rcT > 0 ? 'rcFront' : 'rcSide');
  if (y < -4) { // rock above the screen: arrow + price
    drawText(ctx, '^', x - 2, 4, '#ffe066');
  }
}

function fmtPrice(p) { return '$' + Math.round(p).toLocaleString('en-US'); }

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
  // gems
  blit(ctx, GEM(), W / 2 + 34, 6);
  drawText(ctx, String(run.gems), W / 2 + 44, 7, '#d6c2ff');
  // candle chart of this run
  drawMiniChart(run, W - 110, 3, 84, 14);
  if (G8.screen === 'fly') {
    drawText(ctx, 'II', W - 16, 7, '#fff');
    // boosts
    const by = H - 12;
    if (!G8.touch) {
      drawText(ctx, 'X FART', 6, by, run.farts ? '#9ff07a' : '#666');
      for (let i = 0; i < run.farts; i++) blit(ctx, BANANA(), 44 + i * 10, by - 1);
      drawText(ctx, 'C RC', 6, by - 10, run.rc ? '#7fe3ff' : '#666');
      for (let i = 0; i < run.rc; i++) px(ctx, '#7fe3ff', 34 + i * 7, by - 9, 5, 5);
    }
    if (run.streak >= 2) drawTextOutlined(ctx, run.streak + 'X', W / 2, 26, '#ffe066', 1);
    // first-run hints
    if (save.runs < 3 && G8.hintT < 12) {
      const tip = G8.hintT < 4 ? (G8.touch ? 'TAP AS THE ROCK HITS THE WATER' : 'TAP SPACE AS THE ROCK HITS THE WATER')
        : G8.hintT < 8 ? (G8.touch ? 'HOLD UP OR DOWN TO TILT' : 'UP AND DOWN TILT THE ROCK')
        : (G8.touch ? 'FART AND RC BUTTONS FOR BOOSTS' : 'X TO FART. C TO CALL RC');
      drawTextOutlined(ctx, tip, W / 2, 100, '#fff', 1);
    }
  }
  if (G8.banner) {
    // slides down, holds, slides back up (no alpha: stacked outlines smear when faded)
    const b = G8.banner, k = Math.min(1, b.t * 4, (3 - b.t) * 4);
    const y = Math.round(-40 + 102 * (1 - Math.pow(1 - Math.max(0, k), 3)));
    drawTextOutlined(ctx, b.title, W / 2, y, '#ffe066', 3);
    drawTextOutlined(ctx, b.sub, W / 2, y + 26, '#ffffff', 1);
  }
}
function drawMiniChart(run, x, y, w, h) {
  const cs = run.candles.slice(-Math.floor(w / 3));
  if (!cs.length) return;
  let lo = 1000, hi = 5000;
  for (const c of cs) hi = Math.max(hi, c.h);
  const Y = p => y + h - Math.round((p - lo) / (hi - lo) * h);
  px(ctx, '#ff5a6a', x, Y(4868), w, 1);
  cs.forEach((c, i) => {
    const col = c.c >= c.o ? '#7be08a' : '#ff6b6b';
    const cx = x + i * 3;
    px(ctx, col, cx + 1, Y(c.h), 1, Math.max(1, Y(c.l) - Y(c.h)));
    const t = Math.min(Y(c.o), Y(c.c)), b = Math.max(Y(c.o), Y(c.c));
    px(ctx, col, cx, t, 2, Math.max(1, b - t));
  });
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
    drawTextC(ctx, lab[k], x + w / 2, y + h / 2 - 4, '#fff', k === 'skip' ? 2 : 1);
  }
}

function panel(x, y, w, h) {
  px(ctx, '#22163a', x - 2, y - 2, w + 4, h + 4);
  px(ctx, '#fdf6e0', x, y, w, h);
  px(ctx, '#e8dcc0', x, y + h - 3, w, 3);
}

function drawTitle() {
  drawWorld();
  ctx.globalAlpha = 0.35; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const bob = Math.round(Math.sin(G8.time * 2) * 2);
  drawTextOutlined(ctx, 'SKIP TO 10K', W / 2, 30 + bob, '#ffe066', 5);
  drawTextOutlined(ctx, 'A DROOBER AND RC ROCK SKIPPING SAGA', W / 2, 76, '#fff', 1);
  const lore = ['IN 2017 SOMEBODY MADE 100 ROCKS.', 'THEY DO NOTHING. THAT IS THE POINT.', 'DROOBER FOUND ONE BY THE LAKE.', 'HOW FAR CAN A ROCK GO?'];
  lore.forEach((l, i) => { ctx.globalAlpha = Math.min(1, Math.max(0, G8.time * 1.2 - i * 0.8)); drawTextOutlined(ctx, l, W / 2, 100 + i * 12, '#d6c2ff', 1); });
  ctx.globalAlpha = 1;
  drawRock(ctx, 7, W / 2 - 1, 162 + Math.round(Math.sin(G8.time * 3) * 3), G8.time * 4);
  if ((G8.time * 2 | 0) % 2 === 0) drawTextOutlined(ctx, G8.touch ? 'TAP TO THROW' : 'PRESS SPACE OR CLICK', W / 2, 186, '#fff', 1);
  if (save.best.days) drawTextOutlined(ctx, 'BEST: DAY ' + save.best.days + '   PEAK ' + fmtPrice(save.best.peak), W / 2, 200, '#ffe066', 1);
  drawText(ctx, 'M MUTE  N MUSIC', 6, H - 10, '#b8a8e8');
  drawText(ctx, 'BY DROOBER', W - 66, H - 10, '#b8a8e8');
}

function drawAim() {
  drawWorld();
  px(ctx, 'rgba(20,12,40,0.55)', 0, 0, W, 20);
  drawText(ctx, 'ROCK #' + G8.rockN, 6, 3, '#fff');
  drawText(ctx, 'GWEI ' + save.gwei, 6, 11, '#d6c2ff');
  px(ctx, '#3a2c63', W - 56, 6, 50, 12); drawTextC(ctx, 'SHOP', W - 31, 9, '#fff');
  const tip = G8.touch || G8.aim.drag ? 'DRAG BACK TO AIM. LET GO TO THROW'
    : 'UP DOWN AIM. HOLD SPACE, LET GO TO THROW';
  drawTextOutlined(ctx, tip, W / 2, 40, '#fff', 1);
  drawTextOutlined(ctx, 'FLAT THROWS SKIP. STEEP ONES SPLASH.', W / 2, 52, '#d6c2ff', 1);
}

function drawResults() {
  drawWorld(); drawHUD();
  const r = G8.res;
  ctx.globalAlpha = 0.4; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  panel(90, 34, 300, 200);
  drawTextC(ctx, 'ROCK #' + G8.rockN + (r.reason === 'FROZE' ? ' FROZE' : ' SANK'), W / 2, 42, '#22163a', 2);
  drawTextC(ctx, r.date + '  .  ' + r.era, W / 2, 62, '#7a4a8a');
  const rows = [
    ['DAYS SKIPPED', String(r.days) + (r.newBest ? '  NEW BEST' : '')],
    ['PEAK PRICE', fmtPrice(r.peak)], ['AVERAGE PRICE', fmtPrice(r.vwap)],
    ['SKIPS', String(r.skips)], ['PERFECT', r.perfects + '  BEST STREAK ' + r.bestStreak],
    ['GEMS', String(r.gems)],
  ];
  rows.forEach(([a, b], i) => { drawText(ctx, a, 110, 78 + i * 12, '#5a4a7a'); drawText(ctx, b, 236, 78 + i * 12, '#22163a'); });
  drawText(ctx, 'GWEI EARNED', 110, 158, '#5a4a7a'); drawText(ctx, '+' + r.earned, 236, 158, '#3fa86a');
  drawTextC(ctx, '"' + r.quip + '"', W / 2, 176, '#e5487f');
  drawFrameAt(ctx, 'wave', 360, 226, 0);
  drawRC(330, 200 + Math.sin(G8.time * 4) * 2, 'rcFront');
  if ((G8.time * 2 | 0) % 2 === 0) drawTextC(ctx, G8.touch ? 'TAP FOR THE SHOP' : 'SPACE FOR THE SHOP', W / 2, 218, '#22163a');
}

// ---------- shop ----------
const SHOP = { x: 70, y: 22, w: 340, rowH: 21 };
function shopClick(p) {
  const n = SIM.UPGRADES.length;
  for (let i = 0; i <= n; i++) {
    const y = SHOP.y + 36 + i * SHOP.rowH;
    if (hitRect(p, [SHOP.x, y - 3, SHOP.w, SHOP.rowH - 2])) {
      G8.shopSel = i;
      if (i === n) toAim(); else buy(i);
      return;
    }
  }
}
function drawShop() {
  G8.camX = 0; G8.camAlt = 0;
  drawWorld();
  ctx.globalAlpha = 0.4; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const { x, y, w, rowH } = SHOP, n = SIM.UPGRADES.length;
  panel(x, y, w, 36 + (n + 1) * rowH + 22);
  drawText(ctx, 'THE DOCK SHOP', x + 10, y + 8, '#22163a', 2);
  blit(ctx, GEM(), x + w - 92, y + 9);
  drawText(ctx, 'GWEI ' + save.gwei, x + w - 82, y + 10, shopFlash > 0 ? '#e5487f' : '#7a4a8a');
  SIM.UPGRADES.forEach((u, i) => {
    const ry = y + 36 + i * rowH, lvl = save.up[u.id] || 0, sel = G8.shopSel === i;
    if (sel) px(ctx, '#f0e4ff', x + 4, ry - 3, w - 8, rowH - 2);
    drawText(ctx, u.name, x + 10, ry, '#22163a');
    for (let k = 0; k < SIM.MAX_LVL; k++) px(ctx, k < lvl ? '#7b55c6' : '#d8cce8', x + 110 + k * 9, ry, 7, 7);
    const cost = SIM.upgradeCost(u, lvl);
    const label = lvl >= SIM.MAX_LVL ? 'MAX' : cost + ' GWEI';
    drawText(ctx, label, x + 165, ry, lvl >= SIM.MAX_LVL ? '#3fa86a' : save.gwei >= cost ? '#22163a' : '#b0a0c0');
    drawText(ctx, u.desc, x + 165, ry + 8, '#8a7aa8');
  });
  const ty = y + 36 + n * rowH, selT = G8.shopSel === n;
  px(ctx, selT ? '#e5487f' : '#c03a6a', x + 4, ty - 3, w - 8, rowH - 2);
  drawTextC(ctx, 'THROW A ROCK', x + w / 2, ty + 3, '#fff');
  // trophies
  const tro = [['5K', save.flags.broke5k], ['10K', save.flags.broke10k], ['TODAY', save.flags.today], ['FOREVER', save.flags.forever]];
  let tx = x + 10;
  drawText(ctx, 'TROPHIES', tx, ty + rowH + 2, '#7a4a8a'); tx += 56;
  for (const [name, got] of tro) { drawText(ctx, (got ? '*' : '-') + name, tx, ty + rowH + 2, got ? '#e0a020' : '#c0b4d0'); tx += textWidth(name) + 16; }
  drawTextC(ctx, G8.touch ? 'TAP AN UPGRADE TO BUY' : 'UP DOWN PICK. ENTER BUYS. T THROWS', W / 2, H - 12, '#fff');
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
    case 'aim': drawAim(); break;
    case 'fly': drawWorld(); drawHUD(); drawTouchButtons(); if (G8.paused) drawPause(); break;
    case 'results': drawResults(); break;
    case 'shop': drawShop(); break;
  }
  ctx.restore();
}

// ---------- demo ----------
// ?demo=<day>[&alt=<alt>]: a bot throws and plays from that day. Used for screenshots and as an attract mode.
const DEMO = (() => { try { const q = new URLSearchParams(location.search); return q.has('demo') ? { day: +q.get('demo') || 0, alt: +q.get('alt') || 0, screen: q.get('screen') } : null; } catch { return null; } })();
function demoStart() {
  if (DEMO.screen === 'shop') { save.gwei = 1234; save.up = { arm: 3, rock: 2, hands: 1, farts: 4 }; return toShop(); }
  toAim(); G8.aim.angle = 14; doThrow(1);
  const run = G8.run;
  run.x = DEMO.day * SIM.PX_PER_DAY; run.vx = 520; run.alt = DEMO.alt || 60; run.vy = 120;
  G8.camX = run.x - 150; G8.camAlt = Math.max(0, run.alt - 105); G8.rc = { x: run.x - 20, alt: run.alt + 16 };
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
