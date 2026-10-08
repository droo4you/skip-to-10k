# Skip to 10K

Droober & RC rock-skipping launcher. Inspired by Pebble Dash (timed skips) and Monkey Flight (limited fart boosts,
upgrade between runs, missions), themed on Ether Rock and crypto history. Sibling of
`../droober-two-places` (sprites + font copied from there). Vanilla canvas, zero deps, no build step.
Classic `<script>` tags share globals; load order in index.html matters. `node serve.mjs` serves port 5178.

## The bit
- x is time: 6 px per day since ETH genesis (2015-07-30). Eras in `SIM.ERAS` walk the history and end at
  YOU ARE HERE (day 4088 = 2026-10-08), then FOREVER mixes everything forever.
- altitude is price: `priceAt(alt) = 1000 + alt * 6.45`. A red resistance line at the $4,953 ATH (Aug 24 2025) rejects the rock
  unless it crosses fast enough (VOLUME upgrade). $10,000 is a second line. Broken resistance becomes support.
- The joke is sideways chop: most runs live between $1K and $3K. Keep it affectionate, no chain favoritism,
  no logos. Characters are original homages (Kevin, apes, Skrumpeys, suits, whales, fartcoin clouds).

## The throw (v0.2, replaced a slingshot drag the user said felt bad)
- Run-up on a long dock: mash SPACE/tap to sprint, hold past 0.16s to raise the arm (angle climbs ~58 deg/s),
  let go to throw. Power = run speed. Releasing within 16px of the dock end = ON THE LINE (x1.12).
  Running off the end drops Droober in the lake and resets. Same input on keyboard and touch.

## Files
- `src/sim.js` pure physics, entities, upgrades, eras. No DOM. Loaded by tests through vm/require.
- `src/art.js` procedural pixel art (bitmap strings), backdrops per era, Droober/RC sheet helpers.
- `src/meta.js` history headlines (real dates), 35 missions + 12 ranks, rock garden prices, RC banter. No DOM.
- `src/main.js` screens (title, runup, fly, results, shop with UPGRADES/ROCKS/MISSIONS tabs), input, camera, HUD, save (`localStorage` skip10k.v1).
- `src/audio.js` synthesized sfx + one loop. `src/font.js`, `src/sprites.js`, `assets/sprites.png` come from droober-two-places.

## Working rules
- After any sim change: `node tests/sim.mjs` (perfect-tap bot balance table) and `node tests/harness.mjs`
  (stubbed DOM, plays every screen). After copy or meta changes: `node tests/meta.mjs` (every string renders in the
  bitmap font, news in date order, missions complete). A human-ish first run should land around day 300-500.
- Screenshots without the Chrome extension: headless Chrome with `?demo=<day>[&alt=<alt>]` or `&screen=shop|rocks|missions|runup|results`, `&touch`,
  `--virtual-time-budget=2500`. Demo mode is a bot that throws and plays from that day.
- In-game copy: uppercase bitmap font only (see `GLYPHS`). No em dashes, say crypto not Web3, never "rug".
  Signed droober only.
- Don't fade outlined text with globalAlpha: the stacked outline passes smear. Slide it instead.
