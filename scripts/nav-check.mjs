// One-page check of the built game (dist/): npx vite build && node scripts/nav-check.mjs [rounds]
// A phone on its side in headless Chrome (touch): asks for fullscreen with a tap on the title, then walks
// title -> town -> expedition map -> room battle -> title `rounds` times (10) by the game's own buttons. Says, at each
// screen, whether the page is still the same document and still in fullscreen, and after each round what the page
// holds (canvases, listeners, DOM nodes, heap, frame loops, timers, the scene's geometries), so a screen that does not
// let go shows as a number that grows. Fails on a reload, on fullscreen lost, on a lost WebGL context or on growth.
import { preview } from 'vite';
import { openChrome } from './lib/browser.mjs';

const PORT = 5527;
const TIMEOUT = 90_000; // software WebGL builds a scene slowly
const ROUNDS = Number(process.argv[2] ?? 10);

const server = await preview({ appType: 'mpa', preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const browser = await openChrome({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  locale: 'pt-BR',
});
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || /WebGL context|context lost/i.test(m.text())) problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));

// in every document of the tab: how many were loaded and left, and the page's frame loops and timers counted
await page.addInitScript(() => {
  const bump = (k) => sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) ?? 0) + 1));
  bump('nav:loads');
  addEventListener('pagehide', () => bump('nav:pagehides'));
  localStorage.setItem('dt:fps', '1'); // the F3 counter writes the scene's geometries and textures
  const probe = (window.__probe = { rafCalls: 0, frames: 0, timers: new Set() });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) =>
    raf((t) => {
      probe.rafCalls++;
      fn(t);
    });
  const tick = () => {
    probe.frames++;
    raf(tick);
  };
  raf(tick);
  const every = window.setInterval.bind(window);
  const stop = window.clearInterval.bind(window);
  window.setInterval = (...a) => {
    const id = every(...a);
    probe.timers.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    probe.timers.delete(id);
    stop(id);
  };
});
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

// by locator, never waitForSelector: the element handle that one returns keeps a screen's nodes (and, by their
// listeners, the whole screen) alive from the outside, and the count below would call it a leak
const settled = async (selector, attached = false) => {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: attached ? 'attached' : 'visible', timeout: TIMEOUT });
  await page.locator('.loading-cover').waitFor({ state: 'detached', timeout: TIMEOUT });
};
// the topmost button that says `text` (its label or its words), where it is on screen
const find = (text) =>
  page.evaluate((text) => {
    const b = [...document.querySelectorAll('button')]
      .filter((b) => b.getClientRects().length && !b.disabled)
      .filter((b) => ((b.getAttribute('aria-label') ?? '') + b.textContent).includes(text))
      .at(-1);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, text);
// a finger's tap on it: a real gesture, the only thing a browser grants fullscreen to
async function tap(text) {
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll('button')].some(
        (b) => b.getClientRects().length && ((b.getAttribute('aria-label') ?? '') + b.textContent).includes(text),
      ),
    text,
    { timeout: TIMEOUT },
  );
  await page.touchscreen.tap(...(await find(text)));
}

const tab = () =>
  page.evaluate(() => ({
    loads: Number(sessionStorage.getItem('nav:loads') ?? 0),
    pagehides: Number(sessionStorage.getItem('nav:pagehides') ?? 0),
    fullscreen: !!document.fullscreenElement,
    url: location.pathname + location.search,
  }));
const walk = []; // every screen of the walk: document loads so far and fullscreen
async function at(screen) {
  const s = await tab();
  walk.push({ screen, ...s });
  return s;
}

// what the page holds now, after a forced collection
async function held() {
  await page.waitForTimeout(1200); // the counter's text is redrawn twice a second
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const before = await page.evaluate(() => ({ ...window.__probe, timers: window.__probe.timers.size }));
  await page.waitForTimeout(1000);
  const dom = await page.evaluate(() => {
    const scene = document.querySelector('.fps')?.textContent ?? '';
    return {
      rafCalls: window.__probe.rafCalls,
      frames: window.__probe.frames,
      timers: window.__probe.timers.size,
      canvases: document.querySelectorAll('canvas').length,
      bodyChildren: document.body.children.length,
      overlays: document.querySelectorAll('.overlay').length,
      geometries: Number(/(\d+) geometr/.exec(scene)?.[1] ?? Number.NaN),
      textures: Number(/(\d+) textur/.exec(scene)?.[1] ?? Number.NaN),
      warning: !!document.querySelector('body > p[role=alert]'),
    };
  });
  return {
    canvases: dom.canvases,
    listeners: m.JSEventListeners,
    nodes: m.Nodes,
    heapMB: Math.round(m.JSHeapUsedSize / 1048576),
    // frame callbacks run per frame, the probe's own left out: one per live loop
    loops: Math.round(((dom.rafCalls - before.rafCalls) / Math.max(1, dom.frames - before.frames)) * 10) / 10,
    timers: dom.timers,
    bodyChildren: dom.bodyChildren,
    overlays: dom.overlays,
    geometries: dom.geometries,
    textures: dom.textures,
    warning: dom.warning,
  };
}

const rounds = [];
try {
  await page.goto(`http://localhost:${PORT}/`);
  await settled('.title-overlay [role=dialog] button.primary');
  await tap('Jogar em tela cheia');
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: TIMEOUT });
  await page.waitForTimeout(500); // the title opens again once fullscreen settled
  await at('title, fullscreen asked by a tap');
  rounds.push({ round: 0, title: await held() });
  for (let round = 1; round <= ROUNDS; round++) {
    await tap('Novo jogo');
    await settled('.town-prompt');
    await at(`${round} town`);
    const town = round === 1 || round === ROUNDS ? await held() : undefined;
    await page.keyboard.press('Escape'); // the town's menu
    await tap('Nova expedição');
    await settled('.crawl-map [role=dialog] .map-commands button.primary:enabled');
    await at(`${round} expedition map`);
    await tap('Entrar na sala');
    await page.waitForFunction(() => location.search.startsWith('?room='), null, { timeout: TIMEOUT });
    await settled('.panel.commands[role=menu] button', true);
    await at(`${round} room battle`);
    const battle = round === 1 || round === ROUNDS ? await held() : undefined;
    await tap('Opções');
    await page.locator('.options3d-overlay').waitFor({ timeout: TIMEOUT });
    // the row sits under the fold of a phone's Options: pressed by its own click (no gesture is needed to leave);
    // twice, since leaving a room asks a 2nd press
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.options3d-overlay button')].find((b) =>
        b.textContent.includes('Voltar ao título'),
      );
      row.click();
      row.click();
    });
    await page.waitForFunction(() => location.search === '', null, { timeout: TIMEOUT });
    await settled('.title-overlay [role=dialog] button.primary');
    await at(`${round} title`);
    await page.waitForTimeout(5000); // the armed "Voltar ao título" row is held by its 5 s disarm timer (dialog.ts)
    rounds.push({ round, title: await held(), ...(town && { town }), ...(battle && { battle }) });
    console.log(`round ${round}/${ROUNDS}: ${JSON.stringify(rounds.at(-1).title)}`);
  }
} catch (e) {
  problems.push(e.message.split('\n')[0]);
}
const end = await tab().catch(() => null);
await browser.close();
await server.close();

console.log('\nScreens walked (document loads so far, pages left, fullscreen):');
for (const w of walk)
  console.log(
    `  ${w.screen.padEnd(36)} ${w.url.padEnd(18)} loads ${w.loads} pagehide ${w.pagehides} fullscreen ${w.fullscreen}`,
  );
console.log('\nWhat the page holds, by screen (first visit -> last):');
const first = rounds.find((r) => r.town);
const last = rounds.at(-1);
if (first && last) {
  console.table({
    'title after round 1': first.title,
    [`title after round ${last.round}`]: last.title,
    'town round 1': first.town,
    [`town round ${last.round}`]: last.town,
    'battle round 1': first.battle,
    [`battle round ${last.round}`]: last.battle,
  });
  // growth: the same screen holds more at the end than after the first round. The heap may sway a little (caches,
  // the save slots each New game adds); the counts may not
  for (const screen of ['title', 'town', 'battle']) {
    const a = first[screen];
    const b = last[screen];
    if (!a || !b) continue;
    // the scene's geometries and textures only where the scene is the same map each time: the title's backdrop. A
    // room is drawn anew by each expedition, with its own count
    const counts = ['canvases', 'loops', 'timers', 'bodyChildren', 'overlays'];
    for (const k of screen === 'title' ? [...counts, 'geometries', 'textures'] : counts)
      if (b[k] > a[k]) problems.push(`${screen}: ${k} grew from ${a[k]} to ${b[k]}`);
    if (b.listeners > a.listeners + 5) problems.push(`${screen}: listeners grew from ${a.listeners} to ${b.listeners}`);
    if (b.nodes > a.nodes * 1.1) problems.push(`${screen}: DOM nodes grew from ${a.nodes} to ${b.nodes}`);
    if (b.heapMB > a.heapMB * 1.3 + 5) problems.push(`${screen}: heap grew from ${a.heapMB} to ${b.heapMB} MB`);
    if (b.warning) problems.push(`${screen}: the no-WebGL warning is on the page`);
  }
}
if (end && end.loads !== 1)
  problems.push(`the page was loaded ${end.loads} times (pagehide ${end.pagehides}): a screen reloaded`);
for (const w of walk) if (!w.fullscreen) problems.push(`fullscreen lost at "${w.screen}"`);
if (walk.length < 1 + ROUNDS * 4) problems.push(`the walk stopped after ${walk.length} of ${1 + ROUNDS * 4} screens`);
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`NAV CHECK FAIL: ${problems.length} problem(s) above`);
  process.exit(1);
}
console.log('NAV CHECK OK');
