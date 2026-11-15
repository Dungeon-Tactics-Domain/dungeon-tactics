// Screenshots and gameplay clips from scene specs (docs/sandbox.md):
// npm run sandbox -- <spec.json | folder>... [--out dir] [--sheet] [--video] [--url base]
// Starts its own Vite dev server (always the current code, no build) unless --url points at a running one, then opens each
// spec in a fresh page of one headless Chrome (muted) and writes <out>/<name>.png or .webp; --sheet adds contact-sheet.png.
// --video records the spec's steps in real time instead: <out>/<name>.webm (+ .mp4 with ffmpeg) and <out>/clips.json.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { parseSpec, specUrl, storageFor } from '../src/client/dev/sandbox-spec.ts';
import { chromium, LAUNCH } from './lib/browser.mjs';

const TIMEOUT = 90_000; // software WebGL and a cold dev server take a while to build the first frame
const VIEWPORT = { width: 1600, height: 900 };
const SETTLE_MS = 3000; // page time between load and shot: the camera eases in and the action camera ends (420 ms)
const VIDEO = { width: 1280, height: 720 };
const LEAD_S = 0.5; // a clip starts this long before the first step: the settled scene, then the action
const HOLD_MS = 1200; // and runs this long after the last one: the numbers fade and the camera comes back
// a step plays and settles in seconds even on software WebGL (idle() stops at 600 frames); one that never ends fails
// the spec instead of hanging the batch. Wall clock in --video, page clock for the shot after the steps
const playLimit = (spec) => TIMEOUT * Math.max(1, spec.steps?.length ?? 0);
const stuck = 'the steps did not finish in time';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'screenshots' },
    sheet: { type: 'boolean' },
    video: { type: 'boolean' },
    url: { type: 'string' },
  },
});
if (!positionals.length) {
  console.error(
    'usage: npm run sandbox -- <spec.json | folder>... [--out dir] [--sheet] [--video] [--url http://localhost:5181]',
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
      // a bench spec's loop never ends: the CLI plays its steps once, itself
      const {
        spec: { loop: _loop, ...spec },
        problems,
      } = parseSpec(r);
      const name = spec.name ?? basename(file, extname(file)) + (list.length > 1 ? `-${i + 1}` : '');
      if (values.video && spec.path) problems.push('--video needs a battle (scenario or crawl), not a path');
      if (problems.length) {
        console.error(`FAIL ${name}: ${problems.join('; ')}`);
        process.exitCode = 1;
      }
      specs.push({ spec, name, file });
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
const clips = [];
const ffmpeg = values.video && spawnSync('ffmpeg', ['-version']).status === 0;
try {
  for (const { spec, name, file: specFile } of specs) {
    // one browser for the batch, a fresh context per spec: empty saves and a page clock that starts from zero (in a
    // shared context the clock carried on from the previous page and the frames fell on other instants)
    const viewport = spec.viewport ?? (values.video ? VIDEO : VIEWPORT);
    const context = await browser.newContext({
      viewport,
      ...(values.video && { recordVideo: { dir: tmpdir(), size: viewport } }),
    });
    const page = await context.newPage();
    const born = Date.now(); // the video starts with the page
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (seed) => {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
      },
      storageFor({ lang: 'en', ...spec }),
    ); // English unless the spec says otherwise: not the machine's language
    // the water's random splashes draw from a fixed seed
    await page.addInitScript(() => {
      let a = 1;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    try {
      if (values.video) {
        // real time, no fake clock: the clip runs at the game's own pace (the battle clock follows the wall clock)
        await page.goto(base + specUrl(spec));
        await until(() => page.evaluate(() => window.__sandbox?.ready), errors);
        errors.push(...(await page.evaluate(() => window.__sandbox.problems)));
        await page.evaluate(() => window.__sandbox.idle());
        const from = Math.max(0, (Date.now() - born) / 1000 - LEAD_S);
        if (!errors.length) {
          let timer;
          const late = new Promise((_, no) => {
            timer = setTimeout(() => no(new Error(stuck)), playLimit(spec));
          });
          const play = page.evaluate((s) => window.__sandbox.play(s), spec.steps ?? []);
          errors.push(...(await Promise.race([play, late]).finally(() => clearTimeout(timer))));
        }
        await page.waitForTimeout(HOLD_MS);
        if (errors.length) throw new Error(errors.join('; '));
        await context.close(); // the video file is complete only once its context closes
        clips.push({ name, spec, specFile, ...(await saveClip(page.video(), name, from)) });
        continue;
      }
      if (spec.path) {
        await page.goto(base + specUrl(spec));
        await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      } else {
        // Same spec, same picture (the fps counter reads the fake clock: hide it, its numbers mean nothing here): the page's
        // clock stands still while it loads (however long that takes) and then runs a fixed stretch
        await page.clock.install({ time: 0 });
        await page.clock.pauseAt(1000); // install alone keeps time flowing in real time
        await page.goto(base + specUrl(spec));
        await until(() => page.evaluate(() => window.__sandbox?.ready), errors);
        errors.push(...(await page.evaluate(() => window.__sandbox.problems)));
        await page.clock.runFor(SETTLE_MS);
        if (spec.steps && !errors.length) {
          // the shot after the steps: the page's time only moves when run, so it runs in slices until they are played
          let played = null;
          void page
            .evaluate((s) => window.__sandbox.play(s), spec.steps)
            .then(
              (p) => (played = p),
              (e) => (played = [e.message]),
            );
          for (let t = 0; !played; t += 100) {
            if (t > playLimit(spec)) throw new Error(stuck);
            await page.clock.runFor(100);
          }
          errors.push(...played);
        }
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
    // a spec that failed leaves no raw recording behind in the temp folder (a saved clip already deleted its own)
    await page
      .video()
      ?.delete()
      .catch(() => {}); // best effort: a clip that failed in saveClip already deleted it
  }
  if (clips.length) await writeManifest(clips);
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
async function until(ready, errors) {
  for (let t = 0; !(await ready()); t += 200) {
    if (t > TIMEOUT) throw new Error(`the sandbox did not get ready${errors.length ? `: ${errors.join('; ')}` : ''}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

// <out>/<name>.webm from the raw recording, cut to start just before the first step (the page's load is in the file);
// ffmpeg also gives an .mp4 that plays anywhere. Without ffmpeg the raw file stays whole and the manifest says where to cut
async function saveClip(video, name, from) {
  const webm = join(values.out, `${name}.webm`);
  if (!ffmpeg) {
    await video.saveAs(webm);
    await video.delete();
    console.log(`ok   ${webm} (no ffmpeg: the action starts at ${from.toFixed(1)} s)`);
    return { file: basename(webm), start: Number(from.toFixed(2)) };
  }
  const raw = join(tmpdir(), `${name}-${Date.now()}.webm`);
  await video.saveAs(raw);
  await video.delete();
  const cut = ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-i', raw, '-an'];
  const mp4 = join(values.out, `${name}.mp4`);
  try {
    execFileSync('ffmpeg', [...cut, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1', webm]);
    execFileSync('ffmpeg', [
      ...cut,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '23',
      '-movflags',
      '+faststart',
      mp4,
    ]);
  } catch (e) {
    // a clip reported as FAIL gets no manifest entry, so no half of it stays beside the good ones
    await Promise.all([webm, mp4].map((f) => rm(f, { force: true })));
    throw e;
  } finally {
    await unlink(raw);
  }
  console.log(`ok   ${webm} + .mp4`);
  return { file: basename(webm), mp4: basename(mp4) };
}

// <out>/clips.json: which spec and which game commit made each clip, for a before/after comparison. A clip recorded
// again replaces its entry; the other entries and keys stay
async function writeManifest(made) {
  const file = join(values.out, 'clips.json');
  const old = await readFile(file, 'utf8').then(JSON.parse, () => ({}));
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  const game = {
    commit: git('rev-parse', '--short', 'HEAD'),
    branch: git('branch', '--show-current'),
    // tracked files only: the clips just written (often inside the repo, as with --out clips) are not game changes
    dirty: !!git('status', '--porcelain', '--untracked-files=no'),
  };
  const recorded = new Date().toISOString();
  const now = made.map(({ name, spec, specFile, ...rest }) => ({
    name,
    ...rest,
    specFile: relative(process.cwd(), specFile).replaceAll('\\', '/'),
    spec,
    game,
    recorded,
  }));
  const all = [...(old.clips ?? []).filter((c) => !now.some((n) => n.name === c.name)), ...now];
  await writeFile(file, `${JSON.stringify({ ...old, clips: all }, null, 2)}\n`);
  console.log(`ok   ${file}`);
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
