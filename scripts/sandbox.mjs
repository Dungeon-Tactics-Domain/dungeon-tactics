// Screenshots from scene specs (docs/sandbox.md): npm run sandbox -- <spec.json | folder>... [--out dir] [--sheet] [--url base]
// Starts its own Vite dev server (always the current code, no build) unless --url points at a running one, then opens each
// spec in a fresh page of one headless Chrome (muted) and writes <out>/<name>.png or .webp; --sheet adds contact-sheet.png.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { parseSpec, specUrl, storageFor } from '../src/client/dev/sandbox-spec.ts';
import { chromium, LAUNCH } from './lib/browser.mjs';

const TIMEOUT = 90_000; // software WebGL and a cold dev server take a while to build the first frame
const VIEWPORT = { width: 1600, height: 900 };
const SETTLE_MS = 3000; // page time between load and shot: the camera eases in and the action camera ends (420 ms)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string', default: 'screenshots' }, sheet: { type: 'boolean' }, url: { type: 'string' } },
});
if (!positionals.length) {
  console.error(
    'usage: npm run sandbox -- <spec.json | folder>... [--out dir] [--sheet] [--url http://localhost:5181]',
  );
  process.exit(2);
}

// every spec first, so a typo fails before Chrome opens; a file may hold one spec or a list
const specs = [];
for (const arg of positionals) {
  const files = (await stat(arg)).isDirectory()
    ? (await readdir(arg)).filter((f) => f.endsWith('.json')).map((f) => join(arg, f))
    : [arg];
  for (const file of files) {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach((r, i) => {
      const { spec, problems } = parseSpec(r);
      const name = spec.name ?? basename(file, extname(file)) + (list.length > 1 ? `-${i + 1}` : '');
      if (problems.length) {
        console.error(`FAIL ${name}: ${problems.join('; ')}`);
        process.exitCode = 1;
      }
      specs.push({ spec, name });
    });
  }
}
if (process.exitCode) process.exit();

// own port, away from the usual dev ones (5173, 5181, 5210) that may belong to another session; busy, Vite takes the next.
// Port 0 does not mean "any free port" to Vite: it falls back to 5173
const server = values.url ? null : await (await createServer({ server: { port: 5290 }, logLevel: 'warn' })).listen();
const base = (values.url ?? server.resolvedUrls.local[0]).replace(/\/$/, '');
await mkdir(values.out, { recursive: true });
const browser = await chromium.launch(LAUNCH);
const shots = [];
try {
  for (const { spec, name } of specs) {
    // one browser for the batch, a fresh context per spec: empty saves and a page clock that starts from zero (in a
    // shared context the clock carried on from the previous page and the frames fell on other instants)
    const context = await browser.newContext({ viewport: spec.viewport ?? VIEWPORT });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (seed) => {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
      },
      storageFor({ lang: 'en', ...spec }),
    ); // English unless the spec says otherwise: not the machine's language
    try {
      if (spec.path) {
        await page.goto(base + specUrl(spec));
        await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      } else {
        // Same spec, same picture (the fps counter reads the fake clock: hide it, its numbers mean nothing here): the page's clock stands still while it loads (however long that takes) and then runs a
        // fixed stretch, and the water's random splashes draw from a fixed seed
        await page.clock.install({ time: 0 });
        await page.clock.pauseAt(1000); // install alone keeps time flowing in real time
        await page.addInitScript(() => {
          let a = 1;
          Math.random = () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        });
        await page.goto(base + specUrl(spec));
        await until(() => page.evaluate(() => window.__sandbox?.ready));
        errors.push(...(await page.evaluate(() => window.__sandbox.problems)));
        await page.clock.runFor(SETTLE_MS);
      }
      if (errors.length) throw new Error(errors.join('; '));
      // menus open with CSS and the ▶ pulses on the compositor's own clock: stopped for the shot
      const png = await page.screenshot({ animations: 'disabled' });
      const file = join(values.out, `${name}.${spec.format ?? 'png'}`);
      // Playwright writes PNG and JPEG only: Chrome's own encoder makes the WebP, no extra dependency
      await writeFile(file, spec.format === 'webp' ? await toWebp(page, png) : png);
      shots.push({ name, png });
      console.log(`ok   ${file}`);
    } catch (e) {
      console.error(`FAIL ${name}: ${e.message.split('\n')[0]}`);
      process.exitCode = 1;
    }
    await context.close();
  }
  if (values.sheet && shots.length) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const cells = shots
      .map(
        (s) =>
          `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${s.name}</figcaption></figure>`,
      )
      .join('');
    await page.setContent(
      `<style>body{margin:0;padding:16px;background:#1b1626;color:#f3e9d2;font:14px system-ui;display:grid;grid-template-columns:repeat(3,1fr);align-content:start;gap:16px}figure{margin:0}img{width:100%;display:block}figcaption{padding-top:4px}</style>${cells}`,
    );
    const file = join(values.out, 'contact-sheet.png');
    await writeFile(file, await page.screenshot({ fullPage: true }));
    console.log(`ok   ${file}`);
  }
} finally {
  await browser.close();
  await server?.close();
}

// polls from Node, not the page: the page's timers are fake and only move when the clock is run
async function until(ready) {
  for (let t = 0; !(await ready()); t += 200) {
    if (t > TIMEOUT) throw new Error('the sandbox did not get ready');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function toWebp(page, png) {
  const b64 = await page.evaluate(async (src) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${src}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: 0.9 })).arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }, png.toString('base64'));
  return Buffer.from(b64, 'base64');
}
