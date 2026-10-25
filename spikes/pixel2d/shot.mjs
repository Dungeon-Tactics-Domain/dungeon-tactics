// Prints da POC: node spikes/pixel2d/shot.mjs (usa o Chrome instalado, como os outros scripts)
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
const dir = new URL('.', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, width, height, dpr] of [['desktop-1920x1080', 1920, 1080, 1], ['celular-393x852', 393, 852, 3]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.log('ERRO', e.message));
  await page.goto(new URL('index.html', dir).href);
  await page.waitForFunction(() => document.getElementById('c').width > 300);
  await page.screenshot({ path: new URL(`${name}.png`, dir).pathname.slice(1) });
  console.log(name, await page.evaluate(() => [c.width, c.height, devicePixelRatio]));
}
await browser.close();
