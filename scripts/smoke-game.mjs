// Browser smoke test of the built game (dist/): npx vite build && npm run smoke
// Opens the title, the town, an expedition and battles in headless Chrome and fails on a missing screen, a console error or a
// failed request.
import { preview } from 'vite';
import { openChrome } from './lib/browser.mjs';

const PORT = 4173;
const TIMEOUT = 60_000; // software WebGL on a CI runner takes a while to build the first frame

// an expedition just started (src/shared/crawl/expedition.ts) with the default party worn down to 9 life: the map opens
// at home (?home) and its first room (node 0 is always open first) must show the carried life, not a full bar
const WORN = {
  'dt:crawl': JSON.stringify({
    v: 'crawl3',
    seed: 77,
    path: [],
    party: ['warrior', 'archer', 'mage', 'rogue'].map((id) => ({ id, max: 50, hp: 9 })),
  }),
};

const PAGES = [
  {
    // the title: New game (no save yet, so no Continue), Quick battle, How to play, Developer, Credits and the language
    name: 'title',
    path: '/',
    ready: '.title-overlay [role=dialog] button.primary',
    check: () =>
      !!document.querySelector('.title-overlay .title-foot') &&
      document.querySelectorAll('.title-overlay .camp-list button').length === 5,
  },
  {
    // home with no expedition: the town (Nov 15): quest, shop, tavern, party and the title
    name: 'town',
    path: '/?home',
    ready: '.title-overlay [role=dialog] button.primary',
    check: () =>
      !document.querySelector('.title-overlay .title-foot') &&
      document.querySelectorAll('.title-overlay .camp-list button').length === 5,
  },
  {
    // with a save the title adds Continue, named after where it opens. Read at load, a circular import left the
    // expedition's key undefined and Continue never showed. The pages share one profile: saved pages go after the bare ones
    name: 'title with a save',
    path: '/',
    seed: WORN,
    ready: '.title-overlay [role=dialog] button.primary .continue-where',
    check: () => document.querySelectorAll('.title-overlay .camp-list button').length === 6,
  },
  {
    name: 'expedition map',
    path: '/?home',
    seed: WORN,
    ready: '.crawl-map [role=dialog] button.primary',
    check: () =>
      document.querySelectorAll('.crawl-map .crawl-row button').length >= 4 &&
      !!document.querySelector('.crawl-map .crawl-row button:disabled'),
  },
  {
    name: 'expedition room',
    path: '/?room=0',
    seed: WORN,
    ready: '.panel.commands[role=menu] button',
    check: () => {
      const [hp, max] = (document.querySelector('.unit-panel.hero .gauge.hp .gauge-num')?.textContent ?? '')
        .split('/')
        .map(Number);
      return hp > 0 && hp <= 9 && max > 9;
    },
  },
  {
    name: 'battle',
    path: '/?scenario=ash_wood',
    ready: '.panel.commands[role=menu] button',
    check: () =>
      !!document.querySelector('.panel.queue') &&
      [...document.querySelectorAll('canvas')].some((c) => c.getContext('webgl2') || c.getContext('webgl')),
  },
  {
    // a generated dungeon crawl room with the 2x2 boss (src/shared/crawl)
    name: 'crawl',
    path: '/?crawl=1&boss=1',
    ready: '.panel.commands[role=menu] button',
    check: () => !!document.querySelector('.panel.queue'),
  },
];

// mpa: a missing file answers 404 instead of index.html (the SPA fallback), so a lost asset fails as a request
const server = await preview({ appType: 'mpa', preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const browser = await openChrome();
const failures = [];
try {
  for (const p of PAGES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`exception: ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
    if (p.seed)
      await page.addInitScript((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), p.seed);
    try {
      await page.goto(`http://localhost:${PORT}${p.path}`);
      await page.waitForSelector(p.ready, { state: 'visible', timeout: TIMEOUT });
      if (!(await page.evaluate(p.check))) errors.push('screen incomplete');
      // models and textures keep loading after the first screen: wait for them so a missing asset still shows up
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    } catch (e) {
      errors.push(e.message.split('\n')[0]);
    }
    console.log(`${errors.length ? 'FAIL' : 'ok  '} ${p.name} ${p.path}`);
    for (const e of errors) console.log(`     ${e}`);
    failures.push(...errors);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.error(`SMOKE FAIL: ${failures.length} problem(s) above`);
  process.exit(1);
}
console.log('SMOKE OK');
