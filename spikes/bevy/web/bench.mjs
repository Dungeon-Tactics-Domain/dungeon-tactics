// Medidor igual para os dois motores (Three.js e Bevy): embrulha requestAnimationFrame e as chamadas de desenho do
// WebGL2, sem depender de nada do motor. node web/bench.mjs <three|bevy> <url> <saida.json>
import { chromium } from 'file:///D:/Projetos/dungeon-tactics/node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'node:fs';

const [engine, url, out] = process.argv.slice(2);
const SECONDS = 6;
const SIZES = [0, 2, 3, 4];
const DEVICES = [
  { name: 'desktop 1920x1080', viewport: { width: 1920, height: 1080 }, dpr: 1, mobile: false, throttle: 1 },
  { name: 'celular 393x852 CPU 4x', viewport: { width: 393, height: 852 }, dpr: 3, mobile: true, throttle: 4 },
];

const HOOK = () => {
  const s = (window.__bench = { frames: [], cpu: [], gpu: [], calls: 0, tris: 0, perFrame: null, firstDraw: 0, ready: 0, api: 'nenhum' });
  let gl = null, ext = null, busy = false;
  const pending = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && type === 'webgl2' && !gl) { gl = ctx; ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); s.api = 'webgl2'; }
    if (ctx && type === 'webgpu') s.api = 'webgpu';
    return ctx;
  };
  const P = WebGL2RenderingContext.prototype;
  const count = (name, tri) => {
    const orig = P[name];
    P[name] = function (...a) {
      s.calls++;
      if (a[0] === 4) s.tris += tri(a);
      if (!s.firstDraw) s.firstDraw = performance.now();
      return orig.apply(this, a);
    };
  };
  count('drawArrays', (a) => a[2] / 3);
  count('drawElements', (a) => a[1] / 3);
  count('drawArraysInstanced', (a) => (a[2] / 3) * a[3]);
  count('drawElementsInstanced', (a) => (a[1] / 3) * a[4]);
  for (const k of ['log', 'info', 'debug']) {
    const orig = console[k];
    console[k] = (...a) => { if (!s.ready && a.some((x) => String(x).includes('DT_READY'))) s.ready = performance.now(); orig(...a); };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (busy) return cb(t);
    busy = true;
    s.calls = 0; s.tris = 0;
    let q = null;
    if (ext && pending.length < 8) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const t0 = performance.now();
    try { cb(t); } finally {
      s.cpu.push(performance.now() - t0);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); }
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];
        if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) { s.gpu.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(p); pending.splice(i, 1); }
      }
      s.frames.push(performance.now());
      s.perFrame = { calls: s.calls, triangles: Math.round(s.tris) };
      busy = false;
    }
  });
};

const stats = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return { avg: a.reduce((x, y) => x + y, 0) / a.length, p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))], max: s[s.length - 1] };
};

const flags = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-privileged-webgl-extensions', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-unsafe-webgpu'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: flags });
const results = [];
for (const dev of DEVICES) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: dev.mobile, hasTouch: dev.mobile });
    await ctx.addInitScript(HOOK);
    if (engine === 'three') await ctx.addInitScript((size) => {
      localStorage.removeItem('dt:battle');
      localStorage.setItem('dt:pixel', JSON.stringify({ size, outline: true, palette: false, snap: true }));
    }, size);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await ctx.newCDPSession(page);
    if (dev.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.throttle });
    await page.goto(engine === 'bevy' ? `${url}?px=${size}` : url, { waitUntil: 'load' });
    // pronto = todos os bonecos na cena: no Bevy o programa avisa no console; no Three o primeiro desenho já vem depois da carga
    await page.waitForFunction((bevy) => (bevy ? window.__bench.ready : window.__bench.firstDraw) > 0, engine === 'bevy', { timeout: 120000 });
    await page.waitForTimeout(3000); // aquece (shaders compilados, sombras prontas)
    await page.evaluate(() => { const s = window.__bench; s.frames = []; s.cpu = []; s.gpu = []; });
    await page.waitForTimeout(SECONDS * 1000);
    const b = await page.evaluate(() => { const s = window.__bench; return { frames: s.frames, cpu: s.cpu, gpu: s.gpu, perFrame: s.perFrame, firstDraw: s.firstDraw, ready: s.ready, api: s.api }; });
    const dts = b.frames.slice(1).map((t, i) => t - b.frames[i]);
    const row = {
      engine, device: dev.name, px: size, api: b.api, fps: dts.length / (dts.reduce((x, y) => x + y, 0) / 1000),
      frameMs: stats(dts), cpuMs: stats(b.cpu), gpuMs: stats(b.gpu), perFrame: b.perFrame,
      readyMs: engine === 'bevy' ? b.ready : b.firstDraw, firstDrawMs: b.firstDraw, errors,
    };
    results.push(row);
    console.log(`${engine} | ${dev.name} | px ${size} | ${b.api} | ${row.fps.toFixed(1)} fps | p95 ${row.frameMs.p95.toFixed(1)} ms | CPU ${row.cpuMs.avg.toFixed(2)} ms | GPU ${row.gpuMs ? row.gpuMs.avg.toFixed(2) + ' ms' : 'sem medida'} | calls ${b.perFrame?.calls} | tri ${b.perFrame?.triangles} | pronto ${row.readyMs.toFixed(0)} ms | erros ${errors.length}`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(out, JSON.stringify(results, null, 2));
