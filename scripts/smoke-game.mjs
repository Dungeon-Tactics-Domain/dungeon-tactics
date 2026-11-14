// Browser smoke test of the built game (dist/): npx vite build && npm run smoke
// Opens the title, a battle and the world map in headless Chrome and fails on a missing screen, a console error or a failed request.
import { preview } from 'vite';
import { openChrome } from './lib/browser.mjs';

const PORT = 4173;
const TIMEOUT = 60_000; // software WebGL on a CI runner takes a while to build the first frame

const PAGES = [
  {
    name: 'title',
    path: '/',
    ready: '.title-overlay [role=dialog] button.primary',
    check: () => document.querySelectorAll('.title-overlay [role=dialog] button').length >= 3,
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
    name: 'world',
    path: '/?world',
    // a saved hero skips the new-game intro and the hero creation, which come before the map
    seed: { 'dt:hero': JSON.stringify({ name: 'Smoke', cls: 'warrior' }) },
    ready: '.world-map .world-svg svg',
    check: () => document.querySelectorAll('.world-node').length > 0 && !!document.querySelector('.world-panel'),
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
