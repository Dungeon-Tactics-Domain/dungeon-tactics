// Browser smoke test of the built game (dist/): npx vite build && npm run smoke
// Opens the title, the town, an expedition and battles in headless Chrome and fails on a missing screen, a console error or a
// failed request.
import { preview } from 'vite';
import { openChrome } from './lib/browser.mjs';

const PORT = 4173;
const TIMEOUT = 60_000; // software WebGL on a CI runner takes a while to build the first frame

// an expedition just started (src/shared/crawl/expedition.ts) with the default party worn down to 9 life: home (?home) is
// still the town, offering to continue it; ?home=expedition opens its map, and its first room (node 0 is always open first) must show the carried life, not a full bar
const WORN = {
  'dt:crawl': JSON.stringify({
    v: 'crawl8',
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
    // home with no expedition: the walkable town (Nov 15), drawn with no window over it; Esc opens its menu: quest, shop,
    // tavern, party and the title. The check presses Esc itself (the town's keys listen on the window) (its 5 rows plus the debug grid's switch)
    name: 'town',
    path: '/?home',
    ready: '.town-prompt',
    check: async () => {
      const bare =
        !document.querySelector('.overlay') &&
        !!document.querySelector('.hud .tools .gear') && // the gear in place of the ☰ (Nov 18 night)
        [...document.querySelectorAll('canvas')].some((c) => c.getContext('webgl2') || c.getContext('webgl'));
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((r) => setTimeout(r, 800)); // the 3D menu opens a moment later
      // the menu is drawn in 3D: its 8 unseen hit buttons over the drawing (town3d/street.ts)
      return bare && document.querySelectorAll('.town3d-hits button').length === 7;
    },
  },
  {
    // with a save the title adds Continue, which says how many games are saved: the expedition seeded with no save slot
    // becomes one (saves.ts). Read at load, a circular import left the expedition's key undefined and Continue never
    // showed. The pages share one profile: saved pages go after the bare ones
    name: 'title with a save',
    path: '/',
    seed: WORN,
    ready: '.title-overlay [role=dialog] button.primary .continue-where',
    check: () => document.querySelectorAll('.title-overlay .camp-list button').length === 6,
  },
  {
    // an expedition in progress still opens the town, its menu with Continue first and the new quest after it
    name: 'town with an expedition',
    path: '/?home',
    seed: WORN,
    ready: '.town-prompt',
    check: async () => {
      const bare = !document.querySelector('.overlay');
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((r) => setTimeout(r, 800)); // the 3D menu opens a moment later
      return bare && document.querySelectorAll('.town3d-hits button').length === 8;
    },
  },
  {
    name: 'expedition map',
    path: '/?home=expedition',
    seed: WORN,
    // the chart of places: the open rooms of the first row, the rest still ahead, and Travel on for the picked one
    ready: '.crawl-map [role=dialog] .map-commands button.primary:enabled',
    check: () =>
      document.querySelectorAll('.crawl-map .map-place.open').length >= 2 &&
      document.querySelectorAll('.crawl-map .map-place.ahead').length >= 10 &&
      !!document.querySelector('.crawl-map .map-place.open[aria-current=true]'),
  },
  {
    name: 'expedition room',
    path: '/?room=0',
    seed: WORN,
    ready: '.panel.commands[role=menu] button',
    // attached, not visible: the 3D menu (the default since Nov 17) hides the HTML one that stays under it for clicks and keys
    attached: true,
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
    // attached, not visible: the 3D menu (the default since Nov 17) hides the HTML one that stays under it for clicks and keys
    attached: true,
    check: () =>
      !!document.querySelector('.panel.queue') &&
      [...document.querySelectorAll('canvas')].some((c) => c.getContext('webgl2') || c.getContext('webgl')),
  },
  {
    // a generated dungeon crawl room with the 2x2 boss (src/shared/crawl)
    name: 'crawl',
    path: '/?crawl=1&boss=1',
    ready: '.panel.commands[role=menu] button',
    // attached, not visible: the 3D menu (the default since Nov 17) hides the HTML one that stays under it for clicks and keys
    attached: true,
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
      await page.waitForSelector(p.ready, { state: p.attached ? 'attached' : 'visible', timeout: TIMEOUT });
      // the screen is built under the loading cover (src/client/loading.ts), which holds the keys until it leaves
      await page.waitForSelector('.loading-cover', { state: 'detached', timeout: TIMEOUT });
      if (!(await page.evaluate(p.check))) errors.push('screen incomplete');
      // the interface is only 3D (Nov 18): the game's page stays, never the plain warning of no WebGL (no3d.ts)
      if (
        !(await page.evaluate(
          () => !!document.querySelector('#app') && !document.querySelector('body > p[role=alert]'),
        ))
      )
        errors.push('no #app, or the warning that WebGL is missing');
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
