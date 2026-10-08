# Skip to 10K

Droober & RC rock-skipping launcher. Inspired by Pebble Dash (timed skips) and Monkey Flight (slingshot launch,
limited fart boosts, upgrade between runs), themed on Ether Rock and crypto history. Sibling of
`../droober-two-places` (sprites + font copied from there). Vanilla canvas, zero deps, no build step.
Classic `<script>` tags share globals; load order in index.html matters. `node serve.mjs` serves port 5178.

## The bit
- x is time: 6 px per day since ETH genesis (2015-07-30). Eras in `SIM.ERAS` walk the history and end at
  YOU ARE HERE (day 4088 = 2026-10-08), then FOREVER mixes everything forever.
- altitude is price: `priceAt(alt) = 1000 + alt * 6.45`. A red resistance line at the $4,868 ATH rejects the rock
  unless it crosses fast enough (VOLUME upgrade). $10,000 is a second line. Broken resistance becomes support.
- The joke is sideways chop: most runs live between $1K and $3K. Keep it affectionate, no chain favoritism,
  no logos. Characters are original homages (Kevin, apes, Skrumpeys, suits, whales, fartcoin clouds).

## Files
- `src/sim.js` pure physics, entities, upgrades, eras. No DOM. Loaded by tests through vm/require.
- `src/art.js` procedural pixel art (bitmap strings), backdrops per era, Droober/RC sheet helpers.
- `src/main.js` screens (title, aim, fly, results, shop), input, camera, HUD, save (`localStorage` skip10k.v1).
- `src/audio.js` synthesized sfx + one loop. `src/font.js`, `src/sprites.js`, `assets/sprites.png` come from droober-two-places.

## Working rules
- After any sim change: `node tests/sim.mjs` (perfect-tap bot balance table) and `node tests/harness.mjs`
  (stubbed DOM, plays every screen). A human-ish first run should land around day 300-500.
- Screenshots without the Chrome extension: headless Chrome with `?demo=<day>[&alt=<alt>]` or `?demo=0&screen=shop`,
  `--virtual-time-budget=2500`. Demo mode is a bot that throws and plays from that day.
- In-game copy: uppercase bitmap font only (see `GLYPHS`). No em dashes, say crypto not Web3, never "rug".
  Signed droober only.
- Don't fade outlined text with globalAlpha: the stacked outline passes smear. Slide it instead.
